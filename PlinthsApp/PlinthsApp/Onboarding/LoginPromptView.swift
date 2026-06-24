import SwiftUI

/// The final onboarding page: brand wordmark + a stubbed login prompt.
/// Real authentication arrives in a later milestone; the actions only print.
struct LoginPromptView: View {
    var body: some View {
        VStack(spacing: 28) {
            BrandWordmark()

            Text("Log in to start.")
                .font(Theme.Typeface.title)
                .foregroundStyle(Theme.Palette.text)

            Button(action: handleLogin) {
                Text("Log in")
                    .font(Theme.Typeface.bodyEmphasized)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .padding(.vertical, 8)
                    .background(Theme.Palette.text)
                    .foregroundStyle(Theme.Palette.bg)
                    .clipShape(.rect(cornerRadius: 12))
            }

            Button("Skip for now", action: handleSkip)
                .font(Theme.Typeface.caption)
                .foregroundStyle(Theme.Palette.textSecondary)
                .frame(minHeight: 44)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func handleLogin() {
        print("login tapped")
    }

    private func handleSkip() {
        print("skip tapped")
    }
}

#Preview {
    LoginPromptView()
        .background(Theme.Palette.bg)
}
