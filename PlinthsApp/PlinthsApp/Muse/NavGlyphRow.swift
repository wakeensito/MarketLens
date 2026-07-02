import SwiftUI

/// The destination-glyph group for the composer: renders the two surfaces you
/// are NOT on, in fixed order. Tapping one navigates there.
struct NavGlyphRow: View {
    let current: ReportFace
    let onNavigate: (ReportFace) -> Void

    private let order: [ReportFace] = [.report, .brief, .muse]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(order.filter { $0 != current }, id: \.self) { face in
                Button { onNavigate(face) } label: {
                    glyph(face).frame(width: 34, height: 34).contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(label(face))
            }
        }
    }

    @ViewBuilder private func glyph(_ face: ReportFace) -> some View {
        switch face {
        case .report: SaturationToggleMark()
        case .brief:  Image(systemName: "square.grid.2x2").font(.system(size: 16, weight: .medium)).foregroundStyle(Theme.Stealth.amber)
        case .muse:   Image(systemName: "message").font(.system(size: 16, weight: .medium)).foregroundStyle(Theme.Stealth.amber)
        }
    }

    private func label(_ face: ReportFace) -> String {
        switch face {
        case .report: "Open report"
        case .brief:  "Open build brief"
        case .muse:   "Open chat"
        }
    }
}

#Preview {
    VStack(spacing: 12) {
        NavGlyphRow(current: .report, onNavigate: { _ in })
        NavGlyphRow(current: .brief, onNavigate: { _ in })
        NavGlyphRow(current: .muse, onNavigate: { _ in })
    }
    .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
