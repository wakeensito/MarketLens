import SwiftUI

/// A sign-in pill for the splash: dark fill, amber hairline border, an optional
/// leading icon, and a centered label. Used for the Google, Apple, and email
/// options. The icon is tinted to match the label (templated).
struct SplashPillButton: View {
    let title: String
    var icon: Image?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if let icon {
                    icon
                        .resizable()
                        .scaledToFit()
                        .frame(width: 20, height: 20)
                        .accessibilityHidden(true)
                }
                Text(title)
                    .font(Theme.Typeface.bodyEmphasized)
            }
            .foregroundStyle(Theme.Stealth.text)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(Color.white.opacity(0.05))
            .overlay(Capsule().stroke(Theme.Stealth.amber.opacity(0.55), lineWidth: 1))
            .clipShape(.capsule)
        }
    }
}

#Preview {
    VStack(spacing: 16) {
        SplashPillButton(title: "Continue with Google", icon: Image("GoogleLogo"), action: {})
        SplashPillButton(title: "Sign in with Apple", icon: Image(systemName: "apple.logo"), action: {})
        SplashPillButton(title: "Continue with email", icon: Image(systemName: "envelope"), action: {})
    }
    .padding()
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.Stealth.skyTop)
}
