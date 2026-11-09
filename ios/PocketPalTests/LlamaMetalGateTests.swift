import XCTest

final class LlamaMetalGateTests: XCTestCase {
  func testDisablesBelowIOS18OnApple6() {
    XCTAssertTrue(disablesLlamaMetal(iOS18OrLater: false, supportsApple6: true))
  }

  func testDisablesBelowIOS18BelowApple6() {
    XCTAssertTrue(disablesLlamaMetal(iOS18OrLater: false, supportsApple6: false))
  }

  func testDisablesOnIOS18BelowApple6() {
    XCTAssertTrue(disablesLlamaMetal(iOS18OrLater: true, supportsApple6: false))
  }

  func testKeepsMetalOnIOS18WithApple6() {
    XCTAssertFalse(disablesLlamaMetal(iOS18OrLater: true, supportsApple6: true))
  }
}
