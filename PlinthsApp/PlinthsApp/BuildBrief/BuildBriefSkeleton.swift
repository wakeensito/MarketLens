import SwiftUI

/// The generating state: placeholder bars with an amber shimmer (static under
/// Reduce Motion).
struct BuildBriefSkeleton: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shimmer = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(0..<6, id: \.self) { i in
                RoundedRectangle(cornerRadius: 8)
                    .fill(Theme.Stealth.skyMid.opacity(reduceMotion ? 0.5 : (shimmer ? 0.7 : 0.35)))
                    .frame(height: i == 0 ? 56 : 18)
                    .frame(maxWidth: i % 2 == 0 ? .infinity : 220, alignment: .leading)
            }
            Spacer()
        }
        .padding(20)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { shimmer = true }
        }
    }
}

#Preview {
    BuildBriefSkeleton().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
