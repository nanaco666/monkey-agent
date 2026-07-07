import SwiftUI

// MARK: - View Modifiers

extension View {
    /// Glass card container
    func card(padding: CGFloat = Theme.Spacing.md, radius: CGFloat = Theme.Radius.md) -> some View {
        self
            .padding(padding)
            .glassEffect(.regular, in: RoundedRectangle(cornerRadius: radius))
    }

    /// Fade-in on appear
    func fadeIn(delay: Double = 0) -> some View {
        self
            .opacity(0)
            .animation(Theme.Animation.fade.delay(delay), value: true)
            .onAppear { }
    }

    /// Tool content styling
    func toolContent(isError: Bool) -> some View {
        self
            .font(Theme.Font.code)
            .foregroundStyle(isError ? .red : .secondary)
    }
}
