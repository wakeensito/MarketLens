import SwiftUI

/// The static backdrop for the splash: a near-black night sky graded to warm
/// dark at the horizon, with a low amber dusk glow (the sun just out of sight).
struct DesertSkyBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Theme.Stealth.skyTop, Theme.Stealth.skyMid],
                startPoint: .top,
                endPoint: .bottom
            )

            RadialGradient(
                colors: [Theme.Stealth.amber.opacity(0.28), .clear],
                center: UnitPoint(x: 0.5, y: 0.58),
                startRadius: 8,
                endRadius: 380
            )
            .blendMode(.screen)
        }
    }
}

#Preview {
    DesertSkyBackground()
        .ignoresSafeArea()
}
