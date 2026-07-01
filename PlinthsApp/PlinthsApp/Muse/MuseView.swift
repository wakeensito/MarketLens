import SwiftUI
import UIKit

/// The Muse conversation face: a scroll of document-pair turns over a docked
/// composer. Asking resolves a canned turn (MockMuse) and appends it to the store.
struct MuseView: View {
    let reportKey: String
    let onCite: (String) -> Void
    let onToggleToReport: () -> Void
    let onBack: () -> Void

    @Environment(MuseStore.self) private var store
    @State private var lastTurnID: String?     // the turn to animate (freshly appended)

    private var turns: [MuseTurn] { store.thread(for: reportKey) }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        if turns.isEmpty { MuseEmptyLine() }
                        ForEach(turns) { turn in
                            MuseTurnView(
                                turn: turn, isLast: turn.id == turns.last?.id,
                                animate: turn.id == lastTurnID,
                                onCite: onCite,
                                onFollowup: { ask(chip: $0) },
                                onFeedback: { store.setFeedback($0, turnID: turn.id, reportKey: reportKey) },
                                onCopy: { UIPasteboard.general.string = turn.answerRaw },
                                onRegenerate: { lastTurnID = nil; DispatchQueue.main.async { lastTurnID = turn.id } },
                                onCiteMarkdown: { UIPasteboard.general.string = "> \(turn.answerRaw)\n\n— Muse, grounded in this report" })
                            .id(turn.id)
                        }
                    }
                    .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 24)
                }
                .onChange(of: turns.count) {
                    if let last = turns.last?.id { withAnimation { proxy.scrollTo(last, anchor: .bottom) } }
                }
            }
            MuseComposer { ask(free: $0) }
                .padding(.horizontal, 20).padding(.bottom, 12)
        }
        .background(Theme.Stealth.skyTop.ignoresSafeArea())
    }

    private var topBar: some View {
        HStack {
            Button(action: onBack) {
                Image(systemName: "chevron.left").font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Theme.Stealth.textSecondary).frame(width: 44, height: 44).contentShape(.rect)
            }
            .accessibilityLabel("Back")
            Spacer()
            Button(action: onToggleToReport) { SaturationToggleMark().frame(width: 44, height: 44).contentShape(.rect) }
                .accessibilityLabel("Show report")
        }
        .padding(.horizontal, 8)
    }

    private func ask(free query: String) {
        let turn = MockMuse.canonicalTurn(for: reportKey, query: query)
        store.append(turn, for: reportKey); lastTurnID = turn.id
    }
    private func ask(chip: String) {
        let turn = MockMuse.turn(forChip: chip, in: reportKey)
        store.append(turn, for: reportKey); lastTurnID = turn.id
    }
}
