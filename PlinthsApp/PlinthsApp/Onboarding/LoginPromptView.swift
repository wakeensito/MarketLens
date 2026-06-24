import SwiftUI

/// The final onboarding page: brand wordmark + a stubbed login prompt.
/// Real authentication arrives in a later milestone; buttons only print for now.
struct LoginPromptView: View {
    var body: some View {
        VStack(spacing: 28) {
            wordmark

            Text("Log in to start.")
                .font(Theme.Typeface.serif(24))
                .foregroundStyle(Theme.Palette.text)

            Button {
                print("login tapped")
            } label: {
                Text("Log in")
                    .font(Theme.Typeface.body(17, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Theme.Palette.text)
                    .foregroundStyle(Theme.Palette.bg)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            Button("Skip for now") {
                print("skip tapped")
            }
            .font(Theme.Typeface.mono(13))
            .foregroundStyle(Theme.Palette.textSecondary)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var wordmark: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("plinths")
                .font(Theme.Typeface.mono(28))
                .foregroundStyle(Theme.Palette.logoAccent)
            Text("Beta")
                .font(Theme.Typeface.mono(11))
                .foregroundStyle(Theme.Palette.textSecondary)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Theme.Palette.surface)
                .clipShape(Capsule())
        }
    }
}

#Preview {
    LoginPromptView()
        .background(Theme.Palette.bg)
}
