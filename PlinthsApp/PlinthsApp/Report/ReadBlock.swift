import SwiftUI

/// The Bottom Line: the synthesis, an amber-eyebrowed recommendation, and the
/// honest limit disclaimer (de-emphasized).
struct ReadBlock: View {
    let read: MemoRead

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("The Bottom Line")
                .font(Theme.Typeface.title)
                .foregroundStyle(Theme.Stealth.text)

            Text(read.synthesis)
                .font(Theme.Typeface.body)
                .foregroundStyle(Theme.Stealth.text)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 6) {
                Text("RECOMMENDATION")
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.amber)
                Text(read.recommendation)
                    .font(Theme.Typeface.body)
                    .foregroundStyle(Theme.Stealth.text)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Text(read.limit)
                .font(Theme.Typeface.caption)
                .foregroundStyle(Theme.Stealth.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    ReadBlock(read: MockMemo.digitalFitness.read)
        .padding()
        .background(Theme.Stealth.skyTop)
        .preferredColorScheme(.dark)
}
