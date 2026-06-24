import SwiftUI

/// A single drifting sand/dust mote.
private struct Mote {
    var x: CGFloat          // 0...1 horizontal position
    var y: CGFloat          // 0...1 vertical seed
    var size: CGFloat       // point diameter
    var speed: Double       // vertical drift, fraction of height per second
    var baseOpacity: Double
    var twinkleSpeed: Double
    var phase: Double
    var warm: Bool          // amber vs pale sand

    static func random() -> Mote {
        Mote(
            x: .random(in: 0...1),
            y: .random(in: 0...1),
            size: .random(in: 1...2.6),
            speed: .random(in: 0.004...0.018),
            baseOpacity: .random(in: 0.15...0.7),
            twinkleSpeed: .random(in: 0.4...1.6),
            phase: .random(in: 0...(2 * .pi)),
            warm: Bool.random()
        )
    }
}

/// An animated field of faint sand motes drifting slowly upward and twinkling.
/// Honors Reduce Motion by rendering a still field.
struct SandParticleField: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let motes: [Mote] = (0..<80).map { _ in Mote.random() }

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
