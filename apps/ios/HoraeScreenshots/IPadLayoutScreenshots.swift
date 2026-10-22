import XCTest

/// Captură vizuală a layout-ului de iPad (sidebar + grid-uri) în landscape și
/// portrait, pentru verificare în Simulator ÎNAINTE de deploy. Rulează
/// headless, cu aceleași variabile ca `BulkSelectScreenshots`:
///   xcodebuild test -scheme HoraeScreenshots -destination 'platform=iOS Simulator,id=<iPad udid>' \
///     -only-testing:HoraeScreenshots/IPadLayoutScreenshots \
///     TEST_RUNNER_DEMO_USER=demo@horae.ca TEST_RUNNER_DEMO_PASS=... \
///     TEST_RUNNER_HORAE_API_URL=https://api-test.horae.ca TEST_RUNNER_SHOT_DIR=/path/to/dir
final class IPadLayoutScreenshots: XCTestCase {

    override func setUpWithError() throws { continueAfterFailure = false }

    func testSidebarAndGrids() throws {
        let env = ProcessInfo.processInfo.environment
        guard let user = env["DEMO_USER"], let pass = env["DEMO_PASS"], !user.isEmpty, !pass.isEmpty else {
            throw XCTSkip("Set TEST_RUNNER_DEMO_USER / TEST_RUNNER_DEMO_PASS.")
        }
        XCUIDevice.shared.orientation = .landscapeLeft

        let app = XCUIApplication()
        if let api = env["HORAE_API_URL"], !api.isEmpty { app.launchEnvironment["HORAE_API_URL"] = api }
        app.launchEnvironment["HORAE_DEBUG_LOGIN"] = "\(user):\(pass)"
        app.launch()

        // Sidebar row "Acasa" = we are past the splash and in the split layout.
        let home = app.staticTexts["Acasa"].firstMatch
        XCTAssertTrue(home.waitForExistence(timeout: 25), "no sidebar after login")
        // Notification permission prompt (first launch) sits on top of everything.
        dismissSystemAlert()
        sleep(3)
        shoot(app, "ipad-dashboard-landscape")

        for (row, name) in [("Comenzi", "orders"), ("Productie", "tasks"), ("Stoc", "stock"), ("Retete", "recipes")] {
            let cell = app.staticTexts[row].firstMatch
            guard cell.waitForExistence(timeout: 5) else { continue }
            cell.tap()
            sleep(4)
            shoot(app, "ipad-\(name)-landscape")

            if name == "tasks" {
                let board = app.buttons["Vezi board"].firstMatch
                if board.waitForExistence(timeout: 3) {
                    board.tap()
                    sleep(3)
                    shoot(app, "ipad-tasks-board-landscape")
                    let list = app.buttons["Vezi lista"].firstMatch
                    if list.waitForExistence(timeout: 3) { list.tap() }
                }
            }
        }

        // A detail screen (readable column): first recipe card.
        let firstRecipe = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'componente'")).firstMatch
        if firstRecipe.waitForExistence(timeout: 5) {
            firstRecipe.tap()
            sleep(4)
            shoot(app, "ipad-recipe-detail-landscape")
        }

        // Settings via the sidebar footer / row.
        let settings = app.staticTexts["Setari"].firstMatch
        if settings.waitForExistence(timeout: 5) {
            settings.tap()
            sleep(3)
            shoot(app, "ipad-settings-landscape")
        }

        // Portrait: automatic column visibility hides the sidebar.
        XCUIDevice.shared.orientation = .portrait
        sleep(2)
        let homeRow = app.staticTexts["Acasa"].firstMatch
        if homeRow.exists { homeRow.tap() } else {
            app.buttons["ToggleSidebar"].firstMatch.tap()
            sleep(1)
            app.staticTexts["Acasa"].firstMatch.tap()
        }
        sleep(3)
        shoot(app, "ipad-dashboard-portrait")
    }

    private func dismissSystemAlert() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = springboard.buttons["Allow"].firstMatch
        if allow.waitForExistence(timeout: 4) { allow.tap() }
    }

    private func shoot(_ app: XCUIApplication, _ name: String) {
        let shot = app.screenshot()
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir = ProcessInfo.processInfo.environment["SHOT_DIR"], !dir.isEmpty {
            let url = URL(fileURLWithPath: dir).appendingPathComponent("\(name).png")
            try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
            try? shot.pngRepresentation.write(to: url)
        }
    }
}
