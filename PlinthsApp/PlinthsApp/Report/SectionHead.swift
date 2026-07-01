import SwiftUI

/// A numbered section header: mono number, serif name, and a plain-English
/// question beneath. Mirrors the web memo's SectionHead.
struct SectionHead: View {
    let num: String
    let name: String
    let question: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(num)
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.amber)
                Text(name)
                    .font(Theme.Typeface.title)
                    .foregroundStyle(Theme.Stealth.text)
            }
            Text(question)
                .font(Theme.Typeface.caption)
                .foregroundStyle(Theme.Stealth.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    SectionHead(num: "01", name: "Market Size", question: "How big is this market, and is it growing?")
        .padding()
        .background(Theme.Stealth.skyTop)
        .preferredColorScheme(.dark)
}
