import SwiftUI

/// The signed-in workspace root: a dark Stealth-Desert surface hosting the
/// idea-input home, a history drawer, and the pipeline-loading screen.
/// (Task 4 adds the drawer; Task 5 the loading screen.)
struct WorkspaceView: View {
    @State private var draft = ""

    var body: some View {
        ZStack {
            DesertSkyBackground()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                WorkspaceTopBar(onHistory: {}, onNew: startNew)
                WorkspaceHome(draft: $draft, onSubmit: {})
            }
        }
        .preferredColorScheme(.dark)
    }

    private func startNew() {
        draft = ""
    }
}

#Preview {
    WorkspaceView()
}
