import SwiftUI

/// Renders a single offer page: glyph, serif headline, secondary subtext.
struct OnboardingPage: View {
    let page: OfferPage

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: page.symbol)
                .font(.system(size: 64))
                .foregroundStyle(Theme.Palette.signal)
                .accessibilityHidden(true)

            Text(page.headline)
                .font(Theme.Typeface.serif(34))
                .foregroundStyle(Theme.Palette.text)

            Text(page.subtext)
                .font(Theme.Typeface.body(17))
                .foregroundStyle(Theme.Palette.textSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview {
    OnboardingPage(page: OfferPage.all[0])
        .background(Theme.Palette.bg)
}
