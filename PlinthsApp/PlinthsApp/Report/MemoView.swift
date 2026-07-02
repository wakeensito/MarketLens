import SwiftUI

/// The full market-memo report. In M4 it is one face of the report surface:
/// it hosts a docked "Ask about this report…" composer, a toggle glyph to the
/// Muse face, and citation scroll-targets that pulse when arrived at.
struct MemoView: View {
    let memo: MarketMemo
    let date: Date
    let highlightTarget: MuseCitationTarget?     // set on citation arrival
    let hasThread: Bool                          // show the chat-bubble toggle
    let onBack: () -> Void
    let onAsk: (String) -> Void                  // free-typed question → open Muse
    let onToggleToMuse: () -> Void
    let onBannerBack: () -> Void

    @State private var pulseID: String?

    var body: some View {
        VStack(spacing: 0) {
            topBar
            if highlightTarget != nil { BackToChatBanner(onBack: onBannerBack) }
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        identity
                        bands
                        divider
                        section("01", "Market Size", "How big is this market, and is it growing?") { marketSize }
                        divider
                        section("02", "Who Else Is Doing This", "Who's already out there, and where are they weak?") { competitors }
                        divider
                        section("03", "Why Now", "Why is this a good time to start?") { whyNow }
                        divider
                        section("04", "Market Gaps", "What are people missing that you could offer?") { gaps }
                        divider
                        section("05", "What It Takes to Start", "What will you need to get going?") { entryCost }
                        divider
                        section("06", "Where to Start", "What are the first moves to get going?") { roadmap }
                        divider
                        ReadBlock(read: memo.read)
                    }
                    .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 24)
                }
                .onAppear { routeHighlight(proxy) }
                .onChange(of: highlightTarget) { routeHighlight(proxy) }
            }
            MuseComposer(placeholder: "Ask about this report…") { onAsk($0) }
                .padding(.horizontal, 20).padding(.bottom, 12)
        }
        .background(Theme.Stealth.skyTop.ignoresSafeArea())
    }

    private func routeHighlight(_ proxy: ScrollViewProxy) {
        guard let id = highlightTarget?.cellID else { return }
        withAnimation { proxy.scrollTo(id, anchor: .center) }
        pulseID = id
        // Only clear if a newer highlight hasn't taken over the pulse.
        Task { try? await Task.sleep(nanoseconds: 1_600_000_000); if pulseID == id { pulseID = nil } }
    }

    private func pulse(_ id: String) -> some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(Theme.Stealth.amber.opacity(pulseID == id ? 0.9 : 0), lineWidth: 2)
            .animation(.easeOut(duration: 1.6), value: pulseID)
    }

    private var topBar: some View {
        HStack {
            Button(action: onBack) {
                Image(systemName: "chevron.left").font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Theme.Stealth.textSecondary).frame(width: 44, height: 44).contentShape(.rect)
            }
            .accessibilityLabel("Back")
            Spacer()
            if hasThread {
                Button(action: onToggleToMuse) {
                    Image(systemName: "message").font(.system(size: 17, weight: .medium))
                        .foregroundStyle(Theme.Stealth.textSecondary).frame(width: 44, height: 44).contentShape(.rect)
                }
                .accessibilityLabel("Show conversation")
            }
            ShareLink(item: memoMarkdown(memo)) {
                Image(systemName: "square.and.arrow.up").font(.system(size: 17, weight: .medium))
                    .foregroundStyle(Theme.Stealth.textSecondary).frame(width: 44, height: 44).contentShape(.rect)
            }
            .accessibilityLabel("Share memo")
        }
        .padding(.horizontal, 8)
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text("MARKET MEMO").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.amber)
                Text("·").foregroundStyle(Theme.Stealth.textSecondary)
                Text(briefId).font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
                Text("·").foregroundStyle(Theme.Stealth.textSecondary)
                Text(dateStr).font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
            }
            Text(memo.vertical).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
            Text(memo.oneliner).font(Theme.Typeface.title).foregroundStyle(Theme.Stealth.text)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 4) {
                Text("THE IDEA").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
                Text(memo.idea).font(Theme.Typeface.body).foregroundStyle(Theme.Stealth.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var bands: some View {
        VStack(spacing: 12) { ForEach(memo.bands) { BandCard(band: $0) } }
    }

    private var marketSize: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(memo.marketSize.tam).font(Theme.Typeface.largeTitle).foregroundStyle(Theme.Stealth.amber)
                Text(memo.marketSize.growth).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
                TierTag(tier: memo.marketSize.tier)
            }
            if let note = memo.marketSize.note {
                Text(note).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            SourcesRow(sources: memo.marketSize.sources)
        }
    }

    private var competitors: some View {
        VStack(spacing: 12) {
            ForEach(Array(sortedCompetitors.enumerated()), id: \.element.id) { i, c in
                CompetitorCard(competitor: c)
                    .id("competitor-\(i + 1)")
                    .overlay(pulse("competitor-\(i + 1)"))
            }
        }
    }

    private var whyNow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(memo.whyNow.shift).font(Theme.Typeface.body).foregroundStyle(Theme.Stealth.text)
                .fixedSize(horizontal: false, vertical: true)
            SourcesRow(sources: memo.whyNow.sources)
        }
    }

    private var gaps: some View {
        VStack(alignment: .leading, spacing: 20) {
            ForEach(Array(memo.gaps.enumerated()), id: \.element.id) { i, gap in
                GapRow(index: i + 1, gap: gap)
                    .id("gap-\(i + 1)")
                    .overlay(pulse("gap-\(i + 1)"))
            }
        }
    }

    private var entryCost: some View {
        VStack(alignment: .leading, spacing: 16) { ForEach(memo.entryCost) { EntryCostRow(factor: $0) } }
    }

    private var roadmap: some View {
        VStack(alignment: .leading, spacing: 20) {
            ForEach(Array(memo.roadmap.enumerated()), id: \.element.id) { i, phase in
                RoadmapRow(phase: phase)
                    .id("roadmap-\(i + 1)")
                    .overlay(pulse("roadmap-\(i + 1)"))
            }
        }
    }

    private var divider: some View {
        Rectangle().fill(Theme.Stealth.textSecondary.opacity(0.15)).frame(height: 1)
    }

    private func section<Content: View>(_ num: String, _ name: String, _ q: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) { SectionHead(num: num, name: name, question: q); content() }
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var sortedCompetitors: [MemoCompetitor] {
        let rank: [CompetitorTier: Int] = [.dominant: 0, .strong: 1, .moderate: 2, .niche: 3]
        return memo.competitors.enumerated().sorted { a, b in
            let ra = rank[a.element.tier] ?? 9, rb = rank[b.element.tier] ?? 9
            return ra == rb ? a.offset < b.offset : ra < rb
        }.map(\.element)
    }

    private var briefId: String {
        let n = memo.idea.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF } % 10000
        let year = Calendar.current.component(.year, from: date)
        return "PLN-\(year)-" + String(format: "%04d", n)
    }

    private var dateStr: String { date.formatted(.dateTime.month(.abbreviated).day().year()) }
}

#Preview {
    MemoView(memo: MockMemo.digitalFitness, date: .now, highlightTarget: nil, hasThread: false,
             onBack: {}, onAsk: { _ in }, onToggleToMuse: {}, onBannerBack: {})
        .preferredColorScheme(.dark)
}
