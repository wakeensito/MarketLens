import SwiftUI

/// The slide-in history panel: a tappable scrim plus a leading panel listing
/// mock past reports. Selecting a row is a stub in M2 (the report UI is M3).
struct HistoryDrawer: View {
    let reports: [MockReport]
    let onClose: () -> Void
    let onSelect: (MockReport) -> Void

    var body: some View {
        GeometryReader { geo in
            let width = min(geo.size.width * 0.82, 340)
            ZStack(alignment: .leading) {
                Color.black.opacity(0.45)
                    .ignoresSafeArea()
                    .onTapGesture(perform: onClose)
                    .accessibilityLabel("Close history")

                // The panel content respects the safe area (so "HISTORY" clears
                // the status bar); the skyMid fill behind it extends into the
                // notch and home-indicator regions.
                panel
                    .frame(width: width, alignment: .leading)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .background(alignment: .leading) {
                        Theme.Stealth.skyMid
                            .frame(width: width)
                            .ignoresSafeArea()
                    }
            }
        }
    }

    private var panel: some View {
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
    }
}

#Preview {
    HistoryDrawer(reports: MockWorkspace.history, onClose: {}, onSelect: { _ in })
        .preferredColorScheme(.dark)
}
