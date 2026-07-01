import SwiftUI

/// The two-bar mini-saturation mark — the "go to report" toggle glyph.
struct SaturationToggleMark: View {
    var body: some View {
        HStack(spacing: 3) {
            Capsule().frame(width: 11, height: 3)
            Capsule().frame(width: 7, height: 3)
        }
        .foregroundStyle(Theme.Stealth.amber)
    }
}

#Preview {
    SaturationToggleMark().padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
