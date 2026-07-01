import SwiftUI

/// A citation pill in the GROUNDED IN sources row. Tapping routes to the cited
/// report cell (via onTap), unlike the report's URL-opening CitePill.
struct MuseCitePill: View {
    let cell: MuseCellRef
    let onTap: (String) -> Void   // target string, e.g. "competitor-2"

    var body: some View {
        Button { onTap(cell.target) } label: {
            Text(cell.label)
                .font(Theme.Typeface.badge)
                .foregroundStyle(Theme.Stealth.amber)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(Theme.Stealth.amber.opacity(0.12))
                .overlay(Capsule().stroke(Theme.Stealth.amber.opacity(0.25), lineWidth: 1))
                .clipShape(.capsule)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Go to \(cell.label)")
        .accessibilityAddTraits(.isLink)
    }
}

#Preview {
    MuseCitePill(cell: MuseCellRef(target: "competitor-1", label: "Competitors"), onTap: { _ in })
        .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
