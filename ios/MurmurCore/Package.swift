// swift-tools-version: 6.0
// SPDX-License-Identifier: GPL-3.0-only
// MurmurCore: murmur's rules in Swift, with no UI. The app and the
// keyboard both link it, and swift test runs it on the Mac without a
// simulator (ios/prd.json stack.core).
import PackageDescription

let package = Package(
    name: "MurmurCore",
    platforms: [.iOS("26.0"), .macOS("15.0")],
    products: [.library(name: "MurmurCore", targets: ["MurmurCore"])],
    targets: [
        .target(name: "MurmurCore"),
        .testTarget(name: "MurmurCoreTests", dependencies: ["MurmurCore"])
    ]
)
