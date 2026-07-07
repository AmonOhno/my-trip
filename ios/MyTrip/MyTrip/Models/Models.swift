import Foundation
import SwiftData

// Web版と共通のドメインモデル (docs/02_architecture.md §4)。
// リレーションではなく tripId 参照で持ち、エクスポートJSON互換を保つ。

enum TripStatus: String, Codable {
    case recording
    case done
}

@Model
final class Trip {
    @Attribute(.unique) var id: UUID
    var title: String
    var note: String
    var startedAt: Date
    var endedAt: Date?
    var distanceM: Double
    var steps: Int?
    var statusRaw: String

    var status: TripStatus {
        get { TripStatus(rawValue: statusRaw) ?? .done }
        set { statusRaw = newValue.rawValue }
    }

    init(id: UUID = UUID(), title: String, startedAt: Date) {
        self.id = id
        self.title = title
        self.note = ""
        self.startedAt = startedAt
        self.endedAt = nil
        self.distanceM = 0
        self.steps = nil
        self.statusRaw = TripStatus.recording.rawValue
    }
}

@Model
final class TripPoint {
    var tripId: UUID
    var lat: Double
    var lng: Double
    var accuracyM: Double
    var timestamp: Date

    init(tripId: UUID, lat: Double, lng: Double, accuracyM: Double, timestamp: Date) {
        self.tripId = tripId
        self.lat = lat
        self.lng = lng
        self.accuracyM = accuracyM
        self.timestamp = timestamp
    }
}

enum SpotNameSource: String, Codable {
    case geocode
    case manual
    case placeholder
}

@Model
final class Spot {
    @Attribute(.unique) var id: UUID
    var tripId: UUID
    var lat: Double
    var lng: Double
    var name: String
    var note: String
    var arrivedAt: Date
    var departedAt: Date?
    var nameSourceRaw: String

    var nameSource: SpotNameSource {
        get { SpotNameSource(rawValue: nameSourceRaw) ?? .manual }
        set { nameSourceRaw = newValue.rawValue }
    }

    init(id: UUID = UUID(), tripId: UUID, lat: Double, lng: Double, name: String, arrivedAt: Date, departedAt: Date?) {
        self.id = id
        self.tripId = tripId
        self.lat = lat
        self.lng = lng
        self.name = name
        self.note = ""
        self.arrivedAt = arrivedAt
        self.departedAt = departedAt
        self.nameSourceRaw = SpotNameSource.placeholder.rawValue
    }
}
