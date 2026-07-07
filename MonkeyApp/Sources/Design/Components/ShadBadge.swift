import SwiftUI

// MARK: - shadcn/ui Badge for SwiftUI
//
// Variants: default, secondary, outline, destructive, success, warning

struct ShadBadge: View {
    let text: String
    var icon: String? = nil
    var variant: Variant = .default

    @Environment(\.colorScheme) private var colorScheme

    enum Variant {
        case `default`
        case secondary
        case outline
        case destructive
        case success
        case warning
    }

    var body: some View {
        HStack(spacing: 3) {
            if let icon {
                Image(systemName: icon)
                    .font(Theme.Font.xs)
            }
            Text(text)
                .lineLimit(1)
                .font(Theme.Font.xs)
                .fontWeight(.medium)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(background)
        .foregroundStyle(foreground)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
        .overlay(borderOverlay)
    }

    private var background: SwiftUI.Color {
        switch variant {
        case .default:     return Theme.Colors.primary.resolve(for: colorScheme).opacity(0.1)
        case .secondary:   return Theme.Colors.secondary.resolve(for: colorScheme)
        case .outline:     return .clear
        case .destructive: return Theme.Colors.destructive.resolve(for: colorScheme).opacity(0.12)
        case .success:     return Theme.Colors.success.resolve(for: colorScheme).opacity(0.1)
        case .warning:     return Theme.Colors.warning.resolve(for: colorScheme).opacity(0.1)
        }
    }

    private var foreground: SwiftUI.Color {
        switch variant {
        case .default:     return Theme.Colors.foreground.resolve(for: colorScheme)
        case .secondary:   return Theme.Colors.secondaryForeground.resolve(for: colorScheme)
        case .outline:     return Theme.Colors.foreground.resolve(for: colorScheme)
        case .destructive: return Theme.Colors.destructive.resolve(for: colorScheme)
        case .success:     return Theme.Colors.success.resolve(for: colorScheme)
        case .warning:     return Theme.Colors.warning.resolve(for: colorScheme)
        }
    }

    @ViewBuilder
    private var borderOverlay: some View {
        switch variant {
        case .outline:
            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                .strokeBorder(Theme.Colors.border.resolve(for: colorScheme), lineWidth: 0.5)
        default:
            EmptyView()
        }
    }
}
