# My Trip — アーキテクチャ設計書

## 1. 全体構成

サーバーレス(バックエンドなし)のローカルファースト構成。両プラットフォームは同一のドメインモデル・同一のスポット検出アルゴリズム・互換のエクスポートJSONを持つ。

```
┌──────────────── Web (PWA) ────────────────┐   ┌──────────────── iOS ────────────────┐
│ React + TypeScript + Vite                 │   │ SwiftUI                             │
│                                           │   │                                     │
│  UI (pages/components)                    │   │  Views                              │
│    │                                      │   │    │                                │
│  TripRecorder (状態機械)                   │   │  TripRecorder (ObservableObject)    │
│    ├─ Geolocation watchPosition           │   │    ├─ CoreLocation (background)     │
│    ├─ StayPointDetector  ←── 共通ロジック ──┼───┼──→ StayPointDetector (同一アルゴリズム)│
│    └─ ReverseGeocoder (Nominatim+cache)   │   │    ├─ ReverseGeocoder (CLGeocoder)  │
│    │                                      │   │    └─ HealthKit (歩数)              │
│  Storage: IndexedDB (idb)                 │   │  Storage: SwiftData                 │
│  Map: Leaflet + OSM tiles                 │   │  Map: Google Maps SDK (→MapKit)     │
└───────────────────────────────────────────┘   └─────────────────────────────────────┘
                    │                                         │
                    └────────── 共通エクスポートJSON ────────────┘
```

## 2. コアアルゴリズム: 滞在スポット検出 (Stay Point Detection)

軌跡ポイント列からリアルタイムに滞在を検出する。両OSで同一パラメータ・同一ロジック。

- **パラメータ**: `STAY_RADIUS_M = 80`(滞在半径)、`STAY_MIN_DURATION_MS = 10分`、`MERGE_GAP_M = 120`(直前スポットとの結合距離)
- **手順**(ポイント追加ごとに評価):
  1. 「候補アンカー」(滞在候補の起点)を保持する
  2. 新ポイントがアンカーから `STAY_RADIUS_M` 以内 → 候補継続。滞在時間が閾値を超えたら **暫定スポット** を発火(1回だけ)
  3. 半径を出たら: 暫定スポットが発火済みなら **確定**(退出時刻を記録)。未発火なら候補を破棄し、新ポイントを次のアンカーにする
  4. 確定スポットが直前スポットと `MERGE_GAP_M` 以内なら結合(GPS揺らぎ対策)
- スポット座標は滞在中ポイントの重心を用いる
- 旅終了時、進行中の滞在候補が閾値超過していれば最終スポットとして確定

距離計算はHaversine。高精度は不要(誤差<0.5%)。

## 3. 逆ジオコーディング(無料制約)

| | Web | iOS |
|---|---|---|
| API | OSM Nominatim (`/reverse`) | `CLGeocoder`(Apple、無料) |
| ポリシー | 1req/秒以下・結果キャッシュ・`User-Agent`相当のRefererはブラウザ既定 | レート制限は控えめに直列実行 |
| 失敗時 | 「スポット N」の仮名、後から手動編集可 | 同左 |

Nominatim呼び出しはキューで直列化し、失敗してもスポット記録自体は成立する(名前だけ後付け)。座標送信を望まないユーザー向けに設定でオフにできる。

## 3.5 地図描画とAPIキー(iOS / Issue #6)

iOSの地図は **Google Maps SDK for iOS**(`Views/TripMapView.swift`)。使用するのは地図表示SKU「Maps SDK (Mobile Native Dynamic Maps)」のみで、これは**無制限・無料**(月間キャップなし)。逆ジオコーディングを Geocoding API に置き換えると従量課金SKUになるため、**CLGeocoder のまま**にしている。結果としてアプリから課金が発生する経路は存在しない。

APIキーの扱い:

| 読み込み順 | 場所 |
|---|---|
| 1 | `ios/MyTrip/MyTrip/Secrets.plist` の `GoogleMapsAPIKey`(`.gitignore` 済み。`Secrets.example.plist` をコピーして作る) |
| 2 | `Info.plist` の `GoogleMapsAPIKey` |
| 3 | 環境変数 `GOOGLE_MAPS_API_KEY`(シミュレータ検証用) |

キーが見つからない場合は `GoogleMapsConfig.isEnabled == false` となり、**MapKit で描画**する。クローンしただけの状態でもビルド・実行・UIテストが通る。

`TripMapView` はどちらの実装でも同じ入力(軌跡・ピン・現在地追従・フォーカス)を受け取るため、呼び出し側は描画エンジンを意識しない。

## 4. データモデル(共通スキーマ)

エクスポートJSON(`my-trip-export/v1`)を正とする。

```ts
Trip {
  id: string (uuid)
  title: string            // 既定: "YYYY/MM/DD の旅"
  note: string
  startedAt: number (epoch ms)
  endedAt: number | null   // null = 記録中
  distanceM: number        // 軌跡から集計
  steps: number | null     // iOSのみ HealthKit
  status: "recording" | "done"
}
TrackPoint {
  tripId, lat, lng, accuracyM, timestamp
}
Spot {
  id, tripId, lat, lng,
  name: string, note: string,
  arrivedAt: number, departedAt: number | null,
  nameSource: "geocode" | "manual" | "placeholder"
}
```

- Web: IndexedDB に `trips` / `points` / `spots` の3ストア(`tripId` インデックス)。v2で `plans` / `planItems` を追加
- iOS: SwiftData の `@Model` 3クラス(同フィールド)+ ローカル専用モデル(TripPhoto / TripPlan / PlanItem)
- タイムラインの「移動セグメント」は保存せず、表示時にスポット列と軌跡から導出する(導出可能なものは保存しない)

### 4.1 旅の計画(ローカル専用・エクスポート対象外)

計画 (P-01〜P-05) は端末ローカルにのみ保存し、`my-trip-export/v1` には**含めない**(スキーマ不変)。

```ts
TripPlan {
  id: string (uuid)
  title: string
  note: string
  startDate: number   // 開始日のローカル0時 (epoch ms)
  endDate: number     // 終了日のローカル0時。startDate 以上
  createdAt: number
  tripId: string | null  // この計画から記録した旅。未実行は null
}
PlanItem {
  id, planId, name, note,
  order: number       // 表示順 (0始まり)
}
```

- 進行状態(これから / 期間中 / 過去)は保存せず、日単位で導出する。Web `core/plan.ts` の `planPhase` と iOS `TripPlan.phase(at:)` は同一ロジック(両OSで揃える)
- 「この計画で旅をはじめる」で記録開始時に計画タイトルを旅タイトルへ引き継ぎ、`tripId` を設定する
- 旅を削除したときは、紐づく計画の `tripId` を null に戻す(参照切れ防止)

## 5. 記録セッションのライフサイクル

```
idle → recording → done
```

- `recording` 状態はストレージに永続化(Web: trips.status / iOS: SwiftDataクエリ)。起動時に `recording` の旅があれば自動レジュームする(F-06)
- Web: `watchPosition` は `enableHighAccuracy: true`。同一地点の連続ポイントは間引き(前回から10m未満 かつ 15秒未満はスキップ)
- iOS: `allowsBackgroundLocationUpdates = true`、`pausesLocationUpdatesAutomatically = false`、`distanceFilter = 20`
- ポイント間引き(両OS共通、Web: `core/sampling.ts` / iOS: `TripRecorder.shouldSave`): 前回保存点からの推定速度が 8m/s 以上(電車・車・飛行機などの乗り物移動中)は30秒間隔でのみ保存し、記録中のストレージ書き込み頻度を抑える。徒歩相当では従来どおり「10m以上 または 15秒以上」で保存。判定は保存済みポイントのみに依存するため、復元(F-06)の決定性は保たれる

## 6. Web版 技術スタック

| 項目 | 選定 | 理由 |
|---|---|---|
| ビルド | Vite + React 19 + TypeScript (strict) | 無料・軽量・PWA化容易 |
| 地図 | Leaflet 1.9 + OSMタイル | 無料。react-leafletは使わず薄いフックで直接制御(依存削減) |
| DB | idb (IndexedDBラッパー) | 無料・軽量 |
| ルーティング | ハッシュベースの自前ルータ | 静的ホスティング(GitHub Pages)でリロード404を回避、依存削減 |
| PWA | 手書き manifest + Service Worker(タイルはキャッシュしない=OSMポリシー準拠) | プラグイン依存なし |
| テスト | Vitest(スポット検出・距離計算のユニットテスト) | コアロジックの担保 |

## 7. iOS版 技術スタック

| 項目 | 選定 |
|---|---|
| UI | SwiftUI (iOS 17+) |
| 位置 | CoreLocation(Always許可、Background Modes: location) |
| 地図 | Google Maps SDK for iOS(`TripMapView`。APIキー未設定時はMapKitへフォールバック) |
| Health | HealthKit(stepCount / distanceWalkingRunning の期間集計、読み取りのみ) |
| 保存 | SwiftData |
| プロジェクト | Xcode 16 形式(fileSystemSynchronizedGroups)— フォルダ同期でファイル追加が容易 |

## 8. ディレクトリ構成

```
my-trip/
├── docs/                  # 本ドキュメント群
├── web/                   # Web版 (TypeScript PWA)
│   ├── src/
│   │   ├── core/          # ドメインロジック(検出・距離・型・DB・ジオコーダ)
│   │   ├── pages/         # Home / Recording / TripList / TripDetail / Settings
│   │   ├── components/    # Map, Timeline, StatTile など
│   │   └── app/           # ルータ・テーマ
│   └── public/            # manifest, icons, sw.js
├── ios/MyTrip/            # iOS版 (SwiftUI)
│   ├── MyTrip.xcodeproj
│   └── MyTrip/            # Models / Services / Views
└── .claude/skills/        # UI系スキル(asset-simulatorから導入)
```

## 9. セキュリティ / プライバシー設計

- 位置データはローカル保存のみ。外部送信はNominatim逆ジオコーディングの座標のみ(設定で無効化可)
- 地図タイルの取得では表示中の範囲がタイル提供元(OSM / Google)に渡る。これは地図描画に不可避な通信で、記録した軌跡・スポットそのものは送信しない
- iOS: `NSLocationAlwaysAndWhenInUseUsageDescription` 等で用途を明記。HealthKitは読み取り専用
- エクスポートはユーザー操作時のみ・ローカルファイル生成のみ
