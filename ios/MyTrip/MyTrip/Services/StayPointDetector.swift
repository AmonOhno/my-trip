import CoreLocation
import Foundation

/// 滞在スポット検出。Web版 stayPoint.ts と同一のアルゴリズム・パラメータ
/// (docs/02_architecture.md §2)。
struct StayEvent {
    var coordinate: CLLocationCoordinate2D
    var arrivedAt: Date
    /// nil = 滞在継続中(暫定スポット)
    var departedAt: Date?
    /// 既発火の暫定スポットの更新なら true
    var isUpdate: Bool
}

final class StayPointDetector {
    static let stayRadiusM: CLLocationDistance = 80
    static let stayMinDuration: TimeInterval = 10 * 60
    static let mergeGapM: CLLocationDistance = 120

    private struct Point {
        var location: CLLocation
        var timestamp: Date
    }

    private var anchor: Point?
    private var cluster: [Point] = []
    private var emitted = false
    private var lastStay: CLLocation?

    func addPoint(location: CLLocation, timestamp: Date) -> StayEvent? {
        let point = Point(location: location, timestamp: timestamp)
        guard let anchor else {
            startCluster(point)
            return nil
        }

        if anchor.location.distance(from: location) <= Self.stayRadiusM {
            cluster.append(point)
            let duration = timestamp.timeIntervalSince(cluster[0].timestamp)
            if duration >= Self.stayMinDuration {
                let isUpdate = emitted
                emitted = true
                return buildEvent(departedAt: nil, isUpdate: isUpdate)
            }
            return nil
        }

        // 半径から出た
        if emitted {
            let event = buildEvent(departedAt: cluster[cluster.count - 1].timestamp, isUpdate: true)
            lastStay = CLLocation(latitude: event.coordinate.latitude, longitude: event.coordinate.longitude)
            startCluster(point)
            return event
        }
        startCluster(point)
        return nil
    }

    /// 旅終了時に呼ぶ。滞在継続中なら最終確定イベントを返す
    func finish(endedAt: Date) -> StayEvent? {
        guard anchor != nil, emitted else { return nil }
        let event = buildEvent(departedAt: endedAt, isUpdate: true)
        reset()
        return event
    }

    /// 直前の確定スポットと近すぎる場合の結合判定(GPS揺らぎ対策)
    func shouldMergeWithLast(coordinate: CLLocationCoordinate2D) -> Bool {
        guard let lastStay else { return false }
        let loc = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        return lastStay.distance(from: loc) <= Self.mergeGapM
    }

    func reset() {
        anchor = nil
        cluster = []
        emitted = false
        lastStay = nil
    }

    private func startCluster(_ point: Point) {
        anchor = point
        cluster = [point]
        emitted = false
    }

    private func buildEvent(departedAt: Date?, isUpdate: Bool) -> StayEvent {
        var lat = 0.0
        var lng = 0.0
        for p in cluster {
            lat += p.location.coordinate.latitude
            lng += p.location.coordinate.longitude
        }
        let n = Double(cluster.count)
        return StayEvent(
            coordinate: CLLocationCoordinate2D(latitude: lat / n, longitude: lng / n),
            arrivedAt: cluster[0].timestamp,
            departedAt: departedAt,
            isUpdate: isUpdate
        )
    }
}
