import SwiftUI

/// One vendor-neutral foundation primitive: name + cloud examples + why.
struct FoundationRow: View {
    let primitive: BuildBriefPrimitive
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(primitive.primitive).font(Theme.Typeface.bodyEmphasized).foregroundStyle(Theme.Stealth.text)
            Text(primitive.cloudExamples).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
            Text(primitive.why).font(Theme.Typeface.body).foregroundStyle(Theme.Stealth.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    FoundationRow(primitive: MockBuildBrief.digitalFitness.foundation[2])
        .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
