import Foundation
import GoogleMaps

/// Google Maps SDK for iOS のAPIキー管理 (Issue #6)。
///
/// コスト0円制約の守り方:
/// 使うのは地図表示の「Maps SDK (Mobile Native Dynamic Maps)」SKUだけで、これは無制限・無料。
/// 逆ジオコーディングは従量課金SKU(Geocoding API)になるため導入せず、CLGeocoder のまま残している。
/// つまりアプリから課金の発生する経路が存在しない。
///
/// APIキーはリポジトリに含めない。未設定でも地図はMapKitへフォールバックするので、
/// クローンしただけの状態でもビルド・実行・UIテストが通る。
enum GoogleMapsConfig {
    /// `Secrets.plist` / `Info.plist` 内のキー名
    private static let plistKey = "GoogleMapsAPIKey"
    /// シミュレータ検証用の環境変数名
    private static let environmentKey = "GOOGLE_MAPS_API_KEY"

    /// Google Mapsで描画できる状態か。false ならMapKitで描画する
    private(set) static var isEnabled = false

    /// アプリ起動時に一度だけ呼ぶ。キーが無ければ何もしない
    static func start() {
        guard !isEnabled, let key = apiKey(), !key.isEmpty else { return }
        isEnabled = GMSServices.provideAPIKey(key)
    }

    /// 1. Secrets.plist(.gitignore済み) → 2. Info.plist → 3. 環境変数 の順に探す
    private static func apiKey() -> String? {
        if let url = Bundle.main.url(forResource: "Secrets", withExtension: "plist"),
           let data = try? Data(contentsOf: url),
           let plist = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
           let key = plist[plistKey] as? String,
           !key.isEmpty {
            return key
        }
        if let key = Bundle.main.object(forInfoDictionaryKey: plistKey) as? String, !key.isEmpty {
            return key
        }
        return ProcessInfo.processInfo.environment[environmentKey]
    }
}
