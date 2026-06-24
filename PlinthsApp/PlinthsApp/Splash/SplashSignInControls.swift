import SwiftUI

/// The sign-in options for the splash: Google by default, with email (and a
/// future Sign in with Apple) revealed under "Other options". Owns its own
/// expand state; auth is stubbed for now (the actions only print).
struct SplashSignInControls: View {
    @State private var showMoreOptions = false

    var body: some View {
        VStack(spacing: 14) {
            SplashPillButton(
                title: "Continue with Google",
                systemImage: "g.circle",
                action: handleGoogle
            )

            Button("Other options", action: toggleMoreOptions)
                .font(Theme.Typeface.label)
                .foregroundStyle(Theme.Stealth.textSecondary)
                .frame(minHeight: 44)

            if showMoreOptions {
                // Email today; a future "Sign in with Apple" (Apple's official
                // SignInWithAppleButton, required by App Store guideline 4.8 when
                // offering Google) joins this group.
                SplashPillButton(
                    title: "Continue with email",
                    systemImage: "envelope",
                    action: handleEmail
                )
                .transition(.move(edge: .top).combined(with: .opacity))
            }

            Text("By continuing you agree to the Terms & Privacy Policy.")
                .font(Theme.Typeface.badge)
                .foregroundStyle(Theme.Stealth.textSecondary.opacity(0.7))
                .multilineTextAlignment(.center)
        }
    }

    private func toggleMoreOptions() {
        withAnimation(.easeOut(duration: 0.25)) {
            showMoreOptions.toggle()
        }
    }

    private func handleGoogle() {
        print("continue with google tapped")
    }

    private func handleEmail() {
        print("continue with email tapped")
    }
}

#Preview {
    SplashSignInControls()
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Stealth.skyTop)
}
