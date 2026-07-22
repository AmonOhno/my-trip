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
    /// アーカイブ日時。nil = 通常表示 (D-03)。エクスポートv1スキーマには含めない
    var archivedAt: Date?

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
        self.archivedAt = nil
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

/// 旅の計画 (P-01)。Web版 core/types.ts の TripPlan と共通フィールド。
/// 端末内にのみ保存し、エクスポートv1スキーマには含めない。
@Model
final class TripPlan {
    @Attribute(.unique) var id: UUID
    var title: String
    var note: String
    /// 開始日(その日の0時)
    var startDate: Date
    /// 終了日(その日の0時)。startDate 以上
    var endDate: Date
    var createdAt: Date
    /// この計画から記録した旅のID。未実行は nil
    var tripId: UUID?

    init(id: UUID = UUID(), title: String, startDate: Date, endDate: Date, createdAt: Date = Date()) {
        self.id = id
        self.title = title
        self.note = ""
        self.startDate = startDate
        self.endDate = endDate
        self.createdAt = createdAt
        self.tripId = nil
    }
}

/// 計画の進行状態(日単位で判定)。Web版 core/plan.ts の planPhase と同一ロジック
enum PlanPhase {
    case ongoing
    case upcoming
    case past
}

extension TripPlan {
    func phase(at now: Date = Date()) -> PlanPhase {
        let cal = Calendar.current
        let today = cal.startOfDay(for: now)
        if today < cal.startOfDay(for: startDate) { return .upcoming }
        if today > cal.startOfDay(for: endDate) { return .past }
        return .ongoing
    }
}

/// 計画の「行きたい場所」1件 (P-02)
@Model
final class PlanItem {
    @Attribute(.unique) var id: UUID
    var planId: UUID
    var name: String
    var note: String
    /// 一覧内の表示順 (0始まり)
    var order: Int

    init(id: UUID = UUID(), planId: UUID, name: String, order: Int) {
        self.id = id
        self.planId = planId
        self.name = name
        self.note = ""
        self.order = order
    }
}

/// 旅に添付する写真 (V-07)。端末内(SwiftData外部ストレージ)にのみ保存し、
/// エクスポートJSONには含めない(ローカルファースト・v1スキーマ不変)。
@Model
final class TripPhoto {
    @Attribute(.unique) var id: UUID
    var tripId: UUID
    @Attribute(.externalStorage) var imageData: Data
    var createdAt: Date

    init(id: UUID = UUID(), tripId: UUID, imageData: Data, createdAt: Date = Date()) {
        self.id = id
        self.tripId = tripId
        self.imageData = imageData
        self.createdAt = createdAt
    }
}
