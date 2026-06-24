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
                ForEach(pages.indices, id: \.self) { index in
                    OnboardingPage(page: pages[index])
                        .tag(index)
                }
                LoginPromptView()
                    .tag(loginIndex)
            }
            .tabViewStyle(.page)
            .indexViewStyle(.page(backgroundDisplayMode: .always))

            if page < loginIndex {
                Button("Skip", action: skipToLogin)
                    .font(Theme.Typeface.label)
                    .foregroundStyle(Theme.Palette.textSecondary)
                    .frame(minWidth: 44, minHeight: 44)
                    .padding(12)
            }
        }
    }

    private func skipToLogin() {
        withAnimation {
            page = loginIndex
        }
    }
}

#Preview {
    OnboardingFlow()
}
