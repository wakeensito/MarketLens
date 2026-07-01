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

    /// Crowded / high-saturation contrast — a dense field, low opportunity, and
    /// a gap with empty quotes (layout stress). Backs the two "Highly Saturated"
    /// history rows.
    static let crowded = MarketMemo(
        idea: "A platform that helps online creators make money through memberships, tips, and brand deals in one place.",
        vertical: "Creator economy · Global",
        oneliner: "Tons of tools already fight over this, and the big platforms take a large cut. Winning means owning a niche the giants ignore — not going head-to-head with Patreon and YouTube.",
        bands: [
            ScoreBand(axis: .saturation, label: "Crowded",
                      receipt: "Dozens of funded platforms; the top few already own most of the creators worth having.",
                      score: 81, tone: .bad),
            ScoreBand(axis: .difficulty, label: "Hard",
                      receipt: "Payments, payouts, and fraud are heavy lifts — and the giants bundle all of it for free.",
                      score: 68, tone: .mixed),
            ScoreBand(axis: .opportunity, label: "Limited",
                      receipt: "Real demand remains, but most of the easy, obvious niches are already taken.",
                      score: 44, tone: .mixed),
        ],
        marketSize: MarketSizeEvidence(
            tam: "$28B", growth: "growing 12% a year",
            note: "Broad estimate spanning memberships, tipping, and creator commerce — the exact slice a new tool would win is much smaller.",
            tier: .estimate,
            sources: [
                Source(label: "Statista", url: "https://www.statista.com/"),
                Source(label: "CB Insights", url: "https://www.cbinsights.com/"),
            ]),
        competitors: [
            MemoCompetitor(name: "Patreon", tier: .dominant,
                strength: "The default name for memberships, with a huge base of paying fans.",
                weakness: "Takes a meaningful cut and offers creators little control over the relationship.",
                position: "Category leader", fundingStage: "Late stage", url: "https://www.patreon.com/"),
            MemoCompetitor(name: "YouTube", tier: .dominant,
                strength: "Enormous reach and built-in monetization the moment you qualify.",
                weakness: "You rent the audience — the algorithm, not you, owns the relationship.",
                position: "Platform giant", fundingStage: "Public", url: "https://www.youtube.com/"),
            MemoCompetitor(name: "Substack", tier: .dominant,
                strength: "Owns the writer-newsletter niche and the direct-to-inbox relationship.",
                weakness: "Weak beyond text; video and community creators are an afterthought.",
                position: "Niche leader", fundingStage: "Well funded", url: "https://substack.com/"),
            MemoCompetitor(name: "Gumroad", tier: .strong,
                strength: "Dead-simple selling of digital products with almost no setup.",
                weakness: "Thin on recurring memberships and community features.",
                position: "Major", fundingStage: "Funded", url: "https://gumroad.com/"),
            MemoCompetitor(name: "Ko-fi", tier: .niche,
                strength: "Loved for low-friction tips and a creator-friendly free tier.",
                weakness: "Small brand and shallow tooling for anyone building a real business.",
                position: "Smaller, growing", fundingStage: "Bootstrapped", url: "https://ko-fi.com/"),
        ],
        whyNow: WhyNow(
            shift: "Creators increasingly want to own their audience and payments instead of renting both from one platform that can change the rules overnight.",
            sources: [Source(label: "The Verge", url: "https://www.theverge.com/")],
            tier: .estimate),
        gaps: [
            MemoGap(title: "Payouts that don't punish small creators",
                description: "The big platforms take a large cut and hold funds for weeks. Smaller creators feel it most, and there's room for fairer, faster payouts.",
                severity: .high,
                underserved: "Mid-size creators earning real money but too small to negotiate better terms.",
                opportunityScore: 74,
                tags: ["fair payouts", "creator-first"],
                quotes: [
                    GapQuote(quote: "\u{201C}the fees and the two-week hold quietly eat a whole tier of my income\u{201D}", source: Source(label: "r/creators", url: "https://www.reddit.com/r/creators/")),
                ]),
            MemoGap(title: "One dashboard across every platform",
                description: "Creators juggle income from five services with no single view of what's actually working. Nobody ties it together cleanly.",
                severity: .medium,
                underserved: "Full-time creators running memberships, tips, and brand deals in parallel.",
                opportunityScore: 55,
                tags: ["all-in-one", "analytics"],
                quotes: []),
        ],
        entryCost: [
            EntryCostFactor(label: "Payments & fraud",
                value: "Handling money means payment processing, payouts, taxes, and fraud — a serious build before you earn a cent.",
                tier: .fact, sources: []),
            EntryCostFactor(label: "Getting creators",
                value: "Creators are expensive to reach and slow to switch. The realistic path is winning one tight community and expanding by word of mouth.",
                tier: .estimate, sources: [Source(label: "The Verge", url: "https://www.theverge.com/")]),
            EntryCostFactor(label: "Money to start",
                value: "Payments-heavy from day one — plan for $1M–$3M to reach a version creators trust with their income.",
                tier: .estimate, sources: []),
        ],
        roadmap: [
            MemoRoadmapPhase(phase: "Phase 1 · 0–4 months", title: "Pick one underserved niche",
                description: "Choose a single community the giants neglect and solve its payout pain end to end before widening."),
            MemoRoadmapPhase(phase: "Phase 2 · 4–10 months", title: "Nail payouts",
                description: "Make fast, fair, transparent payouts the reason creators stay — the one thing the incumbents won't copy quickly."),
            MemoRoadmapPhase(phase: "Phase 3 · 10–18 months", title: "Expand across platforms",
                description: "Add the cross-platform dashboard once you own the niche, turning a point tool into the creator's home base."),
        ],
        read: MemoRead(
            synthesis: "This is a crowded, giant-dominated space where going head-to-head is a losing game. The opening isn't a better Patreon — it's owning a niche the giants ignore and solving its money problems better than anyone. The risk is spreading thin; the win is being indispensable to one community first.",
            recommendation: "Don't compete broadly. Pick one underserved creator niche, make fair fast payouts your wedge, and only expand once that community treats you as home base.",
            limit: "This is an AI-generated read of public information, not financial advice. Market-size and cost figures are estimates — check the linked sources and get professional advice before investing.")
    )

    /// Open / low-saturation contrast — a thin field, high opportunity, rich
    /// quotes. Backs the "Low Saturation" history row.
    static let open = MarketMemo(
        idea: "Project-management software built specifically for small commercial construction firms.",
        vertical: "Construction SaaS · United States",
        oneliner: "A big, underserved market. Most tools are either built for giant contractors or too generic. The opening is software that fits how small crews actually work.",
        bands: [
            ScoreBand(axis: .saturation, label: "Open",
                      receipt: "Few players focus on small commercial firms specifically — most chase the enterprise end.",
                      score: 34, tone: .good),
            ScoreBand(axis: .difficulty, label: "Moderate",
                      receipt: "Sales cycles are slow and buyers are cautious, but the technology itself is straightforward.",
                      score: 52, tone: .mixed),
            ScoreBand(axis: .opportunity, label: "Strong",
                      receipt: "Clear pain, weak incumbents for this segment, and buyers who are actively looking.",
                      score: 83, tone: .good),
        ],
        marketSize: MarketSizeEvidence(
            tam: "$9.2B", growth: "growing 9% a year",
            note: nil,
            tier: .estimate,
            sources: [
                Source(label: "Grand View '25", url: "https://www.grandviewresearch.com/"),
                Source(label: "IBISWorld", url: "https://www.ibisworld.com/"),
            ]),
        competitors: [
            MemoCompetitor(name: "Procore", tier: .strong,
                strength: "The enterprise standard, deep feature set, trusted by large general contractors.",
                weakness: "Overkill and expensive for small crews — long onboarding they don't have time for.",
                position: "Enterprise leader", fundingStage: "Public", url: "https://www.procore.com/"),
            MemoCompetitor(name: "Buildertrend", tier: .moderate,
                strength: "Popular with builders and priced below the enterprise tools.",
                weakness: "Leans residential; small-commercial workflows are an afterthought.",
                position: "Major (residential)", fundingStage: "Funded", url: "https://buildertrend.com/"),
        ],
        whyNow: WhyNow(
            shift: "Construction is finally digitizing, and small firms now expect software as good as the consumer apps on their phones — patience for clunky tools is gone.",
            sources: [Source(label: "Construction Dive", url: "https://www.constructiondive.com/")],
            tier: .estimate),
        gaps: [
            MemoGap(title: "Tools that match how small crews work",
                description: "Small commercial firms run lean and mobile. The big tools assume office admins and full-time schedulers they don't have.",
                severity: .high,
                underserved: "5–30 person commercial firms doing real jobs with no dedicated software staff.",
                opportunityScore: 88,
                tags: ["mobile-first", "small crews"],
                quotes: [
                    GapQuote(quote: "\u{201C}Procore is a Ferrari and I need a pickup truck\u{201D}", source: Source(label: "r/construction", url: "https://www.reddit.com/r/construction/")),
                    GapQuote(quote: "\u{201C}my foreman won't touch anything that takes more than two taps\u{201D}", source: Source(label: "Capterra", url: "https://www.capterra.com/")),
                ]),
            MemoGap(title: "Pricing a small firm can stomach",
                description: "Enterprise per-seat pricing doesn't fit a crew that scales up and down by the job. Nobody prices for that reality.",
                severity: .high,
                underserved: "Owner-operators who won't sign an enterprise contract for a 12-person shop.",
                opportunityScore: 79,
                tags: ["fair pricing", "flexible"],
                quotes: [
                    GapQuote(quote: "\u{201C}the per-seat math kills it the second I add seasonal guys\u{201D}", source: Source(label: "G2", url: "https://www.g2.com/")),
                ]),
        ],
        entryCost: [
            EntryCostFactor(label: "Rules & safety",
                value: "Construction carries safety and compliance expectations, but a scheduling and coordination tool doesn't need heavy certification to start.",
                tier: .fact, sources: []),
            EntryCostFactor(label: "Getting customers",
                value: "Buyers are offline and referral-driven. Trade associations and word of mouth beat paid ads in this segment.",
                tier: .estimate, sources: [Source(label: "Construction Dive", url: "https://www.constructiondive.com/")]),
            EntryCostFactor(label: "Money to start",
                value: "A focused software play is reachable — roughly $750K–$2M to a version crews rely on daily.",
                tier: .estimate, sources: []),
        ],
        roadmap: [
            MemoRoadmapPhase(phase: "Phase 1 · 0–3 months", title: "Win a beachhead trade",
                description: "Pick one trade (say, electrical or HVAC subs) and make their jobsite coordination effortless before going wider."),
            MemoRoadmapPhase(phase: "Phase 2 · 3–9 months", title: "Prove ROI on jobsites",
                description: "Instrument time saved and rework avoided so the tool sells itself through referrals inside the trade."),
            MemoRoadmapPhase(phase: "Phase 3 · 9–18 months", title: "Expand across trades",
                description: "Generalize the workflows that worked and grow into adjacent trades on the back of proven, referenceable customers."),
        ],
        read: MemoRead(
            synthesis: "This is the rare open lane: real, well-understood pain, incumbents aimed elsewhere, and buyers actively looking. The hard part isn't the product — it's a slow, offline, referral-driven sales motion. Whoever earns trust in one trade and lets results travel by word of mouth can own a segment the giants find too small to bother with.",
            recommendation: "Go narrow first. Win one trade with a mobile-first, fairly priced tool, prove ROI on real jobsites, and expand only on the strength of referrals.",
            limit: "This is an AI-generated read of public information, not financial advice. Market-size and cost figures are estimates — check the linked sources and get professional advice before investing.")
    )

    /// The canonical reportKey for the submit-complete report.
    static let digitalFitnessKey = "digitalFitness"

    /// Thread/content key for a history row (parallels `memo(for:)`).
    static func reportKey(for report: MockReport) -> String {
        switch report.id {
        case "mock-h1", "mock-h2": "crowded"
        case "mock-h3":            "open"
        default:                   "digitalFitness"
        }
    }

    /// Resolves a history row to its fixture (see the M3 spec's mapping table).
    static func memo(for report: MockReport) -> MarketMemo {
        switch report.id {
        case "mock-h1", "mock-h2": crowded   // creator economy, sustainable food
        case "mock-h3":            open      // construction SaaS
        default:                   digitalFitness
        }
    }
}
