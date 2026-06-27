import SwiftUI

/// The history menu that sits *underneath* the workspace card. When the user
/// slides (or taps ☰), the workspace shifts right to reveal this panel — so the
/// drawer itself is a fixed underlay, not an overlay. Selecting a row is a stub
/// in M2 (the report UI is M3).
struct HistoryDrawer: View {
    let reports: [MockReport]
    let width: CGFloat
    let onSelect: (MockReport) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("HISTORY")
                .font(Theme.Typeface.label)
                .foregroundStyle(Theme.Stealth.textSecondary)
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 16)

            ScrollView {
                VStack(spacing: 0) {
                    ForEach(reports) { report in
                        HistoryRow(report: report) { onSelect(report) }
                            .padding(.horizontal, 20)
                            .padding(.vertical, 14)
                        Divider().overlay(Theme.Stealth.textSecondary.opacity(0.15))
                    }
                }
            }
        }
        .frame(width: width, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

#Preview {
    HistoryDrawer(reports: MockWorkspace.history, width: 300, onSelect: { _ in })
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(Theme.Stealth.skyMid)
        .preferredColorScheme(.dark)
}
