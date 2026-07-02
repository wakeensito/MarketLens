import SwiftUI

/// One report's two faces — the memo report and its Muse conversation — swapped
/// by a destination-toggle glyph. Owns the citation-highlight + pending-ask state.
struct ReportSurface: View {
    let memo: MarketMemo
    let date: Date
    let reportKey: String
    let initialFace: ReportFace
    let onBack: () -> Void

    @Environment(MuseStore.self) private var store
    @State private var face: ReportFace
    @State private var highlight: MuseCitationTarget?
    @State private var pendingAsk: String?     // a report-composer question to run on the Muse face

    init(memo: MarketMemo, date: Date, reportKey: String, initialFace: ReportFace, onBack: @escaping () -> Void) {
        self.memo = memo; self.date = date; self.reportKey = reportKey
        self.initialFace = initialFace; self.onBack = onBack
        _face = State(initialValue: initialFace)
    }

    var body: some View {
        switch face {
        case .report:
            MemoView(memo: memo, date: date, highlightTarget: highlight, onBack: onBack,
                     onAsk: { openMuseAsking($0) }, onNavigate: { navigate(to: $0) })
        case .brief:
            EmptyView()   // wired to BuildBriefView in Task 11
        case .muse:
            MuseView(reportKey: reportKey,
                     pendingAsk: pendingAsk,
                     onConsumePendingAsk: { pendingAsk = nil },
                     onCite: { routeCite($0) },
                     onBack: onBack,
                     onNavigate: { navigate(to: $0) })
        }
    }

    // A free-typed question from the report composer: stash it and flip to Muse,
    // which runs it once on appear (so it streams). We do NOT append here — that
    // keeps all append+animate logic inside MuseView, so a later toggle back to
    // the Muse face renders the thread statically instead of re-animating.
    private func openMuseAsking(_ query: String) {
        pendingAsk = query; highlight = nil; face = .muse
    }

    // A citation tap in Muse: flip to the report, highlight the cell.
    private func routeCite(_ target: String) {
        guard let t = museTarget(target) else { return }
        highlight = t; face = .report
    }

    private func navigate(to target: ReportFace) { highlight = nil; face = target }
}
