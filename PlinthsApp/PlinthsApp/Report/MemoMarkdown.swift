import Foundation

/// Renders a memo as plain markdown for the share sheet. Section order mirrors
/// MemoView. Kept dependency-free so `ShareLink(item:)` gets a simple String.
func memoMarkdown(_ memo: MarketMemo) -> String {
    var lines: [String] = []
    func appendSources(_ sources: [Source]) {
        guard !sources.isEmpty else { return }
        lines.append("Sources: " + sources.map { "[\($0.label)](\($0.url))" }.joined(separator: ", "))
    }
    lines.append("# Market Memo — \(memo.vertical)")
    lines.append("")
    lines.append("_\(memo.oneliner)_")
    lines.append("")
    lines.append("**The idea:** \(memo.idea)")
    lines.append("")

    lines.append("## Scores")
    for b in memo.bands {
        lines.append("- **\(b.axis.rawValue.capitalized): \(b.score)/100 — \(b.label).** \(b.receipt)")
    }
    lines.append("")

    lines.append("## Market Size")
    lines.append("\(memo.marketSize.tam) · \(memo.marketSize.growth) (\(memo.marketSize.tier.rawValue))")
    if let note = memo.marketSize.note { lines.append("") ; lines.append(note) }
    appendSources(memo.marketSize.sources)
    lines.append("")

    lines.append("## Who Else Is Doing This")
    for c in memo.competitors {
        lines.append("### \(c.name) — \(c.tier.rawValue)")
        lines.append("- Strength: \(c.strength)")
        lines.append("- Weakness: \(c.weakness)")
        lines.append("- \(c.position) · \(c.fundingStage) · \(c.url)")
    }
    lines.append("")

    lines.append("## Why Now")
    lines.append(memo.whyNow.shift)
    appendSources(memo.whyNow.sources)
    lines.append("")

    lines.append("## Market Gaps")
    for (i, g) in memo.gaps.enumerated() {
        lines.append("### Gap \(String(format: "%02d", i + 1)) — \(g.title) (\(g.opportunityScore)/100)")
        lines.append(g.description)
        lines.append("- Underserved: \(g.underserved)")
        for q in g.quotes { lines.append("- \(q.quote) — [\(q.source.label)](\(q.source.url))") }
    }
    lines.append("")

    lines.append("## What It Takes to Start")
    for f in memo.entryCost {
        lines.append("- **\(f.label)** (\(f.tier.rawValue)): \(f.value)")
        for s in f.sources { lines.append("  - Source: [\(s.label)](\(s.url))") }
    }
    lines.append("")

    lines.append("## Where to Start")
    for p in memo.roadmap {
        lines.append("### \(p.phase) — \(p.title)")
        lines.append(p.description)
    }
    lines.append("")

    lines.append("## The Bottom Line")
    lines.append(memo.read.synthesis)
    lines.append("")
    lines.append("**Recommendation:** \(memo.read.recommendation)")
    lines.append("")
    lines.append("> \(memo.read.limit)")

    return lines.joined(separator: "\n")
}
