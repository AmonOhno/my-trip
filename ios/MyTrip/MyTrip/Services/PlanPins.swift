import CoreLocation
import Foundation

/// 地図に立てるピン。番号は一覧での表示順(1始まり)に揃える
struct PlanPin: Identifiable, Equatable {
    let id: UUID
    let name: String
    let latitude: Double
    let longitude: Double
    let number: Int

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

/// Web版 `web/src/core/plan.ts` の `planPins` と同一ルール(両OSで揃える)。
/// 位置のない場所は地図に出ないが、番号は一覧の並びのままなので
/// 「3番の場所」が一覧と地図で一致する。
enum PlanPins {
    static func make(from items: [PlanItem]) -> [PlanPin] {
        let sorted = items.sorted { $0.order < $1.order }
        var pins: [PlanPin] = []
        for (index, item) in sorted.enumerated() {
            guard let lat = item.lat, let lng = item.lng else { continue }
            pins.append(PlanPin(
                id: item.id,
                name: item.name,
                latitude: lat,
                longitude: lng,
                number: index + 1
            ))
        }
        return pins
    }
}
