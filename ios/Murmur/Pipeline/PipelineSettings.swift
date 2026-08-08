import Foundation

// Settings the pipeline consumes, mirroring the desktop defaults exactly
// (src/main/settings.js DEFAULTS). US-104 adds persistence and UI; until
// then this struct is the single place the semantics live.
struct PipelineSettings {
    var apiKey = ""
    var baseUrl = "https://api.groq.com/openai/v1"
    var model = "whisper-large-v3-turbo"
    var language = "auto"
    var smartFormat = true
    var formatModel = "llama-3.1-8b-instant"
    var formatStyle = "conversation"
    var formatLevel = "medium"
    var numberStyle = "auto"
    var dictionary: [String] = []
    var corrections: [CorrectionPair] = []
    var expansions: [Expansion] = []
    var maxSeconds = 300
    var historyEnabled = true
}
