import SwiftUI

/// One competitor: a tier dot (amber, brightness by threat), name, strength,
/// weakness, position + funding, and a source pill linking the claim to the
/// real company. Amber-only: the tier reads from dot brightness + a mono word.
struct CompetitorCard: View {
    let competitor: MemoCompetitor

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Circle()
                    .fill(Theme.Stealth.amber.opacity(tierOpacity))
                    .frame(width: 8, height: 8)
                Text(competitor.name)
                    .font(Theme.Typeface.bodyEmphasized)
                    .foregroundStyle(Theme.Stealth.text)
                Spacer()
                Text(competitor.tier.rawValue)
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.textSecondary)
            }

            labeled("STRENGTH", competitor.strength)
            labeled("WEAKNESS", competitor.weakness)

            HStack(spacing: 8) {
                Text(competitor.position)
                    .font(Theme.Typeface.caption)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                Text("·").foregroundStyle(Theme.Stealth.textSecondary)
                Text(competitor.fundingStage)
                    .font(Theme.Typeface.caption)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                Spacer()
                CitePill(source: Source(label: linkLabel, url: competitor.url))
            }
        }
        .padding(16)
        .background(Theme.Stealth.skyMid.opacity(0.4))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var tierOpacity: Double {
        switch competitor.tier {
        case .dominant: 1.0
        case .strong:   0.75
        case .moderate: 0.5
        case .niche:    0.3
        }
    }

    private var linkLabel: String {
        URL(string: competitor.url)?.host?.replacingOccurrences(of: "www.", with: "") ?? "site"
    }

    private func labeled(_ label: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(Theme.Typeface.badge)
                .foregroundStyle(Theme.Stealth.textSecondary)
            Text(text)
                .font(Theme.Typeface.body)
                .foregroundStyle(Theme.Stealth.text)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

#Preview {
    VStack(spacing: 12) {
        ForEach(MockMemo.digitalFitness.competitors) { CompetitorCard(competitor: $0) }
    }
    .padding()
    .background(Theme.Stealth.skyTop)
    .preferredColorScheme(.dark)
}
