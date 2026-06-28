import SwiftUI

/// The signed-in workspace root: a dark Stealth-Desert surface hosting the
/// idea-input home, the pipeline-loading screen, and a history list.
///
/// History is presented as a standard sheet (tap ☰). The earlier custom
/// "push-aside" side-menu (card shifts right to reveal the menu) was removed for
/// now — it lives in git history if we want to bring it back.
struct WorkspaceView: View {
    @State private var screen: WorkspaceScreen = .home
    @State private var draft = ""
    @State private var isHistoryOpen = false

    var body: some View {
        ZStack {
            DesertSkyBackground()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                WorkspaceTopBar(onHistory: { isHistoryOpen = true }, onNew: startNew)

                switch screen {
                case .home:
                    WorkspaceHome(draft: $draft, onSubmit: submit)
                case .loading:
                    PipelineLoadingView(idea: draft, onCancel: startNew)
                }
            }
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $isHistoryOpen) {
            HistoryDrawer(reports: MockWorkspace.history) { _ in
                isHistoryOpen = false
            }
            .presentationBackground(Theme.Stealth.skyTop)
            .preferredColorScheme(.dark)
        }
    }

    private func submit() {
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        screen = .loading
    }

    private func startNew() {
        draft = ""
        screen = .home
        isHistoryOpen = false
    }
}
