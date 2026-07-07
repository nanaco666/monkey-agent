import SwiftUI

// MARK: - View Modifiers (shadcn-aligned)

extension View {
    /// Card-style container using ShadCard tokens
    func card(padding: CGFloat = Theme.Spacing.md, radius: CGFloat = Theme.Radius.md) -> some View {
        self
            .padding(padding)
            .background(Theme.Colors.card.resolve(for: .dark))
            .clipShape(RoundedRectangle(cornerRadius: radius))
            .overlay(
                RoundedRectangle(cornerRadius: radius)
                    .strokeBorder(Theme.Colors.border.resolve(for: .dark), lineWidth: 0.5)
            )
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
            .foregroundStyle(isError ? Theme.Colors.error.resolve(for: .dark) : Theme.Colors.mutedForeground.resolve(for: .dark))
    }
}
