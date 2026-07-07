import SwiftUI

/// Blinking cursor shown at the end of streaming assistant text
struct StreamingCursor: View {
    @State private var visible = true
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Text("▌")
            .font(Theme.Font.body)
            .foregroundStyle(Theme.Colors.assistantAccent.resolve(for: colorScheme))
            .opacity(visible ? 1 : 0)
            .onAppear {
                withAnimation(Theme.Animation.streamingCursor) {
                    visible.toggle()
                }
            }
    }
}
