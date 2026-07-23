import XCTest
@testable import Murmur

// The murmur:// contract: the keyboard's mic key depends on these routes
// resolving exactly, so they are pinned here.
final class MurmurRouteTests: XCTestCase {

    func testDictateWithSession() throws {
        let url = try XCTUnwrap(URL(string: "murmur://dictate?session=abc123"))
        XCTAssertEqual(MurmurRoute.parse(url), .dictate(session: "abc123"))
    }

    func testDictateWithoutSession() throws {
        let url = try XCTUnwrap(URL(string: "murmur://dictate"))
        XCTAssertEqual(MurmurRoute.parse(url), .dictate(session: nil))
    }

    func testBareSchemeOpens() throws {
        let url = try XCTUnwrap(URL(string: "murmur://"))
        XCTAssertEqual(MurmurRoute.parse(url), .open)
    }

    func testUnknownHostStillOpens() throws {
        let url = try XCTUnwrap(URL(string: "murmur://mystery"))
        XCTAssertEqual(MurmurRoute.parse(url), .open)
    }

    func testForeignSchemeIsRejected() throws {
        let url = try XCTUnwrap(URL(string: "https://dictate?session=abc"))
        XCTAssertNil(MurmurRoute.parse(url))
    }
}
