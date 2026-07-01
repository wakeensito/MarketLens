import SwiftUI

/// One market gap: a "Gap NN" label, the grounded opportunity score, title,
/// description, the underserved audience, tags, and — when present — a receipts
/// block of real complaints.
struct GapRow: View {
    let index: Int
    let gap: MemoGap

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(String(format: "Gap %02d", index))
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.amber)
                Spacer()
                Text("\(gap.opportunityScore)")
                    .font(Theme.Typeface.label)
                    .foregroundStyle(Theme.Stealth.amber)
                Text("SCORE")
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.textSecondary)
            }

            Text(gap.title)
                .font(Theme.Typeface.title)
                .foregroundStyle(Theme.Stealth.text)
                .fixedSize(horizontal: false, vertical: true)

            Text(gap.description)
                .font(Theme.Typeface.body)
                .foregroundStyle(Theme.Stealth.text)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 2) {
                Text("UNDERSERVED")
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                Text(gap.underserved)
                    .font(Theme.Typeface.caption)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !gap.tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(gap.tags, id: \.self) { tag in
                            Text(tag)
                                .font(Theme.Typeface.badge)
                                .foregroundStyle(Theme.Stealth.textSecondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .overlay(Capsule().stroke(Theme.Stealth.textSecondary.opacity(0.25), lineWidth: 1))
                        }
                    }
                }
            }

            if !gap.quotes.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(gap.quotes) { MemoQuoteRow(quote: $0) }
                }
                .padding(.top, 2)
            }
        }
    }
}

/// A single quoted pain point — the gap's receipt. An amber rule marks it as a
/// pulled quote; the source is a tappable pill.
struct MemoQuoteRow: View {
    let quote: GapQuote

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(quote.quote)
                .font(Theme.Typeface.caption)
                .foregroundStyle(Theme.Stealth.sand)
                .fixedSize(horizontal: false, vertical: true)
            CitePill(source: quote.source)
        }
        .padding(.leading, 12)
        .overlay(alignment: .leading) {
            Rectangle().fill(Theme.Stealth.amber.opacity(0.4)).frame(width: 2)
        }
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 20) {
        ForEach(Array(MockMemo.digitalFitness.gaps.enumerated()), id: \.element.id) { i, gap in
            GapRow(index: i + 1, gap: gap)
        }
    }
    .padding()
    .background(Theme.Stealth.skyTop)
    .preferredColorScheme(.dark)
}
