import SwiftUI

/// The history list of past reports, presented as a sheet from the workspace
/// (tap ☰). Selecting a row is a stub in M2 (the report UI is M3).
struct HistoryDrawer: View {
    let reports: [MockReport]
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
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

#Preview {
    HistoryDrawer(reports: MockWorkspace.history, onSelect: { _ in })
        .background(Theme.Stealth.skyTop)
        .preferredColorScheme(.dark)
}
