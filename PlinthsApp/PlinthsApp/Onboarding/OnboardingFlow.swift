import SwiftUI

/// Root onboarding experience: three swipeable offer pages followed by the
/// login prompt. A Skip button (visible only on the offer pages) jumps to login.
struct OnboardingFlow: View {
    @State private var page = 0
    private let pages = OfferPage.all

    /// Index of the login page (last tab).
    private var loginIndex: Int { pages.count }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Theme.Palette.bg.ignoresSafeArea()

            TabView(selection: $page) {
                ForEach(Array(pages.enumerated()), id: \.element.id) { index, offer in
                    OnboardingPage(page: offer)
                        .tag(index)
                }
                LoginPromptView()
                    .tag(loginIndex)
            }
            .tabViewStyle(.page)
            .indexViewStyle(.page(backgroundDisplayMode: .always))

            if page < loginIndex {
                Button("Skip") {
                    withAnimation { page = loginIndex }
                }
                .font(Theme.Typeface.mono(15))
                .foregroundStyle(Theme.Palette.textSecondary)
                .padding(24)
            }
        }
    }
}

#Preview {
    OnboardingFlow()
}
