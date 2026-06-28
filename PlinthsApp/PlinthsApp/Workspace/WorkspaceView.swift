import SwiftUI

/// The signed-in workspace root: a dark Stealth-Desert surface hosting the
/// idea-input home, a history drawer, and the pipeline-loading screen.
///
/// The history drawer uses the "push-aside" pattern: the workspace renders as a
/// card on top of a fixed `HistoryDrawer` underlay. Sliding (a drag) or tapping
/// ☰ shifts the card right, scales it down, and rounds its corners to reveal the
/// menu — like the ChatGPT/Telegram side menu.
struct WorkspaceView: View {
    @State private var screen: WorkspaceScreen = .home
    @State private var draft = ""
    @State private var isHistoryOpen = false
    /// Non-nil only while a drag is in flight (0 = closed … 1 = fully open).
    @State private var dragProgress: CGFloat?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Corner radius of the pushed-aside card at full open. Large + continuous to
    /// match the reference side-menu's rounded slab.
    private let cornerRadius: CGFloat = 40

    var body: some View {
        GeometryReader { geo in
            // A slimmer menu leaves a wider card sliver on the right — the
            // proportion the reference uses (~quarter of the screen still shows).
            let menuWidth = min(geo.size.width * 0.78, 330)
            let progress = dragProgress ?? (isHistoryOpen ? 1 : 0)
            let radius = cornerRadius * progress

            ZStack(alignment: .leading) {
                HistoryDrawer(
                    reports: MockWorkspace.history,
                    width: menuWidth,
                    onSelect: { _ in close() }
                )

                workspaceCard
                    // Full-height slide — no scale. The card stays a full-screen
                    // panel pushed aside (depth comes from the rounded edge +
                    // shadow, not from shrinking), so nothing cuts off under the
                    // input or at the top.
                    .offset(x: menuWidth * progress)
                    .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
                    .overlay {
                        // A hairline defines the curved edge against the dark menu.
                        RoundedRectangle(cornerRadius: radius, style: .continuous)
                            .strokeBorder(Color.white.opacity(0.12 * progress), lineWidth: 1)
                    }
                    .shadow(color: .black.opacity(0.6 * progress), radius: 28, x: -14)
                    .overlay {
                        // When fully open, the visible card sliver taps closed.
                        if progress >= 0.999 {
                            Button(action: close) {
                                Color.clear.contentShape(.rect)
                            }
                            .accessibilityLabel("Close history")
                        }
                    }
                    .gesture(dragGesture(menuWidth: menuWidth))
            }
            // Darkest shade behind the menu so the desert card pops forward.
            .background(Theme.Stealth.skyTop.ignoresSafeArea())
            .animation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.86), value: isHistoryOpen)
            .animation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.86), value: dragProgress)
        }
        .preferredColorScheme(.dark)
    }

    private var workspaceCard: some View {
        ZStack {
            DesertSkyBackground()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                WorkspaceTopBar(onHistory: open, onNew: startNew)

                switch screen {
                case .home:
                    WorkspaceHome(draft: $draft, onSubmit: submit)
                case .loading:
                    PipelineLoadingView(idea: draft, onCancel: startNew)
                }
            }
        }
    }

    /// A horizontal drag opens/closes the menu, following the finger. Vertical-
    /// dominant drags are ignored so scrolling and typing aren't hijacked.
    private func dragGesture(menuWidth: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 18)
            .onChanged { value in
                guard abs(value.translation.width) > abs(value.translation.height) else { return }
                let base = isHistoryOpen ? menuWidth : 0
                dragProgress = max(0, min(1, (base + value.translation.width) / menuWidth))
            }
            .onEnded { value in
                let base = isHistoryOpen ? menuWidth : 0
                let projected = base + value.translation.width + value.predictedEndTranslation.width * 0.15
                dragProgress = nil
                isHistoryOpen = projected > menuWidth * 0.5
            }
    }

    private func open() { isHistoryOpen = true }
    private func close() { isHistoryOpen = false }

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
