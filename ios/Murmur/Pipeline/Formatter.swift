import Foundation

// The formatter brain, a straight port of desktop src/main/transcribe.js.
// Every rule string comes from the shared spec; this file owns only the
// composition order and the chat guard, and the shared formatPrompt vectors
// prove the output byte-identical to the desktop's.
enum Formatter {

    static func buildFormatPrompt(level: String, style: String, numbers: String, spec: FormatSpec) -> String {
        let lvl = spec.levels[level] != nil ? level : spec.defaults.level
        let sty = spec.styles[style] != nil ? style : spec.defaults.style
        let num = spec.numbers[numbers] != nil ? numbers : spec.defaults.numbers
        var lines: [String] = [spec.prompt.header, spec.prompt.rulesLabel]
        lines += spec.levels[lvl] ?? []
        lines += spec.numbers[num] ?? []
        // Auto structure and spoken commands ride every level except None,
        // which promises exact words only.
        if lvl != "none" {
            lines.append(spec.prompt.spokenCommands)
            lines += spec.structure
        }
        lines += spec.styles[sty] ?? []
        lines += spec.prompt.footer
        return lines.joined(separator: "\n")
    }

    // The dictionary and learned-correction suffixes the desktop appends to
    // the system prompt, from the same spec templates.
    static func promptSuffixes(dictionary: [String], corrections: [CorrectionPair], spec: FormatSpec) -> String {
        var out = ""
        if !dictionary.isEmpty {
            out += "\n" + fillTemplate(spec.prompt.dictionaryRule, ["terms": dictionary.joined(separator: ", ")])
        }
        if !corrections.isEmpty {
            let top = corrections.sorted { $0.count > $1.count }.prefix(spec.prompt.correctionsPromptLimit)
            let pairs = top
                .map { fillTemplate(spec.prompt.correctionPairTemplate, ["from": $0.from, "to": $0.to]) }
                .joined(separator: spec.prompt.correctionPairSeparator)
            out += "\n" + fillTemplate(spec.prompt.correctionsRule, ["pairs": pairs])
        }
        return out
    }

    // Word extraction matching the desktop regex /[\p{L}\p{N}']+/gu.
    static func wordsOf(_ text: String) -> [String] {
        let lower = text.lowercased()
        guard let re = try? NSRegularExpression(pattern: "[\\p{L}\\p{N}']+") else { return [] }
        let range = NSRange(lower.startIndex..., in: lower)
        return re.matches(in: lower, range: range).compactMap {
            Range($0.range, in: lower).map { String(lower[$0]) }
        }
    }

    // US-009 chat guard: the formatter must transform the transcript, never
    // converse with it. Tells and thresholds live in the spec's chatGuard
    // block; every branch fails open to the raw transcript. Lengths use
    // UTF-16 counts to match JavaScript string length semantics exactly.
    static func guardFormatOutput(input: String, output: String, spec: FormatSpec) -> String {
        let g = spec.chatGuard
        let inp = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let out = output.trimmingCharacters(in: .whitespacesAndNewlines)
        if out.isEmpty { return inp }
        // Wildly longer output means the model started talking.
        if out.utf16.count > inp.utf16.count * g.lengthMultiplier + g.lengthSlack { return inp }
        let lowerIn = inp.lowercased()
        let lowerOut = out.lowercased()
        if g.tells.contains(where: { lowerOut.contains($0) && !lowerIn.contains($0) }) { return inp }
        let inWords = wordsOf(inp)
        let outWords = wordsOf(out)
        // A transcript of at most one word gives a cleanup nothing to say
        // beyond that word (or its punctuation or digit form).
        if inWords.count <= 1 {
            return outWords.count <= inWords.count + g.singleWordSlack ? out : inp
        }
        // A cleanup reuses the transcript's own words. An output that mostly
        // does not is a reply about the text, not the text.
        let inSet = Set(inWords)
        let kept = outWords.filter { inSet.contains($0) }.count
        if !outWords.isEmpty && Double(kept) / Double(outWords.count) < g.overlapFloor { return inp }
        return out
    }
}
