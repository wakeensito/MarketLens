import SwiftUI

/// A sign-in pill for the splash: dark fill, amber hairline border, an optional
/// leading icon, and a centered label. Used for the Google and email options.
struct SplashPillButton: View {
    let title: String
    var systemImage: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 18))
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
        SplashPillButton(title: "Continue with Google", systemImage: "g.circle", action: {})
        SplashPillButton(title: "Continue with email", systemImage: "envelope", action: {})
    }
    .padding()
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.Stealth.skyTop)
}
