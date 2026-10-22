import XCTest
@testable import Horae

/// Android bug 4 (legacy yield unit missing from the choices) — guard that iOS keeps it.
final class UnitChoicesTests: XCTestCase {
    func testStoredLegacyUnitStaysInItsFamily() {
        XCTAssertTrue(UnitType.units(for: .count, keeping: .CANI).contains(.CANI))
        XCTAssertTrue(UnitType.units(for: .liquid, keeping: .OUNCES).contains(.OUNCES))
        XCTAssertTrue(UnitType.units(for: .solid, keeping: .POUNDS).contains(.POUNDS))
    }

    func testLegacyUnitsAreNotOfferedOtherwise() {
        XCTAssertFalse(UnitType.units(for: .count, keeping: .BUCATI).contains(.CANI))
        XCTAssertFalse(UnitType.units(for: .liquid).contains(.OUNCES))
    }
}
