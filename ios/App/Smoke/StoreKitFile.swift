// SPDX-License-Identifier: GPL-3.0-only
// ios/murmur.storekit as the app reads it (ios/prd.json IOS-025): the
// StoreKit configuration the tests run real StoreKit on, read by the smoke
// and the tests to check it sells the app's product with the founders code.
import Foundation

/// The parts of a StoreKit configuration file the smoke reads.
struct StoreKitFile: Decodable {
    struct Product: Decodable {
        struct Code: Decodable {
            let referenceName: String
        }

        let productID: String
        let type: String
        let displayPrice: String
        let offerCodes: [Code]?
    }

    let products: [Product]

    static func read(_ url: URL) throws -> StoreKitFile {
        try JSONDecoder().decode(StoreKitFile.self, from: Data(contentsOf: url))
    }
}
