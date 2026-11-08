// SPDX-License-Identifier: GPL-3.0-only
// The sort's chat (ios/prd.json IOS-023): desktop's askModel
// (src/main/notes/sorter.ts) over the cleanup connection. The model gets
// the sorter's system and user prompts at shared/sorter.json's temperature
// and time limit; a failure gives desktop's reasons, so a note that stays
// in the inbox says why in the same words on both.
import Foundation

extension NoteSort {
    /// The request, or nil when the address is not one the iPhone can call.
    public static func chatRequest(system: String, user: String, connection: PolishConnection, rules: SorterRules) -> URLRequest? {
        guard BaseURL.problem(connection.baseUrl) == nil,
              let url = URL(string: BaseURL.normalized(connection.baseUrl.trimmingCharacters(in: .whitespaces)) + "/chat/completions")
        else { return nil }
        let body = Chat(model: connection.model, temperature: rules.temperature, messages: [
            Chat.Message(role: "system", content: system),
            Chat.Message(role: "user", content: user)
        ])
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: Double(rules.timeoutMs) / 1000)
        request.httpMethod = "POST"
        request.setValue("Bearer \(connection.key.secret)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        request.httpBody = try? encoder.encode(body)
        return request
    }

    /// The sort's ask through a connection. Never retries, as desktop's.
    public static func chat(_ connection: PolishConnection, rules: SorterRules, send: @escaping ConnectionTest.Send) -> SortAsk {
        { system, user in
            guard let request = chatRequest(system: system, user: user, connection: connection, rules: rules) else { return .failed("network") }
            let body: Data
            let response: URLResponse
            do {
                (body, response) = try await send(request)
            } catch let error as URLError where error.code == .timedOut {
                return .failed("timeout")
            } catch {
                return .failed("network")
            }
            guard let http = response as? HTTPURLResponse else { return .failed("network") }
            guard (200..<300).contains(http.statusCode) else { return .failed("http \(http.statusCode)") }
            // response.json() reads any JSON value, a bare null included.
            guard let object = try? JSONSerialization.jsonObject(with: body, options: [.fragmentsAllowed]) else { return .failed("response not json") }
            guard let content = (((object as? [String: Any])?["choices"] as? [Any])?.first as? [String: Any])
                .flatMap({ ($0["message"] as? [String: Any])?["content"] as? String })
            else { return .failed("response missing text") }
            return .content(content)
        }
    }

    private struct Chat: Encodable {
        struct Message: Encodable {
            let role: String
            let content: String
        }

        let model: String
        let temperature: Double
        let messages: [Message]
    }
}
