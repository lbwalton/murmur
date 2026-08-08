import Foundation

// The murmur:// scheme is how the keyboard reaches the app: its mic key
// opens murmur://dictate?session=<token>, the app records, and the finished
// text returns through the App Group store (US-107). Parsing lives here as
// a pure function so unit tests pin the contract down.
enum MurmurRoute: Equatable {
    case dictate(session: String?)
    case open

    static func parse(_ url: URL) -> MurmurRoute? {
        guard url.scheme?.lowercased() == "murmur" else { return nil }
        switch url.host?.lowercased() {
        case "dictate":
            let session = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?
                .first(where: { $0.name == "session" })?
                .value
            return .dictate(session: session)
        default:
            // Unknown or missing hosts still open the app rather than dying.
            return .open
        }
    }
}
