import SwiftUI

/// A "GROUNDED IN" label followed by a horizontal row of citation pills. Renders
/// nothing when there are no sources.
struct SourcesRow: View {
    var label: String = "grounded in"
    let sources: [Source]

    var body: some View {
        if !sources.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(label.uppercased())
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(sources) { CitePill(source: $0) }
                    }
                }
            }
        }
    }
}

#Preview {
    SourcesRow(sources: [
        Source(label: "Grand View '25", url: "https://www.grandviewresearch.com/"),
        Source(label: "Statista", url: "https://www.statista.com/"),
    ])
    .padding()
    .background(Theme.Stealth.skyTop)
    .preferredColorScheme(.dark)
}
