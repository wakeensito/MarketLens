import SwiftUI

/// The Plinths logo mark — four stacked rounded bars, widest at the base and
/// fading as they rise (a "plinth"). Native SwiftUI recreation of the web mark
/// (`PlinthsMark` SVG), so it scales crisply and uses the Theme amber.
struct PlinthsMark: View {
    /// Overall height of the mark in points. The mark is square.
    var height: CGFloat = 36
    var color: Color = Theme.Palette.logoAccent

    /// Bars from top to bottom: (width, opacity), in the SVG's 36-unit space.
    private let bars: [(width: CGFloat, opacity: Double)] = [
        (8, 0.45),
        (18, 0.65),
        (28, 0.85),
        (36, 1.0),
    ]

    var body: some View {
        let unit = height / 36          // scale from the 36-unit viewBox
        VStack(spacing: 3 * unit) {
            ForEach(bars.indices, id: \.self) { index in
                RoundedRectangle(cornerRadius: 1.5 * unit)
                    .fill(color.opacity(bars[index].opacity))
                    .frame(width: bars[index].width * unit, height: 6 * unit)
            }
        }
        .frame(width: height, height: height)
        .accessibilityHidden(true)
    }
}

#Preview {
    PlinthsMark(height: 72)
        .padding()
        .background(Theme.Palette.bg)
}
