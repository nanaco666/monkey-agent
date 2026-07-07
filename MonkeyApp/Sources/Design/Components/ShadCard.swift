import SwiftUI

/// Card using Liquid Glass on macOS 26.
struct ShadCard<Content: View>: View {
    let content: Content
    var padding: CGFloat = Theme.Spacing.lg

    init(padding: CGFloat = Theme.Spacing.lg, @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.content = content()
    }

    var body: some View {
        content
            .padding(padding)
            .glassEffect(.regular, in: RoundedRectangle(cornerRadius: Theme.Radius.lg))
    }
}

/// Separator
struct ShadSeparator: View {
    var orientation: Axis = .horizontal

    var body: some View {
        if orientation == .horizontal {
            Divider()
        } else {
            Divider()
        }
    }
}

/// Skeleton loading placeholder
struct ShadSkeleton: View {
    var cornerRadius: CGFloat = Theme.Radius.md

    var body: some View {
        Rectangle()
            .fill(.quaternary)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            .shimmer()
    }
}

// MARK: - Shimmer Modifier

extension View {
    func shimmer() -> some View {
        self.modifier(ShimmerModifier())
    }
}

private struct ShimmerModifier: ViewModifier {
    @State private var phase: CGFloat = -1

    func body(content: Content) -> some View {
        content
            .overlay(
                LinearGradient(
                    stops: [
                        .init(color: .clear, location: 0),
                        .init(color: .white.opacity(0.08), location: 0.5),
                        .init(color: .clear, location: 1),
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .offset(x: phase * 300)
            )
            .clipped()
            .onAppear {
                withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: false)) {
                    phase = 1
                }
            }
    }
}
