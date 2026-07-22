import Foundation
import SwiftData

/// Web版と共通のエクスポート形式 "my-trip-export/v1"(時刻はepochミリ秒)
enum ExportService {
    struct ExportFile: Codable {
        var format: String
        var exportedAt: Int64
        var trips: [TripDTO]
        var points: [PointDTO]
        var spots: [SpotDTO]
    }

    struct TripDTO: Codable {
        var id: String
        var title: String
        var note: String
        var startedAt: Int64
        var endedAt: Int64?
        var distanceM: Double
        var steps: Int?
        var status: String
    }

    struct PointDTO: Codable {
        var tripId: String
        var lat: Double
        var lng: Double
        var accuracyM: Double
        var timestamp: Int64
    }

    struct SpotDTO: Codable {
        var id: String
        var tripId: String
        var lat: Double
        var lng: Double
        var name: String
        var note: String
        var arrivedAt: Int64
        var departedAt: Int64?
        var nameSource: String
    }

    private static func ms(_ date: Date) -> Int64 { Int64(date.timeIntervalSince1970 * 1000) }
    private static func date(_ ms: Int64) -> Date { Date(timeIntervalSince1970: Double(ms) / 1000) }

    static func export(context: ModelContext) throws -> URL {
        let trips = try context.fetch(FetchDescriptor<Trip>(sortBy: [SortDescriptor(\.startedAt, order: .reverse)]))
        let points = try context.fetch(FetchDescriptor<TripPoint>(sortBy: [SortDescriptor(\.timestamp)]))
        let spots = try context.fetch(FetchDescriptor<Spot>(sortBy: [SortDescriptor(\.arrivedAt)]))

        let file = ExportFile(
            format: "my-trip-export/v1",
            exportedAt: ms(Date()),
            trips: trips.map {
                TripDTO(id: $0.id.uuidString.lowercased(), title: $0.title, note: $0.note,
                        startedAt: ms($0.startedAt), endedAt: $0.endedAt.map(ms),
                        distanceM: $0.distanceM, steps: $0.steps, status: $0.statusRaw)
            },
            points: points.map {
                PointDTO(tripId: $0.tripId.uuidString.lowercased(), lat: $0.lat, lng: $0.lng,
                         accuracyM: $0.accuracyM, timestamp: ms($0.timestamp))
            },
            spots: spots.map {
                SpotDTO(id: $0.id.uuidString.lowercased(), tripId: $0.tripId.uuidString.lowercased(),
                        lat: $0.lat, lng: $0.lng, name: $0.name, note: $0.note,
                        arrivedAt: ms($0.arrivedAt), departedAt: $0.departedAt.map(ms),
                        nameSource: $0.nameSourceRaw)
            }
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(file)
        let stamp = Date().formatted(.iso8601.year().month().day().dateSeparator(.dash))
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("my-trip-export-\(stamp).json")
        try data.write(to: url)
        return url
    }

    /// 同一idの旅は総入れ替えで取り込む。取り込んだ旅の数を返す
    @discardableResult
    static func importData(_ data: Data, context: ModelContext) throws -> Int {
        let file = try JSONDecoder().decode(ExportFile.self, from: data)
        guard file.format == "my-trip-export/v1" else {
            throw NSError(domain: "MyTrip", code: 1, userInfo: [NSLocalizedDescriptionKey: "対応していないファイル形式です。"])
        }

        for dto in file.trips {
            guard let id = UUID(uuidString: dto.id) else { continue }
            try deleteTrip(id: id, context: context)
            let trip = Trip(id: id, title: dto.title, startedAt: date(dto.startedAt))
            trip.note = dto.note
            trip.endedAt = dto.endedAt.map(date) ?? date(dto.startedAt)
            trip.distanceM = dto.distanceM
            trip.steps = dto.steps
            trip.status = .done
            context.insert(trip)
        }
        for dto in file.points {
            guard let tripId = UUID(uuidString: dto.tripId) else { continue }
            context.insert(TripPoint(tripId: tripId, lat: dto.lat, lng: dto.lng,
                                     accuracyM: dto.accuracyM, timestamp: date(dto.timestamp)))
        }
        for dto in file.spots {
            guard let id = UUID(uuidString: dto.id), let tripId = UUID(uuidString: dto.tripId) else { continue }
            let spot = Spot(id: id, tripId: tripId, lat: dto.lat, lng: dto.lng,
                            name: dto.name, arrivedAt: date(dto.arrivedAt), departedAt: dto.departedAt.map(date))
            spot.note = dto.note
            spot.nameSourceRaw = dto.nameSource
            context.insert(spot)
        }
        try context.save()
        return file.trips.count
    }

    static func deleteTrip(id: UUID, context: ModelContext) throws {
        try context.delete(model: TripPoint.self, where: #Predicate { $0.tripId == id })
        try context.delete(model: Spot.self, where: #Predicate { $0.tripId == id })
        try context.delete(model: TripPhoto.self, where: #Predicate { $0.tripId == id })
        try context.delete(model: Trip.self, where: #Predicate { $0.id == id })
        // 削除した旅に紐づく計画は「未実行」へ戻す(参照切れ防止)
        let linked = try context.fetch(FetchDescriptor<TripPlan>(predicate: #Predicate { $0.tripId == id }))
        for plan in linked {
            plan.tripId = nil
        }
        try context.save()
    }
}
