import SwiftUI

/// The staged pipeline-loading screen shown after submitting an idea. Mirrors
/// the web app's analysis pipeline (mock, time-driven). It runs through the
/// stages and holds on the last frame — the report UI lands in M3. Reduce
/// Motion disables the mark pulse (stage text and progress still advance).
struct PipelineLoadingView: View {
    let idea: String
    let onCancel: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start = Date()
    @State private var isComplete = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: onCancel) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(Theme.Stealth.textSecondary)
                        .frame(width: 44, height: 44)
                        .contentShape(.rect)
                }
                .accessibilityLabel("Cancel analysis")
                Spacer()
            }
            .padding(.horizontal, 8)

            Spacer()

            // While running, TimelineView drives the mark pulse + progress. Once
            // the pipeline reaches its total runtime it settles on a static
            // terminal frame, so the animation clock stops instead of pulsing
            // forever on a screen that's meant to run and hold.
            if isComplete {
                stageFrame(stage: PipelineStage.all.last ?? PipelineStage.all[0],
                           progress: 1.0, markOpacity: 1)
            } else {
                TimelineView(.animation) { timeline in
                    let elapsed = timeline.date.timeIntervalSince(start)
                    stageFrame(stage: PipelineStage.stage(at: elapsed),
                               progress: min(elapsed / PipelineStage.totalSeconds, 1.0),
                               markOpacity: reduceMotion ? 1 : pulse(elapsed))
                }
            }

            Spacer()

            Text("\u{201C}\(idea)\u{201D}")
                .font(Theme.Typeface.caption)
                .foregroundStyle(Theme.Stealth.textSecondary.opacity(0.7))
                .lineLimit(1)
                .padding(.bottom, 24)
        }
        .padding(.horizontal, 20)
        .onAppear { start = Date() }
        .task {
            try? await Task.sleep(for: .seconds(PipelineStage.totalSeconds))
            isComplete = true
        }
    }

    private func stageFrame(stage: PipelineStage, progress: Double, markOpacity: Double) -> some View {
        VStack(spacing: 24) {
            PlinthsMark(height: 84, color: Theme.Stealth.amber)
                .opacity(markOpacity)

            VStack(spacing: 8) {
                Text(stage.label)
                    .font(Theme.Typeface.title)
                    .foregroundStyle(Theme.Stealth.text)
                Text(stage.description)
                    .font(Theme.Typeface.caption)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                    .multilineTextAlignment(.center)
            }

            progressBar(progress)
        }
    }

    private func pulse(_ elapsed: Double) -> Double {
        0.6 + 0.4 * (0.5 + 0.5 * sin(elapsed * 2))
    }

    private func progressBar(_ progress: Double) -> some View {
        ZStack(alignment: .leading) {
            Capsule().fill(Theme.Stealth.textSecondary.opacity(0.2))
            GeometryReader { geo in
                Capsule()
                    .fill(Theme.Stealth.amber)
                    .frame(width: geo.size.width * progress)
            }
        }
        .frame(width: 200, height: 3)
    }
}

#Preview {
    PipelineLoadingView(idea: "AI fitness coaching app", onCancel: {})
        .background(DesertSkyBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}
