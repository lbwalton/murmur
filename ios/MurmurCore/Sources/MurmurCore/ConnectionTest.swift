// SPDX-License-Identifier: GPL-3.0-only
// Test connection (ios/prd.json IOS-005): one cheap authorized GET of
// the provider's model list, as desktop's probeConnection does
// (src/main/settings/index.ts), which proves the address and the key
// together without spending audio. The answer is one of four verdicts.
import Foundation

public enum ConnectionVerdict: Equatable, Sendable {
    case works
    /// 401 or 403. A 403 can also mean an account that is not set up yet.
    case keyRejected(status: Int)
    case noConnection
    /// Any other answer, in the provider's own words when it gave some.
    case providerMessage(String)
}

public enum ConnectionTest {
    public typealias Send = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    /// Desktop gives up after 10 seconds too.
    public static let timeout: TimeInterval = 10

    /// The request, or nil when the address is not one the iPhone can call.
    public static func request(baseUrl: String, key: APIKey) -> URLRequest? {
        guard BaseURL.problem(baseUrl) == nil,
              let url = URL(string: BaseURL.normalized(baseUrl.trimmingCharacters(in: .whitespaces)) + "/models")
        else { return nil }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        request.setValue("Bearer \(key.secret)", forHTTPHeaderField: "Authorization")
        return request
    }

    public static func run(baseUrl: String, key: APIKey, send: Send) async -> ConnectionVerdict {
        guard let request = request(baseUrl: baseUrl, key: key) else { return .noConnection }
        do {
            let (body, response) = try await send(request)
            guard let http = response as? HTTPURLResponse else { return .noConnection }
            return verdict(status: http.statusCode, body: body, key: key)
        } catch {
            return .noConnection
        }
    }

    public static func verdict(status: Int, body: Data, key: APIKey) -> ConnectionVerdict {
        switch status {
        case 200..<300:
            return .works
        case 401, 403:
            return .keyRejected(status: status)
        default:
            return .providerMessage(message(in: body, hiding: key) ?? "The provider answered with code \(status).")
        }
    }

    /// The error text OpenAI-compatible servers send, in the shapes they
    /// use: {"error": {"message"}}, {"error": "…"}, {"message"}, or
    /// {"detail"}. A provider that echoes the key back gets the mask in
    /// its place, before long text is cut to 200 characters, so a key
    /// across the cut never shows in part.
    static func message(in body: Data, hiding key: APIKey) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else { return nil }
        let candidates: [Any?] = [
            (object["error"] as? [String: Any])?["message"], object["error"], object["message"], object["detail"]
        ]
        for case let text as String in candidates {
            let trimmed = text.replacingOccurrences(of: key.secret, with: key.masked).trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { continue }
            return trimmed.count > 200 ? String(trimmed.prefix(200)) + "…" : trimmed
        }
        return nil
    }
}
