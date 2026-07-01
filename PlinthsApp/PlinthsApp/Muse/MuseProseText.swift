import SwiftUI

/// Renders an answer string: sans prose, **bold** runs, and [[target|Label]]
/// inline citations as tappable mono-amber tokens (routed via a muse:// link
/// intercepted here). Stream-safe. Appends a blinking cursor while streaming.
struct MuseProseText: View {
    let raw: String
    var showCursor: Bool = false
    let onCite: (String) -> Void

    var body: some View {
        Text(attributed)
            .tint(Theme.Stealth.amber)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .environment(\.openURL, OpenURLAction { url in
                if url.scheme == "muse" {
                    onCite(url.host ?? "")
                    return .handled
                }
                return .systemAction
            })
    }

    private var attributed: AttributedString {
        var result = AttributedString("")
        for run in parseMuseRuns(raw) {
            switch run {
            case .text(let s):
                var a = AttributedString(s)
                a.font = Theme.Typeface.body
                a.foregroundColor = Theme.Stealth.text
                result += a
            case .bold(let s):
                var a = AttributedString(s)
                a.font = Theme.Typeface.bodyEmphasized
                a.foregroundColor = Theme.Stealth.text
                result += a
            case .cite(let target, let label):
                var a = AttributedString(label)
                a.font = Theme.Typeface.caption            // mono
                a.foregroundColor = Theme.Stealth.amber
                a.link = URL(string: "muse://\(target)")
                result += a
            }
        }
        if showCursor {
            var c = AttributedString(" ▏")
            c.foregroundColor = Theme.Stealth.textSecondary
            result += c
        }
        return result
    }
}

#Preview {
    MuseProseText(raw: "Whoop [[competitor-2|Whoop]] locks you into **hardware** and barely coaches your workouts.", onCite: { _ in })
        .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
