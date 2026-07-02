import SwiftUI

/// The Build Brief face: a generate state machine (idle → generating → ready)
/// over the shared composer. The brief content is canned per report; the store
/// tracks whether it's been "generated" this session.
struct BuildBriefView: View {
    let reportKey: String
    let onBack: () -> Void
    let onAsk: (String) -> Void
    let onNavigate: (ReportFace) -> Void

    @Environment(BuildBriefStore.self) private var store

    private var brief: BuildBrief { MockBuildBrief.brief(for: reportKey) }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            content
            WorkspaceComposer(current: .brief, onNavigate: onNavigate, onSubmit: onAsk)
                .padding(.horizontal, 20).padding(.bottom, 12)
        }
        .background(Theme.Stealth.skyTop.ignoresSafeArea())
        // When the store enters .generating, model ~1.5s of work then reveal.
        .task(id: store.state(for: reportKey)) {
            guard store.state(for: reportKey) == .generating else { return }
            try? await Task.sleep(for: .seconds(1.5))
            // If the view went away (or the state changed) mid-sleep, don't
            // force-complete — leave it .generating so it re-runs on return.
            guard !Task.isCancelled else { return }
            store.markReady(reportKey)
        }
    }

    @ViewBuilder private var content: some View {
        switch store.state(for: reportKey) {
        case .idle:
            BuildBriefInvite { store.startGenerating(reportKey) }
        case .generating:
            BuildBriefSkeleton()
        case .ready:
            ScrollView { BuildBriefBody(brief: brief).padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 24) }
        }
    }

    private var topBar: some View {
        HStack {
            Button(action: onBack) {
                Image(systemName: "chevron.left").font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Theme.Stealth.textSecondary).frame(width: 44, height: 44).contentShape(.rect)
            }
            .accessibilityLabel("Back")
            Spacer()
        }
        .padding(.horizontal, 8)
    }
}
