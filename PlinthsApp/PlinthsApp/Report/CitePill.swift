import SwiftUI

/// A tappable source citation. Opens the source URL. In mock the URLs are real
/// plausible domains, so the tap lands somewhere sensible.
struct CitePill: View {
    let source: Source
    @Environment(\.openURL) private var openURL

    var body: some View {
        Button {
            if let url = URL(string: source.url) { openURL(url) }
        } label: {
            Text(source.label)
                .font(Theme.Typeface.badge)
                .foregroundStyle(Theme.Stealth.amber)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Theme.Stealth.amber.opacity(0.12))
                .clipShape(.capsule)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open source: \(source.label)")
        .accessibilityAddTraits(.isLink)
    }
}

#Preview {
    CitePill(source: Source(label: "Statista", url: "https://www.statista.com/"))
        .padding()
        .background(Theme.Stealth.skyTop)
        .preferredColorScheme(.dark)
}
