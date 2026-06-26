import Foundation

/// A single drifting sand/dust mote in the splash particle field.
struct SandMote {
    var x: CGFloat          // 0...1 horizontal position
    var y: CGFloat          // 0...1 vertical seed
    var size: CGFloat       // point diameter
    var speed: Double       // vertical drift, fraction of height per second
    var baseOpacity: Double
    var twinkleSpeed: Double
    var phase: Double
    var warm: Bool          // amber vs pale sand

    static func random() -> SandMote {
        SandMote(
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
