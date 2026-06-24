import SwiftUI

/// An animated field of faint sand motes drifting slowly upward and twinkling.
/// Honors Reduce Motion by rendering a still field.
struct SandParticleField: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let motes: [SandMote] = (0..<80).map { _ in SandMote.random() }

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { timeline in
            Canvas { context, size in
                let now = timeline.date.timeIntervalSinceReferenceDate
                for mote in motes {
                    let drift = reduceMotion ? 0 : now * mote.speed
                    var y = (mote.y - drift).truncatingRemainder(dividingBy: 1)
                    if y < 0 { y += 1 }

                    let twinkle = reduceMotion
                        ? mote.baseOpacity
                        : mote.baseOpacity * (0.4 + 0.6 * (0.5 + 0.5 * sin(now * mote.twinkleSpeed + mote.phase)))

                    let rect = CGRect(
                        x: mote.x * size.width,
                        y: y * size.height,
                        width: mote.size,
                        height: mote.size
                    )
                    let color = mote.warm ? Theme.Stealth.amber : Theme.Stealth.sand
                    context.fill(Path(ellipseIn: rect), with: .color(color.opacity(twinkle)))
                }
            }
        }
        .accessibilityHidden(true)
    }
}

#Preview {
    ZStack {
        DesertSkyBackground()
        SandParticleField()
    }
    .ignoresSafeArea()
}
