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

        let startButton = app.buttons["旅をはじめる"]
        XCTAssertTrue(startButton.waitForExistence(timeout: 10), "「旅をはじめる」が見つからない")
        shot(app, "01-home")
        startButton.tap()

        // 記録画面(S-02)が表示され、終了トリガーが存在するか
        let stopButton = app.buttons["旅を終了する"]
        let recordingShown = stopButton.waitForExistence(timeout: 10)
        shot(app, "02-after-start")
        XCTAssertTrue(recordingShown, "記録画面に「旅を終了する」が表示されない")

        stopButton.tap()
        shot(app, "03-after-stop-tap")

        // 確認ダイアログ
        let confirm = app.buttons["終了する"]
        let confirmShown = confirm.waitForExistence(timeout: 5)
        shot(app, "04-confirm-dialog")
        XCTAssertTrue(confirmShown, "終了確認ダイアログが表示されない")
        confirm.tap()

        // HealthKit許可シート(+確認アラート)を閉じながらホームへの復帰を待つ
        let backHome = app.buttons["旅をはじめる"]
        let deadline = Date().addingTimeInterval(40)
        while !backHome.exists && Date() < deadline {
            dismissSystemSheetIfNeeded(app: app)
            Thread.sleep(forTimeInterval: 1)
        }
        shot(app, "05-after-confirm")
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
