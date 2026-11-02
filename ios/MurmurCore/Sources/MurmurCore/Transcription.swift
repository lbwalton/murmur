// SPDX-License-Identifier: GPL-3.0-only
// The transcription request (ios/prd.json IOS-006), as desktop's
// src/main/transcribe/provider.ts makes it: one WAV posted as a form to
// {base}/audio/transcriptions with the chosen model and a 30 second
// timeout, one more try after a transient failure and never after a 4xx,
// and every failure sorted into desktop's kinds. On the phone it can also
// carry the dictionary's spellings as a prompt (IOS-013).
import Foundation

/// Why a transcription failed, in desktop's words for it.
public enum TranscriptionFailure: String, Codable, Sendable, CaseIterable {
    case auth, badrequest, server, network, timeout

    /// Worth one more try: the provider or the network may recover.
    var isTransient: Bool { self == .server || self == .network || self == .timeout }
}

public enum TranscriptionResult: Equatable, Sendable {
    case words(String)
    case failed(TranscriptionFailure, detail: String)
}

public enum Transcription {
    /// Desktop waits 30 seconds for an answer too.
    public static let timeout: TimeInterval = 30
    /// Tries after the first, for transient failures only.
    public static let retries = 1

    /// The request, or nil when the address is not one the iPhone can call.
    public static func request(wav: Data, baseUrl: String, model: String, key: APIKey, prompt: String? = nil, boundary: String = "murmur-\(UUID().uuidString)") -> URLRequest? {
        guard BaseURL.problem(baseUrl) == nil,
              let url = URL(string: BaseURL.normalized(baseUrl.trimmingCharacters(in: .whitespaces)) + "/audio/transcriptions")
        else { return nil }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        request.httpMethod = "POST"
        request.setValue("Bearer \(key.secret)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = form(wav: wav, model: model, prompt: prompt, boundary: boundary)
        return request
    }

    /// The form desktop sends: the file as audio.wav, the model, and a
    /// JSON answer, plus a spelling prompt when there is one.
    static func form(wav: Data, model: String, prompt: String? = nil, boundary: String) -> Data {
        var body = Data()
        func line(_ text: String) { body.append(Data((text + "\r\n").utf8)) }
        line("--\(boundary)")
        line(#"Content-Disposition: form-data; name="file"; filename="audio.wav""#)
        line("Content-Type: audio/wav")
        line("")
        body.append(wav)
        line("")
        var fields = [("model", model), ("response_format", "json")]
        if let prompt, !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { fields.append(("prompt", prompt)) }
        for (name, value) in fields {
            line("--\(boundary)")
            line(#"Content-Disposition: form-data; name="\#(name)""#)
            line("")
            line(value)
        }
        line("--\(boundary)--")
        return body
    }

    /// The hint is never what loses a take: a provider that refuses it gets
    /// the take again without it, and words that are only the hint's own
    /// spellings (Whisper says a prompt back on near silence) are heard
    /// again without it too.
    public static func run(wav: Data, baseUrl: String, model: String, key: APIKey, prompt: String? = nil, send: ConnectionTest.Send) async -> TranscriptionResult {
        let hint = prompt.flatMap { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0 }
        let result = await tries(wav: wav, baseUrl: baseUrl, model: model, key: key, prompt: hint, send: send)
        guard let hint else { return result }
        switch result {
        case .failed(.badrequest, _):
            return await tries(wav: wav, baseUrl: baseUrl, model: model, key: key, prompt: nil, send: send)
        case .words(let text) where echoes(text, hint):
            return await tries(wav: wav, baseUrl: baseUrl, model: model, key: key, prompt: nil, send: send)
        default:
            return result
        }
    }

    /// One attempt, and one more after a transient failure.
    static func tries(wav: Data, baseUrl: String, model: String, key: APIKey, prompt: String?, send: ConnectionTest.Send) async -> TranscriptionResult {
        var result = await attempt(wav: wav, baseUrl: baseUrl, model: model, key: key, prompt: prompt, send: send)
        var remaining = retries
        while case .failed(let kind, _) = result, kind.isTransient, remaining > 0 {
            remaining -= 1
            result = await attempt(wav: wav, baseUrl: baseUrl, model: model, key: key, prompt: prompt, send: send)
        }
        return result
    }

    /// Words made only of the hint's own words, ignoring case and
    /// punctuation.
    static func echoes(_ text: String, _ hint: String) -> Bool {
        func words(_ text: String) -> [String] {
            text.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init)
        }
        let heard = words(text)
        let hinted = Set(words(hint))
        return !heard.isEmpty && heard.allSatisfy(hinted.contains)
    }

    static func attempt(wav: Data, baseUrl: String, model: String, key: APIKey, prompt: String? = nil, send: ConnectionTest.Send) async -> TranscriptionResult {
        guard let request = request(wav: wav, baseUrl: baseUrl, model: model, key: key, prompt: prompt) else {
            return .failed(.network, detail: "not an address murmur can call")
        }
        do {
            let (body, response) = try await send(request)
            guard let http = response as? HTTPURLResponse else { return .failed(.network, detail: "no http answer") }
            return result(status: http.statusCode, body: body)
        } catch let error as URLError where error.code == .timedOut {
            return .failed(.timeout, detail: "no response in \(Int(timeout)) s")
        } catch let error as URLError {
            return .failed(.network, detail: "url error \(error.code.rawValue)")
        } catch {
            return .failed(.network, detail: "request failed")
        }
    }

    /// Desktop's sorting: 401 and 403 are the key, any other 4xx is the
    /// request, anything else that is not a success is the server, and a
    /// success without text is the server too.
    static func result(status: Int, body: Data) -> TranscriptionResult {
        switch status {
        case 401, 403:
            return .failed(.auth, detail: "http \(status)")
        case 400..<500:
            return .failed(.badrequest, detail: "http \(status)")
        case 200..<300:
            guard let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
                  let text = object["text"] as? String
            else { return .failed(.server, detail: "response missing text") }
            return .words(text)
        default:
            return .failed(.server, detail: "http \(status)")
        }
    }
}
