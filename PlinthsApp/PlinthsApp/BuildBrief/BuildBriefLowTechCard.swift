import SwiftUI

/// Shown instead of the complexity/effort strip when `isTechDominant == false`.
struct BuildBriefLowTechCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("NOT TECHNOLOGY-DOMINANT").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.amber)
            Text("This idea is more about operations and go-to-market than custom software. A website plus off-the-shelf payments gets you most of the way — hold off on an engineering build-out until demand is proven.")
                .font(Theme.Typeface.body).foregroundStyle(Theme.Stealth.text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Stealth.skyMid.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

#Preview {
    BuildBriefLowTechCard().padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
