import SwiftUI

/// The docked Muse composer — a recessed field + amber send, styled like the
/// workspace IdeaInputBar. Emits the trimmed text and clears on submit.
struct MuseComposer: View {
    var placeholder: String = "Ask a follow-up…"
    let onSubmit: (String) -> Void

    @State private var draft = ""
    @FocusState private var focused: Bool

    private var canSubmit: Bool { !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            TextField(placeholder, text: $draft, axis: .vertical)
                .font(Theme.Typeface.body)
                .foregroundStyle(Theme.Stealth.text)
                .tint(Theme.Stealth.amber)
                .lineLimit(1...4)
                .focused($focused)
                .submitLabel(.go)
                .onSubmit(submit)
            Button(action: submit) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.Stealth.skyTop)
                    .frame(width: 36, height: 36)
                    .background(Theme.Stealth.amber.opacity(canSubmit ? 1 : 0.4))
                    .clipShape(.circle)
            }
            .disabled(!canSubmit)
            .accessibilityLabel("Send")
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(Theme.Stealth.skyMid.opacity(0.55))
                .overlay(RoundedRectangle(cornerRadius: 22).stroke(Theme.Stealth.amber.opacity(0.14), lineWidth: 1))
        )
    }

    private func submit() {
        guard canSubmit else { return }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        draft = ""; focused = false
        onSubmit(text)
    }
}

#Preview {
    MuseComposer(onSubmit: { _ in })
        .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
