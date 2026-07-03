import SwiftUI

/// The idle state: a calm invite to generate the brief.
struct BuildBriefInvite: View {
    let onGenerate: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "square.grid.2x2")
                .font(.system(size: 32, weight: .regular))
                .foregroundStyle(Theme.Stealth.amber)
                .accessibilityHidden(true)
            Text("Turn this idea into a build brief.")
                .font(Theme.Typeface.title)
                .foregroundStyle(Theme.Stealth.text)
                .multilineTextAlignment(.center)
            Text("What it would take to build this — capabilities, foundation, effort, and the risks that matter.")
                .font(Theme.Typeface.caption)
                .foregroundStyle(Theme.Stealth.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button(action: onGenerate) {
                Text("Generate build brief")
                    .font(Theme.Typeface.label)
                    .foregroundStyle(Theme.Stealth.skyTop)
                    .padding(.horizontal, 20).padding(.vertical, 12)
                    .background(Theme.Stealth.amber)
                    .clipShape(.capsule)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Generate build brief")
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
    }
}

#Preview {
    BuildBriefInvite(onGenerate: {})
        .background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
