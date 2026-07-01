import SwiftUI

/// The signed-in workspace root: idea-input home, pipeline loading, and — via
/// `ReportSurface` — the report⇄muse surface. History is a sheet (tap ☰).
struct WorkspaceView: View {
    @State private var screen: WorkspaceScreen = .home
    @State private var draft = ""
    @State private var isHistoryOpen = false
    @State private var reportOrigin: ReportOrigin = .home
    @Environment(MuseStore.self) private var store

    private enum ReportOrigin { case home, history }

    var body: some View {
        ZStack {
            DesertSkyBackground().ignoresSafeArea()
            switch screen {
            case .home:
                VStack(spacing: 0) {
                    WorkspaceTopBar(onHistory: { isHistoryOpen = true }, onNew: startNew)
                    WorkspaceHome(draft: $draft, onSubmit: submit)
                }
            case .loading:
                VStack(spacing: 0) {
                    WorkspaceTopBar(onHistory: { isHistoryOpen = true }, onNew: startNew)
                    PipelineLoadingView(idea: draft, onCancel: startNew,
                        onComplete: { showReport(MockMemo.digitalFitness, date: .now, key: MockMemo.digitalFitnessKey, origin: .home) })
                }
            case .report(let memo, let date, let key):
                ReportSurface(memo: memo, date: date, reportKey: key,
                              initialFace: store.hasThread(for: key) ? .muse : .report,
                              onBack: backFromReport)
            }
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $isHistoryOpen) {
            HistoryDrawer(reports: MockWorkspace.history) { report in openReport(for: report) }
                .presentationBackground(Theme.Stealth.skyTop)
                .preferredColorScheme(.dark)
        }
    }

    private func submit() {
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        screen = .loading
    }
    private func showReport(_ memo: MarketMemo, date: Date, key: String, origin: ReportOrigin) {
        reportOrigin = origin
        screen = .report(memo, date, key)
    }
    private func openReport(for report: MockReport) {
        isHistoryOpen = false
        showReport(MockMemo.memo(for: report), date: report.createdAt,
                   key: MockMemo.reportKey(for: report), origin: .history)
    }
    private func backFromReport() {
        screen = .home
        if reportOrigin == .history { isHistoryOpen = true }
    }
    private func startNew() { draft = ""; screen = .home; isHistoryOpen = false }
}
