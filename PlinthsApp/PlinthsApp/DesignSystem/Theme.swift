import SwiftUI

/// The Plinths design system, ported from the web app's Pale Intelligence palette.
/// Single source of truth for all colors and fonts in the iOS app.
enum Theme {
    enum Palette {
        static let bg = Color(hex: "FAF9F6")
        static let surface = Color(hex: "F5F3EF")
        static let text = Color(hex: "1A1C1E")
        static let textSecondary = Color(hex: "6C6F73")
        static let signal = Color(hex: "5C4A38")
        static let logoAccent = Color(hex: "C68A4E")
    }

    /// Semantic type roles backed by bundled IBM Plex fonts (registered at launch
    /// by FontRegistrar). PostScript names verified from the files — note
    /// "SmBld", not "SemiBold". Each role uses `relativeTo:` so the custom fonts
    /// scale with the user's Dynamic Type setting.
    enum Typeface {
        private static let serifMedium = "IBMPlexSerif-Medium"
        private static let sansRegular = "IBMPlexSans"
        private static let sansSemiBold = "IBMPlexSans-SmBld"
        private static let monoMedium = "IBMPlexMono-Medium"

        static let largeTitle = Font.custom(serifMedium, size: 34, relativeTo: .largeTitle)
        static let title = Font.custom(serifMedium, size: 24, relativeTo: .title)
        static let body = Font.custom(sansRegular, size: 17, relativeTo: .body)
        static let bodyEmphasized = Font.custom(sansSemiBold, size: 17, relativeTo: .body)
        static let wordmark = Font.custom(monoMedium, size: 28, relativeTo: .title)
        static let label = Font.custom(monoMedium, size: 15, relativeTo: .callout)
        static let caption = Font.custom(monoMedium, size: 13, relativeTo: .footnote)
        static let badge = Font.custom(monoMedium, size: 11, relativeTo: .caption2)
    }
}

#Preview("Palette swatches") {
    // Visual check that Color(hex:) converts correctly — each swatch should
    // match its hex label. A wrong conversion shows an obviously wrong color.
    let swatches: [(String, Color)] = [
        ("bg #FAF9F6", Theme.Palette.bg),
        ("surface #F5F3EF", Theme.Palette.surface),
        ("text #1A1C1E", Theme.Palette.text),
        ("textSecondary #6C6F73", Theme.Palette.textSecondary),
        ("signal #5C4A38", Theme.Palette.signal),
        ("logoAccent #C68A4E", Theme.Palette.logoAccent),
    ]
    return VStack(alignment: .leading, spacing: 8) {
        ForEach(swatches, id: \.0) { label, color in
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 6)
                    .fill(color)
                    .frame(width: 44, height: 44)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(.black.opacity(0.1)))
                Text(label).font(.system(.body, design: .monospaced))
            }
        }
    }
    .padding()
}
