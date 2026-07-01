import SwiftUI

/// An evidence-tier badge (FACT / ESTIMATE / ANALYSIS). Amber-only discipline:
/// a hairline mono label, never a colored fill.
struct TierTag: View {
    let tier: EvidenceTier

    var body: some View {
        Text(tier.rawValue.uppercased())
            .font(Theme.Typeface.badge)
            .foregroundStyle(Theme.Stealth.textSecondary)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .overlay(
                Capsule().stroke(Theme.Stealth.textSecondary.opacity(0.3), lineWidth: 1)
            )
    }
}

#Preview {
    HStack(spacing: 8) {
        TierTag(tier: .fact); TierTag(tier: .estimate); TierTag(tier: .analysis)
    }
    .padding()
    .background(Theme.Stealth.skyTop)
    .preferredColorScheme(.dark)
}
