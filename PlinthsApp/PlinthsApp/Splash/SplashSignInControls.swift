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
                icon: Image("GoogleLogo"),
                action: handleGoogle
            )

            Button("Other options", action: toggleMoreOptions)
                .font(Theme.Typeface.label)
                .foregroundStyle(Theme.Stealth.textSecondary)
                .frame(minHeight: 44)

            if showMoreOptions {
                // MOCK: real Sign in with Apple MUST use Apple's official
                // SignInWithAppleButton (App Store guideline 4.8, required once
                // Google is offered) — this custom pill is a placeholder only.
                SplashPillButton(
                    title: "Sign in with Apple",
                    icon: Image(systemName: "apple.logo"),
                    action: handleApple
                )
                .transition(.move(edge: .top).combined(with: .opacity))

                SplashPillButton(
                    title: "Continue with email",
                    icon: Image(systemName: "envelope"),
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

    private func handleApple() {
        print("sign in with apple tapped")
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
