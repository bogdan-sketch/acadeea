import XCTest

/// Genereaza screenshots pentru App Store: login cu contul demo (org "demo",
/// date mock pe prod), apoi cate o captura pe fiecare tab. Atasamentele
/// (lifetime .keepAlways) se extrag din .xcresult cu `xcresulttool export`.
/// Ruleaza cu scheme "Horae" (prod API) pe iPhone 6.5"/6.7" si iPad 13".
final class ScreenshotTests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testCaptureScreens() throws {
        let app = XCUIApplication()
        app.launch()

        // --- Login (daca nu e deja o sesiune restaurata) ---
        // Credentialele NU stau in repo: ruleaza cu
        //   xcodebuild test ... TEST_RUNNER_DEMO_USER=... TEST_RUNNER_DEMO_PASS=...
        let env = ProcessInfo.processInfo.environment
        guard let user = env["DEMO_USER"], let pass = env["DEMO_PASS"],
              !user.isEmpty, !pass.isEmpty else {
            throw XCTSkip("Set TEST_RUNNER_DEMO_USER / TEST_RUNNER_DEMO_PASS to run the screenshot capture.")
        }

        let emailField = app.textFields["Email"]
        if emailField.waitForExistence(timeout: 8) {
            emailField.tap()
            emailField.typeText(user)
            let passwordField = app.secureTextFields["Parola"]
            passwordField.tap()
            passwordField.typeText(pass)
            shoot(app, "00-login")
            app.buttons["Autentificare"].tap()
        }

        // Dashboard-ul e primul tab. Pe iPhone tab-urile stau in tab bar;
        // pe iPad TabView-ul devine top tab strip (fara tabBars) — cauta
        // butoanele oriunde in ecran in cazul ala.
        let tabBar = app.tabBars.firstMatch
        if !tabBar.waitForExistence(timeout: 20) {
            XCTAssertTrue(app.buttons["Stoc"].waitForExistence(timeout: 20), "no tab controls after login")
        }
        sleep(4) // lasa datele sa se incarce
        shoot(app, "01-acasa")

        // --- Fiecare tab, in ordinea din bara ---
        let tabs: [(String, String)] = [
            ("Comenzi", "02-comenzi"),
            ("Productie", "03-productie"),
            ("Stoc", "04-stoc"),
            ("Retete", "05-retete"),
        ]
        for (label, name) in tabs {
            let btn = tabBar.exists ? tabBar.buttons[label] : app.buttons[label].firstMatch
            guard btn.waitForExistence(timeout: 5) else { continue }
            btn.tap()
            sleep(3)
            shoot(app, name)
        }

        // --- Lupa din stanga: campul de cautare trebuie sa apara la tap ---
        let searchButton = app.buttons["Cauta"].firstMatch
        if searchButton.waitForExistence(timeout: 5) {
            searchButton.tap()
            sleep(2)
            shoot(app, "06-cautare-deschisa")
        }
    }

    private func shoot(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
