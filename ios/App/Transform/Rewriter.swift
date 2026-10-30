// SPDX-License-Identifier: GPL-3.0-only
// Speak an edit on iPhone (ios/prd.json IOS-024): the spoken instruction
// and the selection the keyboard sent go to the cleanup connection with
// desktop's transform prompt (shared/transform.json), and the answer comes
// back for the keyboard to put in place of the selection. Nothing is
// heard for a selection that cannot be sent; on any failure the selection
// stays as it was and the keyboard says why. The activity log notes how
// each went, never the words.
import Foundation
import MurmurCore

/// How a rewrite went, for the keyboard.
enum Rewrite: Equatable, Sendable {
    case rewritten(String)
    /// Why the selection stays as it was, in the keyboard's words.
    case kept(String)
}

/// What the keyboard says when a selection stays as it was.
enum TransformCopy {
    static let noConnection = "Add your provider key in murmur first. The selection is as it was."
    static let kept = "The rewrite did not work. The selection is as it was."

    static func tooLong(_ count: Int, max: Int) -> String {
        "That selection is too long, \(count.formatted()) characters of \(max.formatted()). It is as it was."
    }
}

@MainActor struct Rewriter {
    let rules: TransformRules
    /// Your cleanup connection with today's key, or nil without a key.
    let connection: @MainActor () -> PolishConnection?
    let send: ConnectionTest.Send
    var log: @MainActor (ActivityEvent) -> Void = { _ in }

    /// Why murmur will not send this selection, before anything is heard;
    /// nil when it will.
    func refusal(_ selection: String) -> String? {
        if connection() == nil {
            log(.transform(kept: "no connection"))
            return TransformCopy.noConnection
        }
        let count = selection.utf16.count
        if count > rules.maxChars {
            log(.transform(kept: "selection too long"))
            return TransformCopy.tooLong(count, max: rules.maxChars)
        }
        return nil
    }

    func rewrite(_ instruction: String, _ selection: String) async -> Rewrite {
        guard let connection = connection() else {
            log(.transform(kept: "no connection"))
            return .kept(TransformCopy.noConnection)
        }
        switch await Transform.run(instruction: instruction, selection: selection, connection: connection, rules: rules, send: send) {
        case .rewritten(let text):
            log(.transform(kept: nil))
            return .rewritten(text)
        case .kept(let reason):
            log(.transform(kept: reason))
            return .kept(TransformCopy.kept)
        }
    }

    /// Through your cleanup connection, on a session that keeps no cookies
    /// or cache, as the notes' sort does.
    static func live() -> Rewriter? {
        guard let rules = try? BundledRules.transform(), let catalog = try? BundledRules.catalog() else { return nil }
        let session = URLSession(configuration: .ephemeral)
        let ring = KeychainKeyRing()
        return Rewriter(
            rules: rules,
            connection: { ConnectionStore().load(catalog: catalog).polishConnection(key: { (try? ring.key(for: $0)) ?? nil }) },
            send: { try await session.data(for: $0) },
            log: { ActivityLog.standard.write($0) }
        )
    }
}
