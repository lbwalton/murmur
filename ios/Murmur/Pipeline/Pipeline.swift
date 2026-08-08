import Foundation

// The full dictation pipeline in the app process, the same shape as the
// desktop handleAudio: transcribe, refuse silence, corrections, fail-open
// smart formatting, then expansions dead last so their values never reach
// any API. Errors carry readable messages for the result card.
enum Pipeline {

    struct NoSpeechError: LocalizedError {
        var errorDescription: String? { "No speech detected" }
    }

    static func run(audio: Data, settings: PipelineSettings, spec: FormatSpec) async throws -> String {
        var text = try await Transcriber.transcribe(audio: audio, settings: settings, spec: spec)
        // Whisper answers silence with a lone "." or similar; a transcript
        // with no letters or digits is silence, not text to insert.
        if text.isEmpty || !containsLetterOrDigit(text) {
            throw NoSpeechError()
        }
        text = Corrections.apply(text, pairs: settings.corrections)
        if settings.smartFormat {
            text = await Transcriber.smartFormat(text, settings: settings, spec: spec)
        }
        // Last step on purpose: expansion values must never reach any API.
        text = Expansions.apply(text, list: settings.expansions)
        return text
    }

    static func containsLetterOrDigit(_ text: String) -> Bool {
        text.unicodeScalars.contains { CharacterSet.alphanumerics.contains($0) }
    }
}
