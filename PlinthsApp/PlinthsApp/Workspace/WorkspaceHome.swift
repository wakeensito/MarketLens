import SwiftUI

/// The empty-state home: a hero prompt, example-idea chips, and the bottom-
/// docked idea input. Tapping a chip fills (but does not submit) the input.
struct WorkspaceHome: View {
    @Binding var draft: String
    var onSubmit: () -> Void
    @FocusState private var inputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 12) {
                Text("What are you building?")
                    .font(Theme.Typeface.title)
                    .foregroundStyle(Theme.Stealth.text)
                Text("Describe an idea to map its competitive landscape.")
                    .font(Theme.Typeface.caption)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                    .multilineTextAlignment(.center)
            }

            Spacer().frame(height: 28)

            VStack(spacing: 10) {
                ForEach(MockWorkspace.exampleIdeas, id: \.self) { idea in
                    ExampleIdeaChip(title: idea) {
                        draft = idea
                        inputFocused = true
                    }
                }
            }

            Spacer()

            IdeaInputBar(draft: $draft, onSubmit: onSubmit, isFocused: $inputFocused)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
    }
}

#Preview {
    WorkspaceHome(draft: .constant(""), onSubmit: {})
        .background(DesertSkyBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}
