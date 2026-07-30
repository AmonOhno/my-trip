# My Trip — 旅の自動記録アプリ

「旅開始」を押すだけで、訪れたスポット・移動の足取り・歩数(iOS)を自動記録。
「旅終了」したら、いつでも地図とタイムラインで当時の足取りを見返せます。

- **完全無料構成**: サーバーなし・全データ端末内保存。地図はOpenStreetMap(Web)/ Google Maps SDK(iOS・無制限無料SKUのみ)
- **Web版**: TypeScript + React (PWA)
- **iOS版**: SwiftUI(App Store配信対応、バックグラウンド記録 + HealthKit歩数)

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/01_requirements.md](docs/01_requirements.md) | 要件定義書 |
| [docs/02_architecture.md](docs/02_architecture.md) | アーキテクチャ設計書(滞在検出アルゴリズム含む) |
| [docs/03_screens.md](docs/03_screens.md) | 画面設計書・デザイントークン |
| [docs/04_ios_distribution.md](docs/04_ios_distribution.md) | App Store配信手順 |

## Web版の起動

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm run test       # コアロジックのユニットテスト
npm run build      # 本番ビルド (dist/)
```

静的ホスティング(GitHub Pages等)にそのままデプロイ可能。サブパス配信時は
`npm run build -- --base=/my-trip/` のように base を指定します。

> Web版の制約: ブラウザ仕様により、タブが前面にある間のみ記録できます。
> 画面を閉じても記録し続けたい場合はiOS版を使ってください。

## iOS版の起動

```bash
open ios/MyTrip/MyTrip.xcodeproj
```

Xcode 16以上で開き、Signing の Team と Bundle ID を自分のものに変更して実行。
配信手順の詳細は [docs/04_ios_distribution.md](docs/04_ios_distribution.md)。

### Google マップを使う場合(任意)

APIキーを設定すると地図が Google マップになります。**未設定でもそのまま動きます**(MapKitで描画)。

```bash
cp ios/MyTrip/MyTrip/Secrets.example.plist ios/MyTrip/MyTrip/Secrets.plist
# Secrets.plist の GoogleMapsAPIKey に自分のキーを書く(このファイルは .gitignore 済み)
```

キーは [Google Cloud コンソール](https://console.cloud.google.com/)で「Maps SDK for iOS」を有効化して発行します。
地図表示のSKU「Maps SDK」は**無制限・無料**です。従量課金になる Geocoding API / Places API は本アプリでは使いません
(スポット名の取得は Apple の CLGeocoder のまま)。キーには iOS アプリ制限とAPI制限をかけてください。

## 仕組み(コア)

1. 記録中は位置情報を定期取得し、軌跡として保存(精度の悪い点・微小移動は間引き)
2. **半径80m以内に10分以上**とどまると「スポット」として自動確定(Stay Point Detection)
3. スポット名は無料の逆ジオコーディングで自動付与(Web: OSM Nominatim / iOS: CLGeocoder)。後から手動編集可
4. 旅終了時、iOSはHealthKitからその期間の歩数を取得して旅に添付
5. タイムライン(移動→滞在→移動…)はスポットと軌跡から表示時に導出

検出アルゴリズムはWeb ([web/src/core/stayPoint.ts](web/src/core/stayPoint.ts)) とiOS
([ios/MyTrip/MyTrip/Services/StayPointDetector.swift](ios/MyTrip/MyTrip/Services/StayPointDetector.swift)) で同一。
エクスポートJSON (`my-trip-export/v1`) はWeb⇔iOSで互換です。

## プライバシー

位置情報・健康データは端末外に送信しません(スポット名の自動取得で座標のみをNominatim/Appleに送信。設定でオフ可)。
