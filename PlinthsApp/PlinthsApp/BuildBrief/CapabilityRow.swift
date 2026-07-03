import SwiftUI

/// A BUILD (amber-filled) / BUY (mono hairline) tag. Amber-only: the label +
/// treatment carry the meaning, never a second hue.
struct BuildOrBuyTag: View {
    let kind: BuildOrBuy
    var body: some View {
        Text(kind == .build ? "BUILD" : "BUY")
            .font(Theme.Typeface.badge)
            .foregroundStyle(kind == .build ? Theme.Stealth.skyTop : Theme.Stealth.textSecondary)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(kind == .build ? Theme.Stealth.amber : Color.clear)
            .overlay(Capsule().stroke(Theme.Stealth.textSecondary.opacity(kind == .build ? 0 : 0.3), lineWidth: 1))
            .clipShape(.capsule)
    }
}

/// One capability: name + build/buy tag, description, and the recommendation.
struct CapabilityRow: View {
    let capability: BuildBriefCapability
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(capability.name).font(Theme.Typeface.bodyEmphasized).foregroundStyle(Theme.Stealth.text)
                BuildOrBuyTag(kind: capability.buildOrBuy)
            }
            Text(capability.description).font(Theme.Typeface.body).foregroundStyle(Theme.Stealth.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if !capability.recommendation.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text("RECOMMENDED").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.amber)
                    Text(capability.recommendation).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    CapabilityRow(capability: MockBuildBrief.digitalFitness.capabilities[3])
        .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
