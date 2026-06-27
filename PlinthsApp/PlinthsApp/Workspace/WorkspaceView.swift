import SwiftUI

/// The signed-in workspace root: a dark Stealth-Desert surface hosting the
/// idea-input home, a history drawer, and the pipeline-loading screen.
/// (Task 5 adds the loading screen.)
struct WorkspaceView: View {
    @State private var draft = ""
    @State private var isHistoryOpen = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            DesertSkyBackground()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                WorkspaceTopBar(onHistory: { isHistoryOpen = true }, onNew: startNew)
                WorkspaceHome(draft: $draft, onSubmit: {})
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
    }

    private func startNew() {
        draft = ""
        isHistoryOpen = false
    }
}

#Preview {
    WorkspaceView()
}
