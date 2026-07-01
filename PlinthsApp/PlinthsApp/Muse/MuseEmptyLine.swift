import SwiftUI

/// The Muse empty state — one mono line where the thread will be. No greeting.
struct MuseEmptyLine: View {
    var body: some View {
        Text("MUSE · ready · grounded in this report")
            .font(Theme.Typeface.caption)
            .foregroundStyle(Theme.Stealth.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    MuseEmptyLine().padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
