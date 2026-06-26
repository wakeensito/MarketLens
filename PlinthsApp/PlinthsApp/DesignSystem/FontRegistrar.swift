import CoreText
import Foundation

/// Registers the bundled IBM Plex fonts at app launch so they can be referenced
/// by PostScript name via `Font.custom(...)`.
///
/// We register in code rather than via the `UIAppFonts` Info.plist key because
/// this project uses a generated Info.plist (no file to edit). The font files
/// live in `Resources/Fonts/` and are copied into the app bundle.
enum FontRegistrar {
    /// File names (without extension) of the bundled `.ttf` files.
    private static let fontFileNames = [
        "IBMPlexSerif-Medium",
        "IBMPlexSans-Regular",
        "IBMPlexSans-SemiBold",
        "IBMPlexMono-Medium",
    ]

    /// Registers every bundled font with the process font manager. Safe to call
    /// once at launch. Logs (rather than crashes) if a file is missing or a
    /// registration fails, so a font problem never takes down the app.
    static func registerBundledFonts() {
        for name in fontFileNames {
            guard let url = Bundle.main.url(forResource: name, withExtension: "ttf") else {
                print("⚠️ FontRegistrar: \(name).ttf not found in bundle")
                continue
            }
            var error: Unmanaged<CFError>?
            if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) {
                let message = error?.takeRetainedValue().localizedDescription ?? "unknown error"
                print("⚠️ FontRegistrar: failed to register \(name): \(message)")
            }
        }
    }
}
