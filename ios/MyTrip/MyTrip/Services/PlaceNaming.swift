import CoreLocation
import Foundation

/// 座標から場所名を引く (CLGeocoder・Apple純正・無料)。
/// 名前が取れなくても呼び出し側は手入力で続行できるため、失敗は nil で返す。
/// スポット名の自動付与は `TripRecorder.resolveName(for:)` が同じ優先順位で行う。
enum PlaceNaming {
    private static let geocoder = CLGeocoder()

    static func name(at coordinate: CLLocationCoordinate2D) async -> String? {
        let location = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        guard let placemark = try? await geocoder.reverseGeocodeLocation(
            location,
            preferredLocale: Locale(identifier: "ja_JP")
        ).first else { return nil }
        return placemark.areasOfInterest?.first ?? placemark.name ?? placemark.subLocality
    }
}
