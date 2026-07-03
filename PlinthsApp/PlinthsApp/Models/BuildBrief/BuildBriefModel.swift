import Foundation

enum BuildOrBuy: String, Equatable { case build, buy }

struct BuildBriefCapability: Identifiable, Equatable {
    let id = UUID()
    let name: String
    let description: String
    let buildOrBuy: BuildOrBuy
    let recommendation: String
}

struct BuildBriefPrimitive: Identifiable, Equatable {
    let id = UUID()
    let primitive: String
    let why: String
    let cloudExamples: String
}

struct BuildBriefRisk: Identifiable, Equatable {
    let id = UUID()
    let title: String
    let description: String
}

struct BuildBriefEffort: Equatable {
    let timeframe: String
    let teamShape: String
}

/// A founder-altitude build deliverable derived from a report (mirrors the web
/// `BuildBrief`). Vendor-neutral by design.
struct BuildBrief: Equatable {
    let isTechDominant: Bool
    let complexityScore: Int
    let complexityLabel: String
    let complexityDrivers: [String]
    let capabilities: [BuildBriefCapability]
    let foundation: [BuildBriefPrimitive]
    let mvpScope: String
    let effort: BuildBriefEffort
    let technicalRisks: [BuildBriefRisk]
}

/// Fixed copy shown on every brief (not model output).
enum BuildBriefCopy {
    static let principles: [String] = [
        "Least privilege — grant the minimum access that works.",
        "Prefer managed services over running your own.",
        "Pick one cloud and stay in it early.",
        "Secure defaults — encryption and backups from day one.",
    ]
    static let limit =
        "AI isn't always right. Treat this as a starting point, not a spec — " +
        "sanity-check the stack against your own constraints before you commit."
}
