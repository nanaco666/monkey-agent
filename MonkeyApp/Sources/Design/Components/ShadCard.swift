import SwiftUI

// MARK: - shadcn/ui Card for SwiftUI
//
// Elevated surface with --card background and --border outline.

struct ShadCard<Content: View>: View {
    let content: Content
    var padding: CGFloat = Theme.Spacing.lg
    var showBorder: Bool = true

    @Environment(\.colorScheme) private var colorScheme

    init(padding: CGFloat = Theme.Spacing.lg, showBorder: Bool = true, @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.showBorder = showBorder
        self.content = content()
    }

    var body: some View {
        content
            .padding(padding)
            .background(Theme.Colors.card.resolve(for: colorScheme))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg))
            .overlay(
                Group {
                    if showBorder {
                        RoundedRectangle(cornerRadius: Theme.Radius.lg)
                            .strokeBorder(Theme.Colors.border.resolve(for: colorScheme), lineWidth: 0.5)
                    }
                }
            )
    }
}

// MARK: - shadcn/ui Separator

struct ShadSeparator: View {
    var orientation: Axis = .horizontal

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        if orientation == .horizontal {
            Rectangle()
                .fill(Theme.Colors.border.resolve(for: colorScheme))
                .frame(height: 0.5)
        } else {
            Rectangle()
                .fill(Theme.Colors.border.resolve(for: colorScheme))
                .frame(width: 0.5)
        }
    }
}

// MARK: - shadcn/ui Skeleton

struct ShadSkeleton: View {
    var cornerRadius: CGFloat = Theme.Radius.md

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Rectangle()
            .fill(Theme.Colors.muted.resolve(for: colorScheme))
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            .shimmer()
    }
}

// MARK: - Shimmer Modifier

extension View {
    /// Animated shimmer effect (loading placeholder)
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
