import SwiftUI

/// The Plinths brand wordmark — lowercase "plinths" in mono with the amber logo
/// accent, plus a small "Beta" badge. Reused across onboarding and (later) the
/// main app chrome.
struct BrandWordmark: View {
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("plinths")
                .font(Theme.Typeface.wordmark)
                .foregroundStyle(Theme.Palette.logoAccent)
            Text("Beta")
                .font(Theme.Typeface.badge)
                .foregroundStyle(Theme.Palette.textSecondary)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Theme.Palette.surface)
                .clipShape(.capsule)
        }
    }
}

#Preview {
    BrandWordmark()
        .padding()
        .background(Theme.Palette.bg)
}
