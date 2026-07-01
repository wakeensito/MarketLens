import Foundation

/// Canned Muse threads (no live backend until M7). Content is keyed by reportKey
/// ("digitalFitness"/"crowded"/"open") and cites that report's real cells.
enum MockMuse {

    /// The report's canonical answer — returned for any free-typed question. The
    /// displayed query is the user's own text.
    static func canonicalTurn(for reportKey: String, query: String) -> MuseTurn {
        let a = answers[reportKey] ?? answers["digitalFitness"]!
        return MuseTurn(id: "\(reportKey)-canonical-\(query.hashValue)",
                        query: query, answerRaw: a.canonical.raw,
                        sources: a.canonical.sources, followups: a.chipQuestions)
    }

    /// The authored answer mapped to a follow-up chip. The displayed query is the
    /// chip's exact text.
    static func turn(forChip chip: String, in reportKey: String) -> MuseTurn {
        let a = answers[reportKey] ?? answers["digitalFitness"]!
        let mapped = a.chips[chip] ?? a.canonical
        return MuseTurn(id: "\(reportKey)-chip-\(chip.hashValue)",
                        query: chip, answerRaw: mapped.raw,
                        sources: mapped.sources, followups: a.chipQuestions)
    }

    // MARK: - Authored content

    private struct Answer { let raw: String; let sources: [MuseCellRef] }
    private struct ReportAnswers {
        let canonical: Answer
        let chipQuestions: [String]          // the 3 follow-up chips shown under every turn
        let chips: [String: Answer]          // chipQuestion → mapped answer
    }

    private static let answers: [String: ReportAnswers] = [
        "digitalFitness": ReportAnswers(
            canonical: Answer(
                raw: "The threats that matter are [[competitor-1|Future]] and [[competitor-2|Whoop]] — but both chase the **expensive, hardware-heavy end**. Neither adapts a plan to you at a price normal people can pay.",
                sources: [MuseCellRef(target: "competitor-1", label: "Competitors")]),
            chipQuestions: ["Where's the opening?", "How hard is it to enter?", "What would you build first?"],
            chips: [
                "Where's the opening?": Answer(
                    raw: "The clearest gap is [[gap-1|a plan that adapts to you]] — none of the big apps change the plan based on your sleep, food, and schedule. That's the **affordable, adapts-to-you** spot no one owns.",
                    sources: [MuseCellRef(target: "gap-1", label: "Gap 01")]),
                "How hard is it to enter?": Answer(
                    raw: "Moderate. The real challenge isn't the tech — it's **retention**: keeping people past the first couple of months, plus health-data privacy rules.",
                    sources: []),
                "What would you build first?": Answer(
                    raw: "Start with [[roadmap-1|proving the loop]] — one adaptive coaching flow to a small cohort, measured on week-4 retention before anything else.",
                    sources: [MuseCellRef(target: "roadmap-1", label: "Roadmap")]),
            ]),
        "crowded": ReportAnswers(
            canonical: Answer(
                raw: "This is a **giant-dominated** space — [[competitor-1|Patreon]] and [[competitor-2|YouTube]] own the paying creators. Going head-to-head is a losing game; the win is owning a niche they ignore.",
                sources: [MuseCellRef(target: "competitor-1", label: "Competitors")]),
            chipQuestions: ["So where's the opening?", "Is it worth entering?", "What's the first move?"],
            chips: [
                "So where's the opening?": Answer(
                    raw: "In [[gap-1|payouts that don't punish small creators]] — the giants take a big cut and hold funds for weeks. **Fair, fast payouts** is the wedge.",
                    sources: [MuseCellRef(target: "gap-1", label: "Gap 01")]),
                "Is it worth entering?": Answer(
                    raw: "Only narrowly. Opportunity is **limited** at the broad level — most easy niches are taken. Pick one underserved community and be indispensable to it.",
                    sources: []),
                "What's the first move?": Answer(
                    raw: "[[roadmap-1|Pick one underserved niche]] and solve its payout pain end-to-end before widening. Don't try to out-feature the giants.",
                    sources: [MuseCellRef(target: "roadmap-1", label: "Roadmap")]),
            ]),
        "open": ReportAnswers(
            canonical: Answer(
                raw: "This is the **rare open lane** — [[competitor-1|Procore]] aims at big contractors, not small crews. Real pain, weak incumbents for this segment, buyers actively looking.",
                sources: [MuseCellRef(target: "competitor-1", label: "Competitors")]),
            chipQuestions: ["What's the gap exactly?", "What's the catch?", "Where do I start?"],
            chips: [
                "What's the gap exactly?": Answer(
                    raw: "[[gap-1|Tools that match how small crews actually work]] — mobile-first, two-tap simple. The enterprise tools assume office admins small firms don't have.",
                    sources: [MuseCellRef(target: "gap-1", label: "Gap 01")]),
                "What's the catch?": Answer(
                    raw: "The **sales motion** — it's slow, offline, and referral-driven. The product is the easy part; earning trust in a trade is the work.",
                    sources: []),
                "Where do I start?": Answer(
                    raw: "[[roadmap-1|Win one beachhead trade]] — make one trade's jobsite coordination effortless, prove ROI, then let referrals travel.",
                    sources: [MuseCellRef(target: "roadmap-1", label: "Roadmap")]),
            ]),
    ]
}
