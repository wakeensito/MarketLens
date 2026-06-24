import SwiftUI

/// Reveals text one character at a time with a blinking cursor — a typewriter
/// effect. If the user has Reduce Motion on, the full text appears immediately.
struct TypingText: View {
    let text: String
    var font: Font
    var color: Color
    var characterDelay: Duration = .milliseconds(55)

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var visibleCount = 0
    @State private var cursorOn = true

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(String(text.prefix(visibleCount)))
            Text("_").opacity(cursorOn ? 1 : 0)
        }
        .font(font)
        .foregroundStyle(color)
        .task { await animate() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }

    private func animate() async {
        if reduceMotion {
            visibleCount = text.count
        } else {
            for index in 0...text.count {
                visibleCount = index
                try? await Task.sleep(for: characterDelay)
            }
        }
        // Blink the cursor forever after typing completes.
        while !Task.isCancelled {
            try? await Task.sleep(for: .milliseconds(550))
            cursorOn.toggle()
        }
    }
}

#Preview {
    TypingText(text: "Build on solid ground.",
               font: Theme.Typeface.splashTagline,
               color: Theme.Stealth.textSecondary)
    .padding()
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.Stealth.skyTop)
}
