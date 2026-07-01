import SwiftUI

/// A tappable sample business idea on the empty home. Tapping fills the input
/// (it does not submit).
struct ExampleIdeaChip: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(Theme.Typeface.caption)
                .foregroundStyle(Theme.Stealth.sand)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .overlay(Capsule().stroke(Theme.Stealth.amber.opacity(0.55), lineWidth: 1))
                .clipShape(.capsule)
        }
    }
}

#Preview {
    ExampleIdeaChip(title: "AI fitness coaching app", action: {})
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Stealth.skyTop)
}
