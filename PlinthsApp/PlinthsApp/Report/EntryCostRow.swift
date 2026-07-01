import SwiftUI

/// One cost-to-enter factor: label + evidence tier, the plain-English detail,
/// and any sources.
struct EntryCostRow: View {
    let factor: EntryCostFactor

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(factor.label)
                    .font(Theme.Typeface.bodyEmphasized)
                    .foregroundStyle(Theme.Stealth.text)
                TierTag(tier: factor.tier)
            }
            Text(factor.value)
                .font(Theme.Typeface.body)
                .foregroundStyle(Theme.Stealth.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            SourcesRow(sources: factor.sources)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 16) {
        ForEach(MockMemo.digitalFitness.entryCost) { EntryCostRow(factor: $0) }
    }
    .padding()
    .background(Theme.Stealth.skyTop)
    .preferredColorScheme(.dark)
}
