import SwiftUI

/// One roadmap phase: the timeline label, the move's title, and what it entails.
struct RoadmapRow: View {
    let phase: MemoRoadmapPhase

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(phase.phase)
                .font(Theme.Typeface.badge)
                .foregroundStyle(Theme.Stealth.amber)
            Text(phase.title)
                .font(Theme.Typeface.title)
                .foregroundStyle(Theme.Stealth.text)
            Text(phase.description)
                .font(Theme.Typeface.body)
                .foregroundStyle(Theme.Stealth.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 20) {
        ForEach(MockMemo.digitalFitness.roadmap) { RoadmapRow(phase: $0) }
    }
    .padding()
    .background(Theme.Stealth.skyTop)
    .preferredColorScheme(.dark)
}
