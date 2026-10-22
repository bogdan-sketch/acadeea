import XCTest

/// iPad: butonul de ascuns sidebar-ul si dock-ul plutitor (sectiuni + "+").
/// Aceleasi variabile ca IPadLayoutScreenshots.
final class IPadDockScreenshots: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func testHideSidebarShowsDock() throws {
        let env = ProcessInfo.processInfo.environment
        guard let user = env["DEMO_USER"], let pass = env["DEMO_PASS"], !user.isEmpty, !pass.isEmpty else {
            throw XCTSkip("Set TEST_RUNNER_DEMO_USER / TEST_RUNNER_DEMO_PASS.")
        }
        XCUIDevice.shared.orientation = .landscapeLeft
        let app = XCUIApplication()
        if let api = env["HORAE_API_URL"], !api.isEmpty { app.launchEnvironment["HORAE_API_URL"] = api }
        app.launchEnvironment["HORAE_DEBUG_LOGIN"] = "\(user):\(pass)"
        app.launch()

        XCTAssertTrue(app.staticTexts["Acasa"].firstMatch.waitForExistence(timeout: 25), "no sidebar after login")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = springboard.buttons["Allow"].firstMatch
        if allow.waitForExistence(timeout: 4) { allow.tap() }
        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(3)
        shoot(app, "dock-0-sidebar-visible")

        let toggle = app.buttons["toolbar.sidebarToggle"].firstMatch
        XCTAssertTrue(toggle.waitForExistence(timeout: 5), "no sidebar toggle in the toolbar")
        toggle.tap()
        let dock = app.otherElements["dock"].firstMatch
        XCTAssertTrue(app.buttons["dock.showSidebar"].firstMatch.waitForExistence(timeout: 6), "dock did not appear")
        sleep(1)
        shoot(app, "dock-1-hidden-sidebar")

        app.buttons["dock.create"].firstMatch.tap()
        sleep(1)
        shoot(app, "dock-2-create-menu")
        let taskNou = app.buttons["Task nou"].firstMatch
        if taskNou.waitForExistence(timeout: 3) {
            taskNou.tap()
            sleep(2)
            shoot(app, "dock-3-task-form")
        }

        let stoc = (dock.exists ? dock.buttons["Stoc"] : app.buttons["Stoc"]).firstMatch
        if stoc.exists {
            stoc.tap()
            sleep(2)
            shoot(app, "dock-4-stock-section")
        }

        let retete = (dock.exists ? dock.buttons["Retete"] : app.buttons["Retete"]).firstMatch
        if retete.exists {
            retete.tap()
            sleep(3)
            shoot(app, "dock-8-recipes")
        }

        app.buttons["dock.showSidebar"].firstMatch.tap()
        sleep(1)
        XCTAssertTrue(app.staticTexts["Instrumente"].firstMatch.waitForExistence(timeout: 5), "sidebar did not come back")
        shoot(app, "dock-5-sidebar-back")

        // Locatii stoc (admin): the "Implicita" badge + leading swipe to set it.
        let locatii = app.staticTexts["Locatii stoc"].firstMatch
        if locatii.waitForExistence(timeout: 3) {
            locatii.tap()
            sleep(3)
            shoot(app, "dock-6-locations")
            let firstRow = app.cells.firstMatch
            if firstRow.exists {
                firstRow.swipeRight()
                sleep(1)
                shoot(app, "dock-7-locations-swipe")
            }
        }
    }

    private func shoot(_ app: XCUIApplication, _ name: String) {
        let png = app.screenshot().pngRepresentation
        if let dir = ProcessInfo.processInfo.environment["SHOT_DIR"], !dir.isEmpty {
            try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }
        let a = XCTAttachment(uniformTypeIdentifier: "public.png", name: name, payload: png, userInfo: nil)
        a.lifetime = .keepAlways
        add(a)
    }
}
