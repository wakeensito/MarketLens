import SwiftUI

/// One past report in the history drawer: idea title, a saturation chip, and a
/// relative date. Tapping selects it — a stub in M2 (the report UI is M3).
struct HistoryRow: View {
    let report: MockReport
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 8) {
                Text(report.ideaText)
                    .font(Theme.Typeface.body)
                    .foregroundStyle(Theme.Stealth.text)
                    .lineLimit(1)
                HStack(spacing: 10) {
                    saturationChip
                    Text(Self.relativeDate(report.createdAt))
                        .font(Theme.Typeface.caption)
                        .foregroundStyle(Theme.Stealth.textSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    // Stealth keeps amber as the only color; severity reads from the number +
    // label rather than from new reds/greens.
    private var saturationChip: some View {
        Text("\(report.saturationScore) · \(report.saturationLabel)")
            .font(Theme.Typeface.badge)
            .foregroundStyle(Theme.Stealth.amber)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Theme.Stealth.amber.opacity(0.12))
            .clipShape(.capsule)
    }

    static func relativeDate(_ date: Date) -> String {
        let seconds = -date.timeIntervalSinceNow
        let hours = seconds / 3600
        if hours < 1 { return "just now" }
        if hours < 24 { return "\(Int(hours))h ago" }
        let days = Int(hours / 24)
        if days == 1 { return "yesterday" }
        return "\(days)d ago"
    }
}

#Preview {
    VStack(spacing: 0) {
        ForEach(MockWorkspace.history) { report in
            HistoryRow(report: report, onSelect: {}).padding(16)
            Divider()
        }
    }
    .background(Theme.Stealth.skyMid)
    .preferredColorScheme(.dark)
}
