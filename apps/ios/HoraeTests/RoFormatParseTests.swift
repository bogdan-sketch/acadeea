import XCTest
@testable import Horae

/// Same cases as Android `RoFormatTest` and web `ro-number.test.ts`.
final class RoFormatParseTests: XCTestCase {
    func testReadsRomanianAndPlainDecimals() {
        XCTAssertEqual(RoFormat.parseDecimal("1,5"), 1.5)
        XCTAssertEqual(RoFormat.parseDecimal("1.5"), 1.5)
        XCTAssertEqual(RoFormat.parseDecimal(" 2 "), 2)
        XCTAssertEqual(RoFormat.parseDecimal("-0,25"), -0.25)
        XCTAssertEqual(RoFormat.parseDecimal(",5"), 0.5)
        XCTAssertEqual(RoFormat.parseDecimal("3,"), 3)
    }

    func testLastSeparatorIsDecimalOtherIsGrouping() {
        XCTAssertEqual(RoFormat.parseDecimal("1.250,5"), 1250.5)
        XCTAssertEqual(RoFormat.parseDecimal("1,250.5"), 1250.5)
        XCTAssertEqual(RoFormat.parseDecimal("12.345.678,9"), 12_345_678.9)
    }

    func testSpacesAreGrouping() {
        XCTAssertEqual(RoFormat.parseDecimal("1 000,5"), 1000.5)
        XCTAssertEqual(RoFormat.parseDecimal("1\u{00A0}000,5"), 1000.5)
        XCTAssertEqual(RoFormat.parseDecimal("1\u{202F}000,5"), 1000.5)
    }

    func testRejectsExponentsSuffixesHexAndWords() {
        for bad in ["1e5", "1E5", "2f", "3d", "0x10", "inf", "nan", "Infinity", "1,2,3", "1.2.3"] {
            XCTAssertNil(RoFormat.parseDecimal(bad), bad)
        }
    }

    func testBlankIsNil() {
        XCTAssertNil(RoFormat.parseDecimal(""))
        XCTAssertNil(RoFormat.parseDecimal("   "))
        XCTAssertNil(RoFormat.parseDecimal(nil))
        XCTAssertNil(RoFormat.parseDecimal("-"))
    }

    func testInputTextUsesCommaAndKeepsPrecision() {
        XCTAssertEqual(RoFormat.inputText(1.5), "1,5")
        XCTAssertEqual(RoFormat.inputText(2), "2")
        XCTAssertEqual(RoFormat.inputText(0.0001), "0,0001")
        // qtyFormatted rounds to 2 decimals: an edited 0,125 kg must not become 0,13.
        XCTAssertEqual(RoFormat.inputText(0.125), "0,125")
        XCTAssertEqual(RoFormat.inputText(1250.5), "1250,5")
        XCTAssertEqual(RoFormat.inputText(12_345.678), "12345,678")
        XCTAssertEqual(RoFormat.inputText(-0.0000001), "0")
    }

    func testInputTextRoundTrips() {
        for v in [0.0001, 0.125, 1.5, 1250.5, 12_345.678] {
            XCTAssertEqual(RoFormat.parseDecimal(RoFormat.inputText(v)), v)
        }
    }
}
