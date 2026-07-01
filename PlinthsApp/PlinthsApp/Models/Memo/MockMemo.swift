import Foundation

/// Mock memo fixtures for M3 (no backend until M4). Sources use real, plausible
/// domains so the citation UI reads honestly; only the data is mock.
enum MockMemo {
    /// Canonical fixture — a verbatim port of the web's MOCK_MEMO.
    static let digitalFitness = MarketMemo(
        idea: "An AI fitness coaching app that adjusts every workout in real time based on your watch data, sleep, and schedule.",
        vertical: "Fitness app · United States & Western Europe",
        oneliner: "Lots of people want this and the market is growing fast. The catch: the big players either lock you into their hardware or charge a lot for a human coach. The opening is a smart app that adapts to you, at a price normal people can afford.",
        bands: [
            ScoreBand(axis: .saturation, label: "Competitive",
                      receipt: "A handful of well-funded apps already exist, but the big names all chase the expensive end.",
                      score: 62, tone: .mixed),
            ScoreBand(axis: .difficulty, label: "Challenging",
                      receipt: "Health data comes with privacy rules, and the real challenge is keeping people coming back after the first couple of months.",
                      score: 58, tone: .mixed),
            ScoreBand(axis: .opportunity, label: "Strong",
                      receipt: "A big, fast-growing market — and no one yet owns the affordable, adapts-to-you spot.",
                      score: 71, tone: .good),
        ],
        marketSize: MarketSizeEvidence(
            tam: "$14.8B", growth: "growing 24% a year",
            note: "There wasn't much hard data for this exact niche, so this number is an estimate built from reports on fitness trackers and the wider digital-fitness market.",
            tier: .estimate,
            sources: [
                Source(label: "Grand View '25", url: "https://www.grandviewresearch.com/"),
                Source(label: "Statista", url: "https://www.statista.com/"),
            ]),
        competitors: [
            MemoCompetitor(name: "Future", tier: .dominant,
                strength: "Real human coaches — people stay engaged and stick around.",
                weakness: "At $149 a month it's out of reach for most people, and there's no AI personalization.",
                position: "Big player (premium)", fundingStage: "Well funded", url: "https://www.future.co/"),
            MemoCompetitor(name: "Whoop", tier: .dominant,
                strength: "Strong brand and rich data from its wearable device.",
                weakness: "You have to buy and wear its hardware, and it barely guides your actual workouts.",
                position: "Big player (hardware)", fundingStage: "Heavily funded", url: "https://www.whoop.com/"),
            MemoCompetitor(name: "Freeletics", tier: .strong,
                strength: "Huge user base, has an AI coach, and needs no equipment.",
                weakness: "Dated design, shallow personalization, and lots of people quit after two months.",
                position: "Major", fundingStage: "Funded, growing", url: "https://www.freeletics.com/"),
            MemoCompetitor(name: "Ladder", tier: .niche,
                strength: "Well-designed programs, affordable, strong community.",
                weakness: "No AI personalization and little brand awareness outside its niche.",
                position: "Smaller, growing", fundingStage: "Early stage", url: "https://www.joinladder.com/"),
        ],
        whyNow: WhyNow(
            shift: "Smartwatches and fitness trackers are everywhere now, and AI has gotten cheap enough to personalize a workout on the fly. A few years ago, building this would have been much harder and far more expensive.",
            sources: [Source(label: "TechCrunch", url: "https://techcrunch.com/")],
            tier: .estimate),
        gaps: [
            MemoGap(title: "A plan that adjusts to you",
                description: "None of the big apps change your plan based on your sleep, food, schedule, and past workouts. Their plan stays the same even when your week doesn't.",
                severity: .high,
                underserved: "People who take fitness seriously and have outgrown one-size-fits-all plans, but can't afford a $149-a-month human coach.",
                opportunityScore: 90,
                tags: ["adapts to you", "keeps people coming back"],
                quotes: [
                    GapQuote(quote: "\u{201C}the program never changes even when I tell it the last week wrecked me\u{201D}", source: Source(label: "r/fitness", url: "https://www.reddit.com/r/fitness/")),
                    GapQuote(quote: "\u{201C}great coach, but $149 a month is brutal\u{201D}", source: Source(label: "Trustpilot", url: "https://www.trustpilot.com/")),
                ]),
            MemoGap(title: "Expert coaching that's affordable",
                description: "Good coaching is locked behind $100-plus a month. A smart, AI-first app could give people expert-level plans at a price the average person can actually pay.",
                severity: .high,
                underserved: "Everyday people priced out of the premium apps.",
                opportunityScore: 81,
                tags: ["affordable", "for everyone"],
                quotes: [
                    GapQuote(quote: "\u{201C}I want Future-quality plans without the Future price\u{201D}", source: Source(label: "G2", url: "https://www.g2.com/")),
                ]),
            MemoGap(title: "Everything in one place",
                description: "Fitness, sleep, stress, and food live in separate apps that don't talk to each other. No one ties them together into a single, simple picture of how you're doing.",
                severity: .medium,
                underserved: "People juggling three or four different wellness apps with no single view.",
                opportunityScore: 58,
                tags: ["all-in-one", "wellness"],
                quotes: []),
        ],
        entryCost: [
            EntryCostFactor(label: "Rules & privacy",
                value: "Health data like heart rate and sleep comes with privacy rules you have to follow. You won't need medical approval to start, but you do need to handle that data carefully.",
                tier: .fact, sources: []),
            EntryCostFactor(label: "Getting customers",
                value: "Paying for ads in fitness is expensive, and interest spikes every January. The cheaper, smarter route is growing through word of mouth and real results.",
                tier: .estimate, sources: [Source(label: "TechCrunch", url: "https://techcrunch.com/")]),
            EntryCostFactor(label: "Money to start",
                value: "The software-only path is light — roughly $500K to $1.5M to reach a version people actually stick with. No hardware needed to get going.",
                tier: .estimate, sources: []),
            EntryCostFactor(label: "Keeping people",
                value: "People hop between fitness apps easily. That makes them easy to sign up — and just as easy to lose. You keep them by genuinely getting better the more they use you.",
                tier: .estimate, sources: []),
        ],
        roadmap: [
            MemoRoadmapPhase(phase: "Phase 1 · 0–3 months", title: "Prove the loop",
                description: "Ship a single adaptive coaching flow to a small cohort and measure week-4 retention before anything else. The whole thesis rests on people coming back."),
            MemoRoadmapPhase(phase: "Phase 2 · 3–9 months", title: "Earn trust with results",
                description: "Instrument outcomes and surface real progress publicly. Let demonstrated results — not paid acquisition — drive word-of-mouth growth."),
            MemoRoadmapPhase(phase: "Phase 3 · 9–18 months", title: "Widen the wedge",
                description: "Once retention holds, expand the program library and lean into the compounding advantage of getting smarter the more each person uses it."),
        ],
        read: MemoRead(
            synthesis: "The market is big and growing, and the leaders have left a clear opening: a coaching app that's affordable and gets smarter the more you use it. The crowded part is the expensive, hardware-heavy end — not the affordable, AI-first space. The hardest part isn't beating competitors; it's getting people to keep coming back. Whoever proves people stick around, and actually get results, wins this opening.",
            recommendation: "Start with affordable coaching that adapts to each person in real time. Treat \"keeping people coming back\" as the real product: measure it from day one, share real results to build trust, and let those results — not ad spending — be what sets you apart.",
            limit: "This is an AI-generated read of public information, not financial advice. The market-size and cost figures are estimates — double-check the sources we linked, and get professional advice before putting in real money.")
    )
}
