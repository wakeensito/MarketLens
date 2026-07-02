import SwiftUI
import UIKit

/// The ready Build Brief: conclusion strip → capabilities → foundation → MVP
/// scope → technical risks → Foundations & Limits → action row.
struct BuildBriefBody: View {
    let brief: BuildBrief
    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("BUILD BRIEF").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.amber)
            conclusion
            divider
            section("Capabilities", "Build or buy") {
                VStack(alignment: .leading, spacing: 16) { ForEach(brief.capabilities) { CapabilityRow(capability: $0) } }
            }
            divider
            section("Foundation", "Vendor-neutral primitives") {
                VStack(alignment: .leading, spacing: 14) { ForEach(brief.foundation) { FoundationRow(primitive: $0) } }
            }
            divider
            section("MVP scope", "The smallest thing worth shipping") {
                Text(brief.mvpScope).font(Theme.Typeface.body).foregroundStyle(Theme.Stealth.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
            divider
            section("Technical risks", nil) {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(Array(brief.technicalRisks.enumerated()), id: \.element.id) { i, risk in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 8) {
                                Text("R\(i + 1)").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.amber)
                                Text(risk.title).font(Theme.Typeface.bodyEmphasized).foregroundStyle(Theme.Stealth.text)
                            }
                            Text(risk.description).font(Theme.Typeface.body).foregroundStyle(Theme.Stealth.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            divider
            foundationsAndLimits
            actionRow
        }
    }

    private var conclusion: some View {
        Group {
            if brief.isTechDominant {
                HStack(alignment: .top, spacing: 24) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("BUILD COMPLEXITY").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text("\(brief.complexityScore)").font(Theme.Typeface.largeTitle).foregroundStyle(Theme.Stealth.amber)
                            Text("/100").font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
                        }
                        Text(brief.complexityLabel).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.amber)
                        if !brief.complexityDrivers.isEmpty {
                            Text("Driven by \(brief.complexityDrivers.joined(separator: ", "))")
                                .font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("EFFORT").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
                        Text(brief.effort.timeframe).font(Theme.Typeface.title).foregroundStyle(Theme.Stealth.text)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(brief.effort.teamShape).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            } else {
                BuildBriefLowTechCard()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var foundationsAndLimits: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Foundations & Limits").font(Theme.Typeface.title).foregroundStyle(Theme.Stealth.text)
            VStack(alignment: .leading, spacing: 6) {
                ForEach(BuildBriefCopy.principles, id: \.self) { p in
                    HStack(alignment: .top, spacing: 8) {
                        Text("·").foregroundStyle(Theme.Stealth.amber)
                        Text(p).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            Text(BuildBriefCopy.limit).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var actionRow: some View {
        HStack {
            Button {
                UIPasteboard.general.string = buildBriefMarkdown(brief)
                copied = true
                Task { try? await Task.sleep(for: .seconds(1.5)); copied = false }
            } label: {
                Text(copied ? "COPIED" : "COPY AS MARKDOWN")
                    .font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.amber)
            }
            .buttonStyle(.plain)
            Spacer()
            Text("Generated \(Date.now.formatted(.dateTime.month(.abbreviated).day()))")
                .font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
        }
    }

    private var divider: some View {
        Rectangle().fill(Theme.Stealth.textSecondary.opacity(0.15)).frame(height: 1)
    }

    private func section<Content: View>(_ name: String, _ sub: String?, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(Theme.Typeface.title).foregroundStyle(Theme.Stealth.text)
                if let sub { Text(sub).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary) }
            }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview("tech-dominant") {
    ScrollView { BuildBriefBody(brief: MockBuildBrief.digitalFitness).padding(20) }
        .background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
#Preview("low-tech") {
    ScrollView { BuildBriefBody(brief: MockBuildBrief.lowTechExample).padding(20) }
        .background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
