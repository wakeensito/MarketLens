import SwiftUI

/// The bottom-docked idea composer: a multi-line text field and an amber send
/// button. Text + send only — no model picker or attachment (Plinths has
/// neither). Send is disabled until there is non-empty text.
struct IdeaInputBar: View {
    @Binding var draft: String
    var onSubmit: () -> Void
    @FocusState.Binding var isFocused: Bool

    private var canSubmit: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            TextField("Describe your idea…", text: $draft, axis: .vertical)
                .font(Theme.Typeface.body)
                .foregroundStyle(Theme.Stealth.text)
                .tint(Theme.Stealth.amber)
                .lineLimit(1...4)
                .focused($isFocused)
                .submitLabel(.go)

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
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            // Recessed, not boxed: a translucent fill lets the desert gradient
            // show through and a whisper-faint amber hairline keeps the field
            // discoverable without standing apart from the background.
            RoundedRectangle(cornerRadius: 22)
                .fill(Theme.Stealth.skyMid.opacity(0.55))
                .overlay(
                    RoundedRectangle(cornerRadius: 22)
                        .stroke(Theme.Stealth.amber.opacity(0.14), lineWidth: 1)
                )
        )
    }

    private func submit() {
        guard canSubmit else { return }
        isFocused = false
        onSubmit()
    }
}
