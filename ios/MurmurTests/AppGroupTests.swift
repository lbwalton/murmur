import XCTest

// The App Group is the only channel between the keyboard and the app, so
// its container must resolve from the app process (these tests are hosted
// inside Murmur.app). Device-side proof rides with US-107 live testing.
final class AppGroupTests: XCTestCase {

    func testAppGroupContainerResolves() {
        let url = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: "group.com.labroi.murmur.ios")
        XCTAssertNotNil(url, "App Group container missing; check both entitlements files")
    }
}
