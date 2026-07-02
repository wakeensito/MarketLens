import SwiftUI

/// Three follow-up questions as a vertical list with hairline separators. Each
/// row is a question + a right arrow; tap fires the question.
struct MuseFollowupChips: View {
    let questions: [String]
    let onTap: (String) -> Void

    var body: some View {
        VStack(spacing: 0) {
            Divider().overlay(Theme.Stealth.textSecondary.opacity(0.15))
            ForEach(questions, id: \.self) { q in
                Button { onTap(q) } label: {
                    HStack {
                        Text(q).font(Theme.Typeface.body).foregroundStyle(Theme.Stealth.text)
                        Spacer()
                        Image(systemName: "arrow.right").font(.system(size: 13)).foregroundStyle(Theme.Stealth.amber)
                            .accessibilityHidden(true)
                    }
                    .padding(.vertical, 12)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                Divider().overlay(Theme.Stealth.textSecondary.opacity(0.15))
            }
        }
    }
}

#Preview {
    MuseFollowupChips(questions: ["Where's the opening?", "How hard is it to enter?", "What would you build first?"], onTap: { _ in })
        .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
