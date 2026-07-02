import SwiftUI

/// One report's three faces — report / build brief / muse — swapped by the
/// composer's destination glyphs. Owns the citation highlight + pending-ask.
struct ReportSurface: View {
    let memo: MarketMemo
    let date: Date
    let reportKey: String
    let initialFace: ReportFace
    let onBack: () -> Void

    @State private var face: ReportFace
    @State private var highlight: MuseCitationTarget?
    @State private var pendingAsk: String?

    init(memo: MarketMemo, date: Date, reportKey: String, initialFace: ReportFace, onBack: @escaping () -> Void) {
        self.memo = memo; self.date = date; self.reportKey = reportKey
        self.initialFace = initialFace; self.onBack = onBack
        _face = State(initialValue: initialFace)
    }

    var body: some View {
        switch face {
        case .report:
            MemoView(memo: memo, date: date, highlightTarget: highlight, onBack: onBack,
                     onAsk: { openMuseAsking($0) },
                     onNavigate: { navigate(to: $0) })
        case .brief:
            BuildBriefView(reportKey: reportKey, onBack: onBack,
                           onAsk: { openMuseAsking($0) },
                           onNavigate: { navigate(to: $0) })
        case .muse:
            MuseView(reportKey: reportKey, pendingAsk: pendingAsk,
                     onConsumePendingAsk: { pendingAsk = nil },
                     onCite: { routeCite($0) },
                     onBack: onBack,
                     onNavigate: { navigate(to: $0) })
        }
    }

    private func navigate(to target: ReportFace) { highlight = nil; face = target }

    private func openMuseAsking(_ query: String) { pendingAsk = query; highlight = nil; face = .muse }

    private func routeCite(_ target: String) {
        guard let t = museTarget(target) else { return }
        highlight = t; face = .report
    }
}
