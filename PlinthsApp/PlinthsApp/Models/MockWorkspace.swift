import Foundation

/// A past report shown in the history drawer (mock only).
struct MockReport: Identifiable {
    let id: String
    let ideaText: String
    let saturationScore: Int
    let saturationLabel: String
    let createdAt: Date
}

/// Static mock content for the workspace shell, ported from the web app's
/// mockData.ts (EXAMPLE_QUERIES + MOCK_HISTORY).
enum MockWorkspace {
    /// Example ideas offered on the empty home. Tapping one fills the input.
    static let exampleIdeas: [String] = [
        "AI fitness coaching app",
        "D2C supplement brand",
        "SaaS for dental offices",
    ]

    /// Mock past reports for the history drawer, newest first.
    static let history: [MockReport] = [
        MockReport(id: "mock-h1", ideaText: "Creator economy monetization platform",
                   saturationScore: 81, saturationLabel: "Highly Saturated",
                   createdAt: Date(timeIntervalSinceNow: -3600 * 2)),
        MockReport(id: "mock-h2", ideaText: "Sustainable food delivery platform",
                   saturationScore: 81, saturationLabel: "Highly Saturated",
                   createdAt: Date(timeIntervalSinceNow: -86400)),
        MockReport(id: "mock-h3", ideaText: "B2B SaaS for construction project management",
                   saturationScore: 34, saturationLabel: "Low Saturation",
                   createdAt: Date(timeIntervalSinceNow: -86400 * 2)),
        MockReport(id: "mock-h4", ideaText: "Pet telehealth and vet booking service",
                   saturationScore: 62, saturationLabel: "Moderately Saturated",
                   createdAt: Date(timeIntervalSinceNow: -86400 * 5)),
    ]
}
