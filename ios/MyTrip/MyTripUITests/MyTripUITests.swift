import XCTest

/// Issue #1 再現用: 旅開始 → 旅終了 が UI 上で完遂できるかを検証する
final class MyTripUITests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testStartAndStopTrip() throws {
        let app = XCUIApplication()
        app.launch()
        try createTrip(app: app, shotPrefix: "stop")
    }

    /// Issue #2: 写真添付とアーカイブのフロー検証
    @MainActor
    func testPhotoAttachAndArchive() throws {
        let app = XCUIApplication()
        app.launch()
        try createTrip(app: app, shotPrefix: "arch")

        // 旅詳細を開く(行全体がButtonとして公開される)
        let row = app.buttons.matching(NSPredicate(format: "label CONTAINS 'の旅,'")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10), "ホームに旅の行が表示されない")
        row.tap()
        shot(app, "arch-10-detail")

        // 写真を追加(フォトピッカー)
        let addPhoto = app.buttons["写真を追加"]
        XCTAssertTrue(addPhoto.waitForExistence(timeout: 10), "「写真を追加」が見つからない")
        addPhoto.tap()

        // ピッカーから1枚選択(リモートビューだが app のヒエラルキーに現れる)
        let pickerImage = app.images.matching(identifier: "PXGGridLayout-Info").firstMatch
        XCTAssertTrue(pickerImage.waitForExistence(timeout: 15), "フォトピッカーに写真が表示されない")
        // リモートビュー内の要素はisHittableがfalseになることがあるため座標タップ
        pickerImage.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        shot(app, "arch-11-picker")

        // 選択すると「完了」が有効になる
        let done = app.buttons["完了"]
        XCTAssertTrue(done.waitForExistence(timeout: 5), "ピッカーの「完了」が見つからない")
        let enabledDeadline = Date().addingTimeInterval(5)
        while !done.isEnabled && Date() < enabledDeadline {
            Thread.sleep(forTimeInterval: 0.5)
        }
        XCTAssertTrue(done.isEnabled, "写真を選択しても「完了」が有効にならない")
        done.tap()

        // サムネイルが表示されるか
        let thumb = app.images["旅の写真"].firstMatch
        let thumbShown = thumb.waitForExistence(timeout: 15)
        shot(app, "arch-12-photo-grid")
        XCTAssertTrue(thumbShown, "添付した写真のサムネイルが表示されない")

        // アーカイブ → ホームに戻り一覧から消える
        let archiveButton = app.buttons["アーカイブする"]
        XCTAssertTrue(archiveButton.waitForExistence(timeout: 5), "アーカイブボタンが見つからない")
        archiveButton.tap()

        let seeAll = app.buttons["すべての旅を見る"].firstMatch
        let seeAllShown = seeAll.waitForExistence(timeout: 10)
        shot(app, "arch-13-home-after-archive")
        XCTAssertTrue(seeAllShown, "アーカイブ後にホームへ戻らない/一覧リンクがない")
        XCTAssertFalse(row.exists, "アーカイブした旅がホームに残っている")

        // アーカイブ一覧に表示されるか
        seeAll.tap()
        let segArchive = app.buttons["アーカイブ"]
        XCTAssertTrue(segArchive.waitForExistence(timeout: 10), "アーカイブ切替が表示されない")
        segArchive.tap()
        let archivedRow = app.staticTexts.matching(NSPredicate(format: "label ENDSWITH 'の旅'")).firstMatch
        let archivedShown = archivedRow.waitForExistence(timeout: 10)
        shot(app, "arch-14-archive-list")
        XCTAssertTrue(archivedShown, "アーカイブ一覧に旅が表示されない")
    }

    /// 旅開始→終了→ホーム復帰まで(Issue #1 のフロー)
    @MainActor
    private func createTrip(app: XCUIApplication, shotPrefix: String) throws {
        let startButton = app.buttons["旅をはじめる"]
        XCTAssertTrue(startButton.waitForExistence(timeout: 10), "「旅をはじめる」が見つからない")
        shot(app, "\(shotPrefix)-01-home")
        startButton.tap()

        // 記録画面(S-02)が表示され、終了トリガーが存在するか
        let stopButton = app.buttons["旅を終了する"]
        let recordingShown = stopButton.waitForExistence(timeout: 10)
        shot(app, "\(shotPrefix)-02-after-start")
        XCTAssertTrue(recordingShown, "記録画面に「旅を終了する」が表示されない")

        stopButton.tap()

        // 確認ダイアログ
        let confirm = app.buttons["終了する"]
        let confirmShown = confirm.waitForExistence(timeout: 5)
        shot(app, "\(shotPrefix)-04-confirm-dialog")
        XCTAssertTrue(confirmShown, "終了確認ダイアログが表示されない")
        confirm.tap()

        // HealthKit許可シート(+確認アラート)を閉じながらホームへの復帰を待つ
        let backHome = app.buttons["旅をはじめる"]
        let deadline = Date().addingTimeInterval(40)
        while !backHome.exists && Date() < deadline {
            dismissSystemSheetIfNeeded(app: app)
            Thread.sleep(forTimeInterval: 1)
        }
        shot(app, "\(shotPrefix)-05-after-confirm")
        XCTAssertTrue(backHome.exists, "旅終了後にホームへ戻らない(終了処理が完了しない)")
    }

    @MainActor
    private func dismissSystemSheetIfNeeded(app: XCUIApplication) {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let health = XCUIApplication(bundleIdentifier: "com.apple.Health")
        let candidates = ["OK", "許可しない", "Don't Allow", "許可", "Allow"]
        for target in [app, springboard, health] {
            for label in candidates {
                let button = target.buttons[label]
                if button.exists && button.isHittable {
                    shot(target, "system-sheet-\(label)")
                    button.tap()
                    return
                }
            }
        }
    }

    @MainActor
    private func shot(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
