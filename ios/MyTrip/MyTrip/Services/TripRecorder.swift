import CoreLocation
import Foundation
import SwiftData

/// 記録セッションの状態機械。CoreLocationのバックグラウンド更新を受けて
/// 軌跡保存・滞在スポット検出・逆ジオコーディングを行う。
@MainActor
final class TripRecorder: NSObject, ObservableObject {
    /// 保存する軌跡ポイントの間引き条件(Web版 sampling.ts と共通)
    private static let minPointGapM: CLLocationDistance = 10
    private static let minPointGap: TimeInterval = 15
    private static let maxAccuracyM: CLLocationDistance = 80
    /// これ以上の推定速度は乗り物(電車・車・飛行機など)での移動とみなす
    private static let vehicleSpeedMps: Double = 8
    /// 乗り物移動中の保存間隔。書き込み頻度を下げて発熱・電池消費を抑える (#9)
    private static let vehicleMinPointGap: TimeInterval = 30

    @Published private(set) var currentTrip: Trip?
    @Published private(set) var spots: [Spot] = []
    @Published private(set) var distanceM: Double = 0
    @Published private(set) var lastLocation: CLLocation?
    @Published private(set) var errorMessage: String?

    var isRecording: Bool { currentTrip != nil }

    private let manager = CLLocationManager()
    private let geocoder = CLGeocoder()
    private let detector = StayPointDetector()
    private var context: ModelContext?
    private var lastSavedLocation: CLLocation?
    private var lastSavedAt: Date?
    private var currentSpot: Spot?
    private var lastConfirmedSpot: Spot?
    private var spotSeq = 0

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 20
        manager.pausesLocationUpdatesAutomatically = false
        manager.activityType = .fitness
    }

    func configure(context: ModelContext) {
        self.context = context
        restoreIfNeeded()
    }

    /// 起動時: 中断された記録セッションを復元する (F-06)
    private func restoreIfNeeded() {
        guard let context, currentTrip == nil else { return }
        let recording = TripStatus.recording.rawValue
        var descriptor = FetchDescriptor<Trip>(predicate: #Predicate { $0.statusRaw == recording })
        descriptor.fetchLimit = 1
        guard let trip = try? context.fetch(descriptor).first else { return }

        let points = fetchPoints(tripId: trip.id)
        let existing = fetchSpots(tripId: trip.id)
        spotSeq = existing.count
        detector.reset()
        // 検出は決定的なので全ポイント再投入で内部状態を復元し、既存スポットは到着時刻で照合
        let byArrival = Dictionary(grouping: existing, by: { $0.arrivedAt })
        for p in points {
            let loc = CLLocation(latitude: p.lat, longitude: p.lng)
            if let event = detector.addPoint(location: loc, timestamp: p.timestamp) {
                if let match = byArrival[event.arrivedAt]?.first {
                    if event.departedAt != nil {
                        lastConfirmedSpot = match
                        currentSpot = nil
                    } else {
                        currentSpot = match
                    }
                } else {
                    apply(event: event, tripId: trip.id)
                }
            }
        }
        if let last = points.last {
            lastSavedLocation = CLLocation(latitude: last.lat, longitude: last.lng)
            lastSavedAt = last.timestamp
        }
        currentTrip = trip
        distanceM = trip.distanceM
        spots = fetchSpots(tripId: trip.id)
        startUpdating()
    }

    /// 記録を開始する。計画から開始する場合はタイトルを引き継ぐ
    @discardableResult
    func start(title: String? = nil) -> Trip? {
        guard let context, currentTrip == nil else { return nil }
        let now = Date()
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.dateFormat = "yyyy/M/d"
        let trimmed = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let trip = Trip(title: trimmed.isEmpty ? "\(formatter.string(from: now)) の旅" : trimmed, startedAt: now)
        context.insert(trip)
        try? context.save()

        detector.reset()
        lastSavedLocation = nil
        lastSavedAt = nil
        currentSpot = nil
        lastConfirmedSpot = nil
        spotSeq = 0
        currentTrip = trip
        spots = []
        distanceM = 0
        errorMessage = nil
        startUpdating()
        return trip
    }

    func stop() async -> Trip? {
        guard let context, let trip = currentTrip else { return nil }
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false

        let endedAt = Date()
        if let event = detector.finish(endedAt: endedAt) {
            apply(event: event, tripId: trip.id)
        }
        trip.endedAt = endedAt
        trip.distanceM = distanceM
        trip.status = .done
        trip.steps = await HealthService.shared.fetchSteps(from: trip.startedAt, to: endedAt)
        try? context.save()

        currentTrip = nil
        spots = []
        distanceM = 0
        lastLocation = nil
        return trip
    }

    // MARK: - 位置更新

    private func startUpdating() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            errorMessage = "位置情報の利用が許可されていません。設定アプリから許可してください。"
        default:
            break
        }
        // バックグラウンド継続にはAlways権限が望ましい(なくても前面では記録できる)
        if manager.authorizationStatus == .authorizedWhenInUse {
            manager.requestAlwaysAuthorization()
        }
        if manager.authorizationStatus == .authorizedAlways {
            manager.allowsBackgroundLocationUpdates = true
        }
        manager.startUpdatingLocation()
    }

    private func handle(location: CLLocation) {
        guard let context, let trip = currentTrip else { return }
        guard location.horizontalAccuracy >= 0, location.horizontalAccuracy <= Self.maxAccuracyM else { return }

        if !shouldSave(location: location) { return }

        if let prevLoc = lastSavedLocation {
            distanceM += prevLoc.distance(from: location)
        }
        let point = TripPoint(
            tripId: trip.id,
            lat: location.coordinate.latitude,
            lng: location.coordinate.longitude,
            accuracyM: location.horizontalAccuracy,
            timestamp: location.timestamp
        )
        context.insert(point)
        lastSavedLocation = location
        lastSavedAt = location.timestamp
        lastLocation = location
        trip.distanceM = distanceM

        if let event = detector.addPoint(location: location, timestamp: location.timestamp) {
            apply(event: event, tripId: trip.id)
            // スポットが変化したときだけ再フェッチする(毎ポイントの全件フェッチは発熱の一因 #9)
            spots = fetchSpots(tripId: trip.id)
        }
        try? context.save()
        errorMessage = nil
    }

    /// 新しいポイントを保存すべきか判定する(Web版 sampling.ts の shouldSavePoint と同一ロジック)。
    /// - 徒歩相当: 前回保存点から10m以上 または 15秒以上で保存
    /// - 乗り物相当(推定速度 8m/s 以上): 30秒間隔でのみ保存
    /// 判定は保存済みポイントのみから決まるため、復元(F-06)の決定性を壊さない。
    private func shouldSave(location: CLLocation) -> Bool {
        guard let prevLoc = lastSavedLocation, let prevAt = lastSavedAt else { return true }
        let dist = prevLoc.distance(from: location)
        let dt = location.timestamp.timeIntervalSince(prevAt)
        let speedMps = dt > 0 ? dist / dt : .infinity
        if speedMps >= Self.vehicleSpeedMps {
            return dt >= Self.vehicleMinPointGap
        }
        return dist >= Self.minPointGapM || dt >= Self.minPointGap
    }

    private func apply(event: StayEvent, tripId: UUID) {
        guard let context else { return }
        if event.isUpdate, let spot = currentSpot {
            spot.lat = event.coordinate.latitude
            spot.lng = event.coordinate.longitude
            spot.departedAt = event.departedAt
            if event.departedAt != nil {
                lastConfirmedSpot = spot
                currentSpot = nil
            }
        } else if !event.isUpdate {
            // 直前の確定スポットのすぐ近くなら結合(GPS揺らぎで一瞬離れたケース)
            if let last = lastConfirmedSpot, detector.shouldMergeWithLast(coordinate: event.coordinate) {
                last.departedAt = event.departedAt
                currentSpot = last
                lastConfirmedSpot = nil
            } else {
                spotSeq += 1
                let spot = Spot(
                    tripId: tripId,
                    lat: event.coordinate.latitude,
                    lng: event.coordinate.longitude,
                    name: "スポット \(spotSeq)",
                    arrivedAt: event.arrivedAt,
                    departedAt: event.departedAt
                )
                context.insert(spot)
                currentSpot = spot
                resolveName(for: spot)
            }
        }
        try? context.save()
    }

    /// CLGeocoderでスポット名を後付けする。失敗しても記録は成立する
    private func resolveName(for spot: Spot) {
        let location = CLLocation(latitude: spot.lat, longitude: spot.lng)
        Task { [weak self] in
            guard let self else { return }
            guard let placemark = try? await self.geocoder.reverseGeocodeLocation(location, preferredLocale: Locale(identifier: "ja_JP")).first else { return }
            let name = placemark.areasOfInterest?.first ?? placemark.name ?? placemark.subLocality
            if let name, spot.nameSource == .placeholder {
                spot.name = name
                spot.nameSource = .geocode
                try? self.context?.save()
                if let tripId = self.currentTrip?.id {
                    self.spots = self.fetchSpots(tripId: tripId)
                }
            }
        }
    }

    // MARK: - フェッチ

    private func fetchPoints(tripId: UUID) -> [TripPoint] {
        guard let context else { return [] }
        let descriptor = FetchDescriptor<TripPoint>(
            predicate: #Predicate { $0.tripId == tripId },
            sortBy: [SortDescriptor(\.timestamp)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    private func fetchSpots(tripId: UUID) -> [Spot] {
        guard let context else { return [] }
        let descriptor = FetchDescriptor<Spot>(
            predicate: #Predicate { $0.tripId == tripId },
            sortBy: [SortDescriptor(\.arrivedAt)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }
}

extension TripRecorder: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            for location in locations {
                self.handle(location: location)
            }
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            guard self.isRecording else { return }
            self.startUpdating()
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            guard self.isRecording else { return }
            self.errorMessage = "位置情報を取得できません。屋外など電波の良い場所でお試しください。"
        }
    }
}
