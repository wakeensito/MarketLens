import SwiftUI

/// One hero score band: a large amber number, the axis label, a thin amber
/// intensity bar (width ∝ score), the valence label, and the receipt. Tone is
/// carried by the label — never by a hue (Stealth is amber-only).
struct BandCard: View {
    let band: ScoreBand

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("\(band.score)")
                    .font(Theme.Typeface.largeTitle)
                    .foregroundStyle(Theme.Stealth.amber)
                Text(band.axis.rawValue.uppercased())
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                Spacer()
                Text(band.label)
                    .font(Theme.Typeface.caption)
                    .foregroundStyle(Theme.Stealth.amber)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.Stealth.amber.opacity(0.15))
                    Capsule().fill(Theme.Stealth.amber)
                        .frame(width: geo.size.width * CGFloat(min(100, max(0, band.score))) / 100)
                }
            }
            .frame(height: 3)

            Text(band.receipt)
                .font(Theme.Typeface.caption)
                .foregroundStyle(Theme.Stealth.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .background(Theme.Stealth.skyMid.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

#Preview {
    VStack(spacing: 12) {
        ForEach(MockMemo.digitalFitness.bands) { BandCard(band: $0) }
    }
    .padding()
    .background(Theme.Stealth.skyTop)
    .preferredColorScheme(.dark)
}
