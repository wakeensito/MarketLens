import Foundation
import SwiftUI

/// One face of the report surface.
enum ReportFace: Equatable { case report, muse }

/// Where a citation points, 1-indexed to match MemoView's cell ids.
enum MuseCitationTarget: Equatable {
    case competitor(Int), gap(Int), roadmap(Int)

    /// The scroll id used in MemoView (e.g. "competitor-1").
    var cellID: String {
        switch self {
        case .competitor(let n): "competitor-\(n)"
        case .gap(let n):        "gap-\(n)"
        case .roadmap(let n):    "roadmap-\(n)"
        }
    }
}

/// Parse a raw target string like "competitor-2" into a typed target.
func museTarget(_ raw: String) -> MuseCitationTarget? {
    let parts = raw.split(separator: "-")
    guard parts.count == 2, let n = Int(parts[1]) else { return nil }
    switch parts[0] {
    case "competitor": return .competitor(n)
    case "gap":        return .gap(n)
    case "roadmap":    return .roadmap(n)
    default:           return nil
    }
}

/// A renderable span of an answer.
enum MuseRun: Equatable {
    case text(String)
    case bold(String)
    case cite(target: String, label: String)   // target e.g. "competitor-2"
}

/// A citation pill in the GROUNDED IN sources row.
struct MuseCellRef: Identifiable, Equatable {
    var id: String { target }   // target is the unique cell key; labels can repeat
    let target: String     // "competitor-2"
    let label: String      // "Competitors"
}

enum MuseFeedbackValue: Equatable { case none, up, down }

/// One resolved conversation turn.
struct MuseTurn: Identifiable, Equatable {
    let id: String
    let query: String        // what the user actually asked (typed or chip text)
    let answerRaw: String     // the [[…]]/**…** source string
    let sources: [MuseCellRef]
    let followups: [String]   // 3 follow-up questions
    var feedback: MuseFeedbackValue = .none
}

/// Split an answer string into runs. Stream-safe: an unterminated `**` or `[[`
/// at the end renders as plain text until it closes.
func parseMuseRuns(_ raw: String) -> [MuseRun] {
    var runs: [MuseRun] = []
    let chars = Array(raw)
    var text = ""
    var i = 0
    func flush() { if !text.isEmpty { runs.append(.text(text)); text = "" } }

    while i < chars.count {
        // Citation [[target|label]]
        if chars[i] == "[", i + 1 < chars.count, chars[i + 1] == "[" {
            if let close = closeIndex(chars, from: i + 2, marker: "]") {
                let inner = String(chars[(i + 2)..<close])
                let bar = inner.split(separator: "|", maxSplits: 1).map(String.init)
                let target = bar.first ?? ""
                let label = bar.count > 1 ? bar[1] : target
                flush()
                runs.append(.cite(target: target, label: label))
                i = close + 2
                continue
            } else {
                text += String(chars[i...]); i = chars.count; break   // unterminated → text
            }
        }
        // Bold **text**
        if chars[i] == "*", i + 1 < chars.count, chars[i + 1] == "*" {
            if let close = closeIndex(chars, from: i + 2, marker: "*") {
                flush()
                runs.append(.bold(String(chars[(i + 2)..<close])))
                i = close + 2
                continue
            } else {
                text += String(chars[i...]); i = chars.count; break
            }
        }
        text.append(chars[i]); i += 1
    }
    flush()
    return runs
}

/// Index of the first doubled `marker` (e.g. "]]" or "**") at/after `from`, or nil.
private func closeIndex(_ chars: [Character], from: Int, marker: Character) -> Int? {
    var j = from
    while j + 1 < chars.count {
        if chars[j] == marker, chars[j + 1] == marker { return j }
        j += 1
    }
    return nil
}

#Preview("parse check") {
    let sample = "Whoop [[competitor-2|Whoop]] locks you into **hardware** and barely coaches."
    return VStack(alignment: .leading, spacing: 6) {
        ForEach(Array(parseMuseRuns(sample).enumerated()), id: \.offset) { _, run in
            switch run {
            case .text(let s):  Text("text: \(s)")
            case .bold(let s):  Text("bold: \(s)").bold()
            case .cite(let t, let l): Text("cite: \(l) → \(t)").foregroundStyle(.orange)
            }
        }
    }.padding()
}
