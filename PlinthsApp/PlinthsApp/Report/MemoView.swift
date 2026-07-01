import SwiftUI

/// The full market-memo report — a dedicated reading surface pushed over the
/// workspace. Back chevron + a share sheet (markdown) sit above the scroll; the
/// sections render in the web memo's order.
struct MemoView: View {
    let memo: MarketMemo
    let onBack: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            topBar
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
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 40)
            }
        }
        .background(Theme.Stealth.skyTop.ignoresSafeArea())
    }

    private var topBar: some View {
        HStack {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Theme.Stealth.textSecondary)
                    .frame(width: 44, height: 44)
                    .contentShape(.rect)
            }
            .accessibilityLabel("Back")
            Spacer()
            ShareLink(item: memoMarkdown(memo)) {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(Theme.Stealth.textSecondary)
                    .frame(width: 44, height: 44)
                    .contentShape(.rect)
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
            Text(memo.oneliner)
                .font(Theme.Typeface.title)
                .foregroundStyle(Theme.Stealth.text)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 4) {
                Text("THE IDEA").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
                Text(memo.idea)
                    .font(Theme.Typeface.body)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var bands: some View {
        VStack(spacing: 12) {
            ForEach(memo.bands) { BandCard(band: $0) }
        }
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
            ForEach(sortedCompetitors) { CompetitorCard(competitor: $0) }
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
            }
        }
    }

    private var entryCost: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(memo.entryCost) { EntryCostRow(factor: $0) }
        }
    }

    private var roadmap: some View {
        VStack(alignment: .leading, spacing: 20) {
            ForEach(memo.roadmap) { RoadmapRow(phase: $0) }
        }
    }

    private var divider: some View {
        Rectangle().fill(Theme.Stealth.textSecondary.opacity(0.15)).frame(height: 1)
    }

    private func section<Content: View>(_ num: String, _ name: String, _ q: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHead(num: num, name: name, question: q)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var sortedCompetitors: [MemoCompetitor] {
        let rank: [CompetitorTier: Int] = [.dominant: 0, .strong: 1, .moderate: 2, .niche: 3]
        return memo.competitors.enumerated().sorted { a, b in
            let ra = rank[a.element.tier] ?? 9, rb = rank[b.element.tier] ?? 9
            return ra == rb ? a.offset < b.offset : ra < rb
        }.map(\.element)
    }

    // Deterministic (non-randomized) brief id derived from the idea, so it is
    // stable across launches for a given memo.
    private var briefId: String {
        let n = memo.idea.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF } % 10000
        return String(format: "PLN-2026-%04d", n)
    }

    private var dateStr: String {
        Date.now.formatted(.dateTime.month(.abbreviated).day().year())
    }
}

#Preview {
    MemoView(memo: MockMemo.digitalFitness, onBack: {})
        .preferredColorScheme(.dark)
}
