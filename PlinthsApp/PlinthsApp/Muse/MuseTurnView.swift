import SwiftUI

/// One document-pair turn: the user's query as a serif heading with a hairline
/// rule, then the answer block (sources row, streaming prose, action row,
/// follow-up chips).
struct MuseTurnView: View {
    let turn: MuseTurn
    let isLast: Bool
    let animate: Bool
    let onCite: (String) -> Void
    let onFollowup: (String) -> Void
    let onFeedback: (MuseFeedbackValue) -> Void
    let onCopy: () -> Void
    let onRegenerate: () -> Void
    let onCiteMarkdown: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = ""            // streamed prefix
    @State private var streaming = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Query heading + hairline rule
            VStack(alignment: .leading, spacing: 8) {
                Text(turn.query)
                    .font(Theme.Typeface.title)
                    .foregroundStyle(Theme.Stealth.text)
                    .fixedSize(horizontal: false, vertical: true)
                Rectangle().fill(Theme.Stealth.textSecondary.opacity(0.2)).frame(height: 1)
            }
            // Answer block
            MuseSourcesRow(sources: turn.sources, onTap: onCite)
            MuseProseText(raw: streaming ? shown : turn.answerRaw, showCursor: streaming, onCite: onCite)
            MuseActionRow(feedback: turn.feedback, onCopy: onCopy, onRegenerate: onRegenerate,
                          onCiteMarkdown: onCiteMarkdown, onFeedback: onFeedback)
            if isLast { MuseFollowupChips(questions: turn.followups, onTap: onFollowup) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task(id: turn.id) { await streamIfNeeded() }
    }

    private func streamIfNeeded() async {
        guard animate, !reduceMotion else { shown = turn.answerRaw; streaming = false; return }
        streaming = true; shown = ""
        let chars = Array(turn.answerRaw)
        var i = 0
        while i < chars.count {
            shown.append(chars[i]); i += 1
            // Settle at sentence boundaries, unless inside an unterminated [[…
            let insideCite = shown.hasSuffix("[") || (shown.contains("[[") && !shown.hasSuffix("]]") && lastOpenIsCite(shown))
            let isBoundary = ".?!".contains(chars[i - 1]) && !insideCite
            let ns: UInt64 = isBoundary ? 240_000_000 : 12_000_000
            try? await Task.sleep(nanoseconds: ns)
            if Task.isCancelled { break }
        }
        shown = turn.answerRaw; streaming = false
    }

    // True if the most recent unmatched "[[" has no closing "]]" yet.
    private func lastOpenIsCite(_ s: String) -> Bool {
        guard let open = s.range(of: "[[", options: .backwards) else { return false }
        return s.range(of: "]]", options: .backwards).map { $0.lowerBound < open.lowerBound } ?? true
    }
}

#Preview {
    MuseTurnView(
        turn: MuseTurn(id: "t1", query: "Who's the biggest threat?",
                       answerRaw: "The threats are [[competitor-1|Future]] and [[competitor-2|Whoop]] — both chase the **expensive end**.",
                       sources: [MuseCellRef(target: "competitor-1", label: "Competitors")],
                       followups: ["Where's the opening?", "How hard is it to enter?", "What would you build first?"]),
        isLast: true, animate: false, onCite: { _ in }, onFollowup: { _ in }, onFeedback: { _ in },
        onCopy: {}, onRegenerate: {}, onCiteMarkdown: {})
    .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
