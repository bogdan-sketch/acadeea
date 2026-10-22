import XCTest
@testable import Horae

/// Counts refresh calls and plays back a scripted outcome after a short delay,
/// so concurrent callers really overlap.
private actor FakeRefresher {
    private(set) var calls = 0
    private var failures: [Error?]
    var token = "access-1"

    init(failures: [Error?] = []) { self.failures = failures }

    func refresh() async throws {
        calls += 1
        try await Task.sleep(for: .milliseconds(150))
        let failure = failures.isEmpty ? nil : failures.removeFirst()
        if let failure { throw failure }
        token = "access-\(calls + 1)"
    }
}

private func makeInterceptor(_ fake: FakeRefresher) -> AuthInterceptor {
    // The stored access token, read synchronously by the interceptor (Keychain in the app).
    let box = TokenBox("access-1")
    return AuthInterceptor(
        currentAccessToken: { box.value },
        performRefresh: {
            try await fake.refresh()
            box.value = await fake.token
        }
    )
}

private final class TokenBox: @unchecked Sendable {
    private let lock = NSLock()
    private var _value: String?
    init(_ value: String?) { _value = value }
    var value: String? {
        get { lock.lock(); defer { lock.unlock() }; return _value }
        set { lock.lock(); _value = newValue; lock.unlock() }
    }
}

final class AuthInterceptorTests: XCTestCase {
    func testConcurrent401sRefreshOnce() async throws {
        let fake = FakeRefresher()
        let interceptor = makeInterceptor(fake)
        try await withThrowingTaskGroup(of: Void.self) { group in
            for _ in 0..<5 {
                group.addTask { try await interceptor.refreshIfNeeded(rejectedToken: "access-1") }
            }
            try await group.waitForAll()
        }
        let calls = await fake.calls
        XCTAssertEqual(calls, 1)
    }

    func testWaitersSeeTheSameTransientFailure() async {
        let fake = FakeRefresher(failures: [APIError.serverError(503)])
        let interceptor = makeInterceptor(fake)
        let results = await withTaskGroup(of: Bool.self, returning: [Bool].self) { group in
            for _ in 0..<4 {
                group.addTask {
                    do {
                        try await interceptor.refreshIfNeeded(rejectedToken: "access-1")
                        return true
                    } catch {
                        return false
                    }
                }
            }
            return await group.reduce(into: []) { $0.append($1) }
        }
        // Before the fix the waiters were resumed as if the refresh had worked
        // and retried with the dead token → 401 → logout.
        XCTAssertEqual(results, [false, false, false, false])
        let calls = await fake.calls
        XCTAssertEqual(calls, 1)
    }

    func testRetriesAfterAFailedRefresh() async throws {
        let fake = FakeRefresher(failures: [APIError.serverError(429)])
        let interceptor = makeInterceptor(fake)
        do {
            try await interceptor.refreshIfNeeded(rejectedToken: "access-1")
            XCTFail("expected the 429 to surface")
        } catch {}
        try await interceptor.refreshIfNeeded(rejectedToken: "access-1")
        let calls = await fake.calls
        XCTAssertEqual(calls, 2)
    }

    func testLate401WithAnAlreadyRotatedTokenDoesNotRefreshAgain() async throws {
        let fake = FakeRefresher()
        let interceptor = makeInterceptor(fake)
        try await interceptor.refreshIfNeeded(rejectedToken: "access-1")
        try await interceptor.refreshIfNeeded(rejectedToken: "access-1")
        let calls = await fake.calls
        XCTAssertEqual(calls, 1)
    }

    func testOnlyRefresh401Or403EndsTheSession() {
        XCTAssertNil(AuthInterceptor.failure(forRefreshStatus: 200))
        for status in [401, 403] {
            guard case .tokenExpired = AuthInterceptor.failure(forRefreshStatus: status) else {
                return XCTFail("\(status) must end the session")
            }
        }
        for status in [429, 500, 502, 503] {
            guard case .serverError(status) = AuthInterceptor.failure(forRefreshStatus: status) else {
                return XCTFail("\(status) must keep the session")
            }
        }
    }

    func testOnlyAuthFailuresClearTheSessionOnRestore() {
        XCTAssertTrue(AuthManager.endsSession(APIError.tokenExpired))
        XCTAssertTrue(AuthManager.endsSession(APIError.authRequired))
        XCTAssertFalse(AuthManager.endsSession(APIError.serverError(503)))
        XCTAssertFalse(AuthManager.endsSession(APIError.serverError(429)))
        XCTAssertFalse(AuthManager.endsSession(URLError(.notConnectedToInternet)))
        XCTAssertFalse(AuthManager.endsSession(URLError(.timedOut)))
    }
}
