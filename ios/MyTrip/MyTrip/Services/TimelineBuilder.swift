import CoreLocation
import Foundation

/// タイムライン(滞在→移動→滞在…)の導出。Web版 timeline.ts と同一の判定
enum TimelineSegment: Identifiable {
    case stay(Spot)
    case move(from: Date, to: Date, distanceM: Double)

    var id: String {
        switch self {
        case .stay(let spot): return spot.id.uuidString
        case .move(let from, _, _): return "move-\(from.timeIntervalSince1970)"
        }
    }
}

enum TimelineBuilder {
    static func build(trip: Trip, spots: [Spot], points: [TripPoint]) -> [TimelineSegment] {
        var segments: [TimelineSegment] = []
        var cursor = trip.startedAt

        for spot in spots {
            if spot.arrivedAt > cursor, let move = buildMove(from: cursor, to: spot.arrivedAt, points: points) {
                segments.append(move)
            }
            segments.append(.stay(spot))
            cursor = spot.departedAt ?? spot.arrivedAt
        }

        let end = trip.endedAt ?? Date()
        if end > cursor, let move = buildMove(from: cursor, to: end, points: points) {
            segments.append(move)
        }
        return segments
    }

    private static func buildMove(from: Date, to: Date, points: [TripPoint]) -> TimelineSegment? {
        let slice = points.filter { $0.timestamp >= from && $0.timestamp <= to }
        var distance = 0.0
        for i in 1..<max(slice.count, 1) {
            let a = CLLocation(latitude: slice[i - 1].lat, longitude: slice[i - 1].lng)
            let b = CLLocation(latitude: slice[i].lat, longitude: slice[i].lng)
            distance += a.distance(from: b)
        }
        // 数十mの揺らぎだけの「移動」はノイズなので表示しない
        if distance < 100, to.timeIntervalSince(from) < 3 * 60 { return nil }
        return .move(from: from, to: to, distanceM: distance)
    }
}

enum Formatters {
    static func distance(_ m: Double) -> String {
        m < 1000 ? "\(Int(m.rounded())) m" : String(format: "%.1f km", m / 1000)
    }

    static func duration(_ interval: TimeInterval) -> String {
        let totalMin = Int(interval / 60)
        let h = totalMin / 60
        let min = totalMin % 60
        if h == 0 { return "\(min)分" }
        return min > 0 ? "\(h)時間\(min)分" : "\(h)時間"
    }

    static func clock(_ date: Date) -> String {
        date.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).locale(Locale(identifier: "ja_JP")))
    }

    static func day(_ date: Date) -> String {
        date.formatted(.dateTime.year().month().day().weekday(.abbreviated).locale(Locale(identifier: "ja_JP")))
    }

    static func elapsed(_ interval: TimeInterval) -> String {
        let s = max(0, Int(interval))
        return String(format: "%02d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
    }
}
