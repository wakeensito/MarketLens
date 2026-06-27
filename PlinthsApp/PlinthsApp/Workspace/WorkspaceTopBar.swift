import SwiftUI

/// The workspace top bar: a history button, the plinths wordmark, and a
/// new-report button. Sits above the active screen.
struct WorkspaceTopBar: View {
    let onHistory: () -> Void
    let onNew: () -> Void

    var body: some View {
        HStack {
            iconButton("line.3.horizontal", label: "Open history", action: onHistory)
            Spacer()
            Text("plinths")
                .font(Theme.Typeface.wordmark)
                .foregroundStyle(Theme.Stealth.text)
            Spacer()
            iconButton("plus", label: "New report", action: onNew)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private func iconButton(_ systemName: String, label: String,
                            action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(Theme.Stealth.textSecondary)
                .frame(width: 44, height: 44)
                .contentShape(.rect)
        }
        .accessibilityLabel(label)
    }
}

#Preview {
    VStack {
        WorkspaceTopBar(onHistory: {}, onNew: {})
        Spacer()
    }
    .background(Theme.Stealth.skyTop)
}
