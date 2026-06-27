import SwiftUI

/// The app-open splash and sign-in moment: a dark Stealth-Desert scene with the
/// Plinths monument, brand wordmark, a typing tagline, and the sign-in controls.
struct SplashSignInView: View {
    let onSignIn: () -> Void

    var body: some View {
        ZStack {
            DesertSkyBackground()
                .ignoresSafeArea()
            SandParticleField()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                PlinthsMark(height: 116, color: Theme.Stealth.amber)
                    .shadow(color: Theme.Stealth.amber.opacity(0.45), radius: 28)

                Spacer().frame(height: 32)

                Text("plinths")
                    .font(Theme.Typeface.splashWordmark)
                    .foregroundStyle(Theme.Stealth.text)

                Spacer().frame(height: 12)

                TypingText(
                    text: "Build on solid ground",
                    font: Theme.Typeface.splashTagline,
                    color: Theme.Stealth.textSecondary
                )

                Spacer()

                SplashSignInControls(onSignIn: onSignIn)
            }
            .padding(.horizontal, 36)
            .padding(.bottom, 28)
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    SplashSignInView(onSignIn: {})
}
