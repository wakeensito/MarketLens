import SwiftUI

/// Sticky banner shown at the top of the report only when the user arrived via a
/// citation. Returns to the conversation.
struct BackToChatBanner: View {
    let onBack: () -> Void
    var body: some View {
        HStack {
            Text("FROM YOUR CONVERSATION").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
            Spacer()
            Button(action: onBack) {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.left").font(.system(size: 12))
                    Text("BACK TO CHAT").font(Theme.Typeface.badge)
                }.foregroundStyle(Theme.Stealth.amber)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20).padding(.vertical, 10)
        .background(Theme.Stealth.skyMid)
    }
}

#Preview {
    BackToChatBanner(onBack: {}).background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
