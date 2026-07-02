import SwiftUI

/// The GROUNDED IN row above a Muse answer — a mono label + citation pills.
/// Renders nothing when there are no sources.
struct MuseSourcesRow: View {
    let sources: [MuseCellRef]
    let onTap: (String) -> Void

    var body: some View {
        if !sources.isEmpty {
            HStack(spacing: 8) {
                Text("GROUNDED IN")
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                ForEach(sources) { MuseCitePill(cell: $0, onTap: onTap) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

#Preview {
    MuseSourcesRow(sources: [MuseCellRef(target: "competitor-1", label: "Competitors"),
                             MuseCellRef(target: "gap-1", label: "Gap 01")], onTap: { _ in })
        .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
