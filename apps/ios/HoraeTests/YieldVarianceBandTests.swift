import XCTest
@testable import Horae

final class YieldVarianceBandTests: XCTestCase {
    func testExactlyFivePercentOffIsOnTargetDespiteFloatNoise() {
        // 1,9 of 2 = -5.000000000000004 % as a Double, shown as "-5 %".
        let pct = YieldVarianceBand.percent(actual: 1.9, target: 2)!
        XCTAssertEqual(YieldVarianceBand(percent: pct), .onTarget)
        XCTAssertEqual(YieldVarianceBand(percent: 5), .onTarget)
        XCTAssertEqual(YieldVarianceBand(percent: -5.04), .onTarget)
    }

    func testBands() {
        XCTAssertEqual(YieldVarianceBand(percent: 0), .onTarget)
        XCTAssertEqual(YieldVarianceBand(percent: 5.1), .warning)
        XCTAssertEqual(YieldVarianceBand(percent: -15), .warning)
        // 2,3 of 2 = 14.999999999999991 %, shown as "+15 %".
        XCTAssertEqual(YieldVarianceBand(percent: YieldVarianceBand.percent(actual: 2.3, target: 2)!), .warning)
        XCTAssertEqual(YieldVarianceBand(percent: 15.1), .danger)
        XCTAssertEqual(YieldVarianceBand(percent: -40), .danger)
    }

    func testNoPercentWithoutTarget() {
        XCTAssertNil(YieldVarianceBand.percent(actual: 3, target: 0))
    }
}
