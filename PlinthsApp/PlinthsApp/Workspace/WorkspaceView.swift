import SwiftUI

/// The signed-in workspace root: a dark Stealth-Desert surface hosting the
/// idea-input home, a history drawer, and the pipeline-loading screen.
struct WorkspaceView: View {
    @State private var screen: WorkspaceScreen = .home
    @State private var draft = ""
    @State private var isHistoryOpen = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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

            if isHistoryOpen {
                HistoryDrawer(
                    reports: MockWorkspace.history,
                    onClose: { isHistoryOpen = false },
                    onSelect: { _ in isHistoryOpen = false }
                )
                .transition(reduceMotion ? .opacity : .move(edge: .leading).combined(with: .opacity))
                .zIndex(1)
            }
        }
        .preferredColorScheme(.dark)
        .animation(.easeOut(duration: 0.28), value: isHistoryOpen)
        .animation(.easeInOut(duration: 0.3), value: screen)
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

#Preview {
    WorkspaceView()
}
