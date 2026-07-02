import SwiftUI

/// Below a Muse answer: mono action buttons (left) + thumbs feedback (right).
/// Amber-only: an active thumb (up OR down) colors amber; icon carries valence.
struct MuseActionRow: View {
    let feedback: MuseFeedbackValue
    let onCopy: () -> Void
    let onRegenerate: () -> Void
    let onCiteMarkdown: () -> Void
    let onFeedback: (MuseFeedbackValue) -> Void

    var body: some View {
        HStack {
            HStack(spacing: 14) {
                action("COPY", onCopy)
                action("REGENERATE", onRegenerate)
                action("CITE AS MARKDOWN", onCiteMarkdown)
            }
            Spacer()
            HStack(spacing: 12) {
                thumb("hand.thumbsup", active: feedback == .up) { onFeedback(feedback == .up ? .none : .up) }
                thumb("hand.thumbsdown", active: feedback == .down) { onFeedback(feedback == .down ? .none : .down) }
            }
        }
    }

    private func action(_ title: String, _ tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            Text(title).font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
        }
        .buttonStyle(.plain)
    }

    private func thumb(_ symbol: String, active: Bool, _ tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            Image(systemName: active ? "\(symbol).fill" : symbol)
                .font(.system(size: 15))
                .foregroundStyle(active ? Theme.Stealth.amber : Theme.Stealth.textSecondary)
                .frame(width: 30, height: 30)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(symbol.contains("up") ? "Helpful" : "Not helpful")
    }
}

#Preview {
    MuseActionRow(feedback: .up, onCopy: {}, onRegenerate: {}, onCiteMarkdown: {}, onFeedback: { _ in })
        .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
