# My Trip — iOS App Store 配信手順

コード・ツールは無料。App Store配信に必要な費用は **Apple Developer Program(年$99)のみ**。

## 1. 前提

- macOS + Xcode 16 以上
- Apple Developer Program 加入済みのApple ID

## 2. プロジェクトを開く

```bash
open ios/MyTrip/MyTrip.xcodeproj
```

Xcode 16 のフォルダ同期形式のため、`ios/MyTrip/MyTrip/` 配下にファイルを置くだけでターゲットに反映される。

## 3. Signing & Capabilities 設定

1. TARGETS → MyTrip → **Signing & Capabilities**
2. Team に自分のチームを選択、Bundle Identifier を一意に変更(現在: `com.amonohno.mytrip`)。
   `com.example.*` のような予約済み例示ドメインはApp ID登録が拒否されるため使用不可
3. Capability を確認(プロジェクトに設定済み):
   - **Background Modes** → Location updates
   - **HealthKit**

## 4. 実機テスト

1. iPhoneを接続し、スキームで実機を選択して Run
2. 初回起動で位置情報「常に許可」への引き上げとHealthKit読み取りを許可
3. 屋外で「旅開始」→ 10分以上どこかに滞在 → スポットが自動記録されることを確認

## 5. App Store Connect 提出

1. App Store Connect → App を新規作成(Bundle ID を一致させる)
2. Xcode: Product → **Archive** → Distribute App → App Store Connect
3. App Store Connect で以下を入力:
   - **プライバシー栄養ラベル**: 位置情報(アプリ機能・ユーザーに紐付かない・トラッキングなし)、健康とフィットネス(同)
   - 位置情報・HealthKitの用途説明はInfo.plistの文言と整合させる
4. 審査提出

## 6. 審査で問われやすいポイント

| 項目 | 対応 |
|---|---|
| バックグラウンド位置の正当性 | 「旅の軌跡を自動記録する」中核機能である旨をレビューノートに明記 |
| HealthKitの用途 | 歩数表示のみ・読み取り専用・外部送信なし |
| データ送信 | 全データ端末内。逆ジオコーディングはApple純正CLGeocoderのみ使用(サードパーティ送信なし) |
| アカウント不要 | ログイン機能なし(ガイドライン上問題なし) |

## 7. 無料でのベータ配布(任意)

TestFlight(Developer Program内で無料)で内部テスター最大100名に配布可能。
