import SwiftUI

/// The signed-in workspace root: a dark Stealth-Desert surface hosting the
/// idea-input home, a history drawer, and the pipeline-loading screen.
/// (This task ships the top bar over a placeholder hero; Task 3 adds the real
/// home, Task 4 the drawer, Task 5 the loading screen.)
struct WorkspaceView: View {
    var body: some View {
        ZStack {
            DesertSkyBackground()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                WorkspaceTopBar(onHistory: {}, onNew: {})
                Spacer()
                VStack(spacing: 12) {
                    Text("What are you building?")
                        .font(Theme.Typeface.title)
                        .foregroundStyle(Theme.Stealth.text)
                    Text("Describe an idea to map its competitive landscape.")
                        .font(Theme.Typeface.caption)
                        .foregroundStyle(Theme.Stealth.textSecondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 20)
                Spacer()
            }
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    WorkspaceView()
}
