import SwiftUI

/// The signed-in workspace root: the idea-input home, the pipeline-loading
/// screen, and — new in M3 — the market-memo report. History is a sheet (tap ☰).
/// The report is a dedicated full-screen surface; `reportOrigin` remembers where
/// it was opened from so back returns there.
struct WorkspaceView: View {
    @State private var screen: WorkspaceScreen = .home
    @State private var draft = ""
    @State private var isHistoryOpen = false
    @State private var reportOrigin: ReportOrigin = .home

    private enum ReportOrigin { case home, history }

    var body: some View {
        ZStack {
            DesertSkyBackground()
                .ignoresSafeArea()

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
                                        onComplete: { showReport(MockMemo.digitalFitness, origin: .home) })
                }
            case .report(let memo):
                MemoView(memo: memo, onBack: backFromReport)
            }
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $isHistoryOpen) {
            HistoryDrawer(reports: MockWorkspace.history) { report in
                openReport(for: report)
            }
            .presentationBackground(Theme.Stealth.skyTop)
            .preferredColorScheme(.dark)
        }
    }

    private func submit() {
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        screen = .loading
    }

    private func showReport(_ memo: MarketMemo, origin: ReportOrigin) {
        reportOrigin = origin
        screen = .report(memo)
    }

    private func openReport(for report: MockReport) {
        isHistoryOpen = false
        showReport(MockMemo.memo(for: report), origin: .history)
    }

    private func backFromReport() {
        screen = .home
        if reportOrigin == .history { isHistoryOpen = true }
    }

    private func startNew() {
        draft = ""
        screen = .home
        isHistoryOpen = false
    }
}
