# My Trip 開発ガイド

旅の足取りを自動記録するアプリ。Web版(TypeScript/React PWA)とiOS版(SwiftUI)の2実装。
要件・設計は docs/ を正とする。

## コマンド

```bash
# Web (web/)
npm run dev    # 開発サーバ :5173
npm run test   # vitest(コアロジック)
npm run build  # tsc + vite build

# iOS (ios/MyTrip/)
xcodebuild -project MyTrip.xcodeproj -scheme MyTrip \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```

## 絶対に守ること

- **コスト0円制約**: 有料API・課金サーバーを導入しない。地図はOSM/MapKit、逆ジオコーディングはNominatim(1req/秒・キャッシュ必須)とCLGeocoderのみ
- **ローカルファースト**: 位置・健康データを外部送信するコードを書かない
- **ロジック二重管理**: 滞在検出(StayPointDetector)とタイムライン導出はWebとiOSで同一アルゴリズム。片方を変えたら必ずもう片方も変更し、`web/src/core/stayPoint.test.ts` を更新する
- **エクスポート互換**: `my-trip-export/v1` スキーマ(epoch ms)を変えるときは両OSのexport/importを同時に更新

## UIスキル(asset-simulatorから導入)

UI変更時は `.claude/skills/` のスキルを使うこと:

- `vercel-react-best-practices` — Reactコードを書く/直す前に参照
- `vercel-composition-patterns` — コンポーネント設計時
- `web-design-guidelines` / `design-review` — 見た目の変更後のレビュー
- そのほか baseline-ui / fixing-accessibility 等のグローバルスキルも利用可

デザイントークン(色・角丸・タイポ)は docs/03_screens.md に定義。UIはこのトークンから外れない。

## 構成の要点

- Web: `src/core/` が純ロジック(React非依存・テスト対象)、`src/pages/` がUI。ルータはハッシュベース自前実装(`src/app/router.ts`)
- Web: 記録状態は `src/core/recorder.ts` のシングルトンを `useSyncExternalStore` で購読
- iOS: `Services/TripRecorder.swift` が記録の状態機械(@MainActor)。SwiftDataモデルは `Models/Models.swift`
- iOS: Xcode 16フォルダ同期形式。`ios/MyTrip/MyTrip/` にファイルを置けばターゲットに入る(pbxproj編集不要)
- 記録中断からの復元(F-06)は「全ポイント再投入+arrivedAt照合」方式。検出器の決定性が前提
