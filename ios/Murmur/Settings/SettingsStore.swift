import Foundation
import Combine

// Settings persistence mirroring the desktop's semantics and defaults
// (src/main/settings.js DEFAULTS). Non-secret values live in standard
// UserDefaults, never the App Group suite: the keyboard receives only
// dictation results, nothing else. The API key goes through Keychain only.
@MainActor
final class SettingsStore: ObservableObject {

    // Option lists mirroring the desktop settings screen exactly.
    static let styleOptions: [(value: String, label: String)] = [
        ("conversation", "Conversation"),
        ("vibe-coding", "Vibe coding"),
    ]
    static let levelOptions: [(value: String, label: String)] = [
        ("none", "None, exact words"),
        ("structure", "Structure, verbatim minus stumbles"),
        ("soft", "Soft, light cleanup"),
        ("medium", "Medium, clean and clear"),
        ("high", "High, polished prose"),
    ]
    static let numberOptions: [(value: String, label: String)] = [
        ("auto", "As the model hears it"),
        ("digits", "Always digits (2, 45)"),
        ("words", "Always words (two, forty-five)"),
    ]
    static let languageOptions: [(value: String, label: String)] = [
        ("auto", "Auto detect"), ("en", "English"), ("es", "Spanish"), ("fr", "French"),
        ("de", "German"), ("pt", "Portuguese"), ("it", "Italian"), ("nl", "Dutch"),
        ("ja", "Japanese"), ("ko", "Korean"), ("zh", "Chinese"), ("hi", "Hindi"),
        ("ar", "Arabic"), ("sv", "Swedish"),
    ]

    @Published var model: String { didSet { defaults.set(model, forKey: Keys.model) } }
    @Published var language: String { didSet { defaults.set(language, forKey: Keys.language) } }
    @Published var baseUrl: String { didSet { defaults.set(baseUrl, forKey: Keys.baseUrl) } }
    @Published var smartFormat: Bool { didSet { defaults.set(smartFormat, forKey: Keys.smartFormat) } }
    @Published var formatModel: String { didSet { defaults.set(formatModel, forKey: Keys.formatModel) } }
    @Published var formatStyle: String { didSet { defaults.set(formatStyle, forKey: Keys.formatStyle) } }
    @Published var formatLevel: String { didSet { defaults.set(formatLevel, forKey: Keys.formatLevel) } }
    @Published var numberStyle: String { didSet { defaults.set(numberStyle, forKey: Keys.numberStyle) } }
    @Published var historyEnabled: Bool { didSet { defaults.set(historyEnabled, forKey: Keys.historyEnabled) } }
    @Published var maxSeconds: Int { didSet { defaults.set(maxSeconds, forKey: Keys.maxSeconds) } }
    @Published var onboarded: Bool { didSet { defaults.set(onboarded, forKey: Keys.onboarded) } }

    // The key never touches UserDefaults: reads and writes go straight to
    // the Keychain. Published mirror kept in memory for the UI only.
    @Published var apiKey: String {
        didSet { Keychain.set(apiKey, account: keychainAccount) }
    }

    private let defaults: UserDefaults
    private let keychainAccount: String

    enum Keys {
        static let model = "murmur.model"
        static let language = "murmur.language"
        static let baseUrl = "murmur.baseUrl"
        static let smartFormat = "murmur.smartFormat"
        static let formatModel = "murmur.formatModel"
        static let formatStyle = "murmur.formatStyle"
        static let formatLevel = "murmur.formatLevel"
        static let numberStyle = "murmur.numberStyle"
        static let historyEnabled = "murmur.historyEnabled"
        static let maxSeconds = "murmur.maxSeconds"
        static let onboarded = "murmur.onboarded"
    }

    init(defaults: UserDefaults = .standard, keychainAccount: String = "apiKey") {
        self.defaults = defaults
        self.keychainAccount = keychainAccount
        let fallback = PipelineSettings()
        model = defaults.string(forKey: Keys.model) ?? fallback.model
        language = defaults.string(forKey: Keys.language) ?? fallback.language
        baseUrl = defaults.string(forKey: Keys.baseUrl) ?? fallback.baseUrl
        smartFormat = defaults.object(forKey: Keys.smartFormat) as? Bool ?? fallback.smartFormat
        formatModel = defaults.string(forKey: Keys.formatModel) ?? fallback.formatModel
        formatStyle = defaults.string(forKey: Keys.formatStyle) ?? fallback.formatStyle
        formatLevel = defaults.string(forKey: Keys.formatLevel) ?? fallback.formatLevel
        numberStyle = defaults.string(forKey: Keys.numberStyle) ?? fallback.numberStyle
        historyEnabled = defaults.object(forKey: Keys.historyEnabled) as? Bool ?? fallback.historyEnabled
        maxSeconds = defaults.object(forKey: Keys.maxSeconds) as? Int ?? fallback.maxSeconds
        onboarded = defaults.bool(forKey: Keys.onboarded)
        apiKey = Keychain.get(account: keychainAccount) ?? ""
    }

    // The settings snapshot the pipeline consumes.
    var pipelineSettings: PipelineSettings {
        var s = PipelineSettings()
        s.apiKey = apiKey
        s.baseUrl = baseUrl
        s.model = model
        s.language = language
        s.smartFormat = smartFormat
        s.formatModel = formatModel
        s.formatStyle = formatStyle
        s.formatLevel = formatLevel
        s.numberStyle = numberStyle
        s.historyEnabled = historyEnabled
        s.maxSeconds = maxSeconds
        return s
    }
}
