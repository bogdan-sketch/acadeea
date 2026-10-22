import XCTest

/// Captură vizuală a modului "Selectează" (bara de jos + meniul Acțiuni) pe
/// lista de taskuri, pentru verificare în Simulator ÎNAINTE de deploy.
/// Rulează headless (fără Simulator.app) cu API-ul local:
///   xcodebuild test -scheme HoraeScreenshots -destination 'platform=iOS Simulator,id=<udid>' \
///     -only-testing:HoraeScreenshots/BulkSelectScreenshots \
///     TEST_RUNNER_DEMO_USER=demo@horae.ca TEST_RUNNER_DEMO_PASS=... \
///     TEST_RUNNER_HORAE_API_URL=http://localhost:3077 TEST_RUNNER_SHOT_DIR=/path/to/dir
/// PNG-urile ajung în SHOT_DIR (și ca atașamente .xcresult).
final class BulkSelectScreenshots: XCTestCase {

    override func setUpWithError() throws { continueAfterFailure = false }

    func testBulkSelectBar() throws {
        let env = ProcessInfo.processInfo.environment
        guard let user = env["DEMO_USER"], let pass = env["DEMO_PASS"], !user.isEmpty, !pass.isEmpty else {
            throw XCTSkip("Set TEST_RUNNER_DEMO_USER / TEST_RUNNER_DEMO_PASS.")
        }
        let app = XCUIApplication()
        if let api = env["HORAE_API_URL"], !api.isEmpty { app.launchEnvironment["HORAE_API_URL"] = api }
        // Headless simulators have no keyboard focus for typeText — the Debug
        // build logs in itself from this env var (see HoraeApp.swift).
        app.launchEnvironment["HORAE_DEBUG_LOGIN"] = "\(user):\(pass)"
        app.launch()

        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 20), "no tab bar after login")

        let screens: [(tab: String, name: String)] = [
            ("Productie", "tasks"), ("Comenzi", "orders"), ("Retete", "recipes"),
        ]
        for screen in screens {
            let tab = tabBar.buttons[screen.tab]
            guard tab.waitForExistence(timeout: 5) else { continue }
            tab.tap()
            sleep(3)
            let select = app.buttons["Selectează"].firstMatch
            guard select.waitForExistence(timeout: 5) else { shoot(app, "\(screen.name)-no-select"); continue }
            select.tap()
            sleep(1)
            let all = app.buttons["Toate"].firstMatch
            if all.waitForExistence(timeout: 3) { all.tap() }
            sleep(1)
            shoot(app, "\(screen.name)-select-bar")

            let actions = app.buttons["Acțiuni"].firstMatch
            if actions.waitForExistence(timeout: 2) {
                actions.tap()
                sleep(1)
                shoot(app, "\(screen.name)-actions-menu")
                // close the menu
                app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.15)).tap()
                sleep(1)
            }
            let done = app.buttons["Gata"].firstMatch
            if done.waitForExistence(timeout: 2) { done.tap() }
            sleep(1)
        }
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
