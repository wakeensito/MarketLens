import Foundation

/// One onboarding "offer" page — the promise shown before login.
struct OfferPage: Identifiable {
    let id = UUID()
    let symbol: String      // SF Symbol name (placeholder art for M1)
    let headline: String
    let subtext: String

    /// The three offer pages, in order: idea -> landscape -> plan.
    static let all: [OfferPage] = [
        OfferPage(
            symbol: "lightbulb",
            headline: "Type an idea.",
            subtext: "Describe any business idea in a sentence."
        ),
        OfferPage(
            symbol: "chart.bar.xaxis",
            headline: "See the landscape.",
            subtext: "Competitors, gaps, and a saturation score in seconds."
        ),
        OfferPage(
            symbol: "map",
            headline: "Get your entry plan.",
            subtext: "A concrete roadmap for breaking in."
        ),
    ]
}
