import Foundation

// Talks to any OpenAI-compatible endpoint, the same contract as desktop
// src/main/transcribe.js: Groq by default, any baseUrl drop-in. Request
// building and response parsing are pure static functions so unit tests
// cover them without a network; only the async entry points touch
// URLSession. Errors always surface readable messages, never silence.
enum Transcriber {

    static let requestTimeout: TimeInterval = 45
    static let formatTimeout: TimeInterval = 20

    // ------------------------------------------------------------- errors

    struct APIError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    static func apiErrorMessage(status: Int, body: Data?) -> String {
        var msg = "API error \(status)"
        if let body,
           let parsed = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
           let error = parsed["error"] as? [String: Any],
           let detail = error["message"] as? String {
            msg = detail
        } else if let body, !body.isEmpty, let text = String(data: body, encoding: .utf8) {
            msg = "\(msg): \(String(text.prefix(140)))"
        }
        if status == 401 { msg = "Invalid API key. Check Settings." }
        if status == 429 { msg = "Rate limited by the API. Wait a moment and try again." }
        return msg
    }

    static func friendlyMessage(for error: Error) -> String {
        if let apiError = error as? APIError { return apiError.message }
        if let urlError = error as? URLError {
            switch urlError.code {
            case .timedOut:
                return "The transcription request timed out."
            case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost,
                 .cannotFindHost, .dnsLookupFailed, .internationalRoamingOff, .dataNotAllowed:
                return "Could not reach the transcription API. Check your internet connection."
            default:
                break
            }
        }
        return error.localizedDescription
    }

    // ------------------------------------------------------- verbose_json

    struct WhisperSegment: Decodable {
        let text: String?
        let noSpeechProb: Double?

        enum CodingKeys: String, CodingKey {
            case text
            case noSpeechProb = "no_speech_prob"
        }
    }

    struct WhisperResponse: Decodable {
        let text: String?
        let segments: [WhisperSegment]?
    }

    // Whisper marks segments it doubted were speech via no_speech_prob;
    // near-certain non-speech (silence hallucinations) drops, everything
    // else survives, and endpoints without segment data fall through to the
    // plain text untouched (fail open). Threshold from the shared spec.
    static func extractTranscript(_ data: Data, spec: FormatSpec) -> String {
        guard let json = try? JSONDecoder().decode(WhisperResponse.self, from: data) else { return "" }
        let threshold = spec.silence.noSpeechProbThreshold
        if let segments = json.segments, !segments.isEmpty {
            return segments
                .filter { !(($0.noSpeechProb ?? -1) > threshold) }
                .map { $0.text ?? "" }
                .joined()
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return (json.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // ---------------------------------------------------- request bodies

    static func normalizedBase(_ baseUrl: String) -> String {
        baseUrl.hasSuffix("/") ? String(baseUrl.dropLast()) : baseUrl
    }

    // Multipart form for {baseUrl}/audio/transcriptions, mirroring the
    // desktop fields: file, model, temperature 0, verbose_json, optional
    // language, optional vocabulary prompt from the spec template.
    static func transcriptionBody(audio: Data, settings: PipelineSettings, spec: FormatSpec, boundary: String) -> Data {
        var fields: [(name: String, value: String)] = [
            ("model", settings.model),
            ("temperature", "0"),
            ("response_format", "verbose_json"),
        ]
        if settings.language != "auto", !settings.language.isEmpty {
            fields.append(("language", settings.language))
        }
        if !settings.dictionary.isEmpty {
            fields.append(("prompt", fillTemplate(spec.prompt.vocabularyPrompt,
                                                  ["terms": settings.dictionary.joined(separator: ", ")])))
        }
        var body = Data()
        func append(_ s: String) { body.append(Data(s.utf8)) }
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"file\"; filename=\"dictation.m4a\"\r\n")
        append("Content-Type: audio/mp4\r\n\r\n")
        body.append(audio)
        append("\r\n")
        for field in fields {
            append("--\(boundary)\r\n")
            append("Content-Disposition: form-data; name=\"\(field.name)\"\r\n\r\n")
            append("\(field.value)\r\n")
        }
        append("--\(boundary)--\r\n")
        return body
    }

    // The chat/completions body for smart formatting: system prompt from
    // the spec plus dictionary and correction suffixes. Expansions are
    // absent by design; their values never reach any API.
    static func formatRequestBody(text: String, settings: PipelineSettings, spec: FormatSpec) throws -> Data {
        var system = Formatter.buildFormatPrompt(level: settings.formatLevel,
                                                 style: settings.formatStyle,
                                                 numbers: settings.numberStyle,
                                                 spec: spec)
        system += Formatter.promptSuffixes(dictionary: settings.dictionary,
                                           corrections: settings.corrections,
                                           spec: spec)
        let payload: [String: Any] = [
            "model": settings.formatModel,
            "temperature": 0.2,
            "max_tokens": 4096,
            "messages": [
                ["role": "system", "content": system],
                ["role": "user", "content": text],
            ],
        ]
        return try JSONSerialization.data(withJSONObject: payload)
    }

    static func chatContent(from data: Data) -> String {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let message = choices.first?["message"] as? [String: Any],
              let content = message["content"] as? String else { return "" }
        return content.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // -------------------------------------------------------- live calls

    static func transcribe(audio: Data, settings: PipelineSettings, spec: FormatSpec) async throws -> String {
        let boundary = "murmur-\(UUID().uuidString)"
        var request = URLRequest(url: URL(string: "\(normalizedBase(settings.baseUrl))/audio/transcriptions")!)
        request.httpMethod = "POST"
        request.timeoutInterval = requestTimeout
        request.setValue("Bearer \(settings.apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = transcriptionBody(audio: audio, settings: settings, spec: spec, boundary: boundary)
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError(message: friendlyMessage(for: error))
        }
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
            throw APIError(message: apiErrorMessage(status: http.statusCode, body: data))
        }
        return extractTranscript(data, spec: spec)
    }

    // Fail open at every turn: a dictation is never lost because the
    // cleanup LLM errored or chatted (hard constraint).
    static func smartFormat(_ text: String, settings: PipelineSettings, spec: FormatSpec) async -> String {
        // Punctuation-only transcripts (a silence artifact) go straight
        // through instead of inviting the model to chat about them.
        guard !Formatter.wordsOf(text).isEmpty else { return text }
        do {
            var request = URLRequest(url: URL(string: "\(normalizedBase(settings.baseUrl))/chat/completions")!)
            request.httpMethod = "POST"
            request.timeoutInterval = formatTimeout
            request.setValue("Bearer \(settings.apiKey)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try formatRequestBody(text: text, settings: settings, spec: spec)
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return text }
            return Formatter.guardFormatOutput(input: text, output: chatContent(from: data), spec: spec)
        } catch {
            return text
        }
    }

    static func testConnection(settings: PipelineSettings) async -> (ok: Bool, message: String) {
        do {
            var request = URLRequest(url: URL(string: "\(normalizedBase(settings.baseUrl))/models")!)
            request.timeoutInterval = 10
            request.setValue("Bearer \(settings.apiKey)", forHTTPHeaderField: "Authorization")
            let (data, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode != 200 {
                return (false, apiErrorMessage(status: http.statusCode, body: data))
            }
            return (true, "Connected. Your key works.")
        } catch {
            return (false, friendlyMessage(for: error))
        }
    }
}
