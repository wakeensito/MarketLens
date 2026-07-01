import Foundation

/// The v2 Market Memo — a native port of the web app's `MarketMemo`
/// (frontend/src/types.ts). Pure value types. `tone`/`severity`/`tier` are kept
/// on the model but never map to a color: the Stealth palette stays amber-only.
struct MarketMemo: Equatable {
    let idea: String
    let vertical: String
    let oneliner: String
    let bands: [ScoreBand]
    let marketSize: MarketSizeEvidence
    let competitors: [MemoCompetitor]
    let whyNow: WhyNow
    let gaps: [MemoGap]
    let entryCost: [EntryCostFactor]
    let roadmap: [MemoRoadmapPhase]
    let read: MemoRead
}

enum ScoreAxis: String, Equatable {
    case saturation, difficulty, opportunity
}

/// Valence, retained for future use. In Stealth it never becomes a hue.
enum BandTone: String, Equatable { case good, mixed, bad }

struct ScoreBand: Identifiable, Equatable {
    var id: String { axis.rawValue }
    let axis: ScoreAxis
    let label: String     // "Competitive"
    let receipt: String   // "A handful of well-funded apps already exist…"
    let score: Int        // 0–100
    let tone: BandTone
}

enum EvidenceTier: String, Equatable { case fact, estimate, analysis }

struct Source: Identifiable, Equatable {
    var id: String { label + url }
    let label: String     // "Statista", "r/fitness"
    let url: String
}

struct MarketSizeEvidence: Equatable {
    let tam: String       // "$14.8B"
    let growth: String    // "growing 24% a year"
    let note: String?     // bottoms-up caveat
    let tier: EvidenceTier
    let sources: [Source]
}

/// Section 3 — Why Now (T2, sourced). The structural shift opening the window.
struct WhyNow: Equatable {
    let shift: String
    let sources: [Source]
    let tier: EvidenceTier
}

enum CompetitorTier: String, Equatable { case dominant, strong, moderate, niche }

struct MemoCompetitor: Identifiable, Equatable {
    let id = UUID()
    let name: String
    let tier: CompetitorTier
    let strength: String
    let weakness: String
    let position: String     // "Big player (premium)"
    let fundingStage: String // "Well funded"
    let url: String
}

enum GapSeverity: String, Equatable { case high, medium, low }

struct GapQuote: Identifiable, Equatable {
    let id = UUID()
    let quote: String
    let source: Source
}

struct MemoGap: Identifiable, Equatable {
    let id = UUID()
    let title: String
    let description: String
    let severity: GapSeverity
    let underserved: String
    let opportunityScore: Int
    let tags: [String]
    let quotes: [GapQuote]   // empty → no receipts row
}

struct EntryCostFactor: Identifiable, Equatable {
    let id = UUID()
    let label: String        // "Rules & privacy"
    let value: String
    let tier: EvidenceTier
    let sources: [Source]    // may be empty
}

struct MemoRoadmapPhase: Identifiable, Equatable {
    let id = UUID()
    let phase: String        // "Phase 1 · 0–3 months"
    let title: String
    let description: String
}

struct MemoRead: Equatable {
    let synthesis: String
    let recommendation: String
    let limit: String        // honest disclaimer
}
