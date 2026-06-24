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

    enum Typeface {
        // Bundled IBM Plex fonts, referenced by their exact PostScript names
        // (verified from the font files — note "SmBld", not "SemiBold").
        // Registered at launch by FontRegistrar.
        static func serif(_ size: CGFloat) -> Font {
            .custom("IBMPlexSerif-Medium", size: size)
        }
        static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
            let name = (weight == .semibold || weight == .bold)
                ? "IBMPlexSans-SmBld"
                : "IBMPlexSans"
            return .custom(name, size: size)
        }
        static func mono(_ size: CGFloat) -> Font {
            .custom("IBMPlexMono-Medium", size: size)
        }
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
