import SwiftUI

/// Badge using Liquid Glass on macOS 26, with warm palette tints.
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
                .foregroundStyle(foreground)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .glassEffect(.regular, in: .capsule)
        .tint(tintColor)
    }

    private var foreground: SwiftUI.Color {
        switch variant {
        case .default:     return Theme.Colors.foreground.resolve(for: colorScheme)
        case .secondary:   return Theme.Colors.mutedForeground.resolve(for: colorScheme)
        case .outline:     return Theme.Colors.foreground.resolve(for: colorScheme)
        case .destructive: return Theme.Colors.destructive.resolve(for: colorScheme)
        case .success:     return Theme.Colors.success.resolve(for: colorScheme)
        case .warning:     return Theme.Colors.warning.resolve(for: colorScheme)
        }
    }

    private var tintColor: SwiftUI.Color? {
        switch variant {
        case .default:     return nil
        case .secondary:   return nil
        case .outline:     return nil
        case .destructive: return Theme.Colors.destructive.resolve(for: colorScheme)
        case .success:     return Theme.Colors.success.resolve(for: colorScheme)
        case .warning:     return Theme.Colors.warning.resolve(for: colorScheme)
        }
    }
}
