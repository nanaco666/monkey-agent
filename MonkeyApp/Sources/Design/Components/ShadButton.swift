import SwiftUI

// MARK: - shadcn/ui Button for SwiftUI
//
// Variants: default, secondary, outline, ghost, destructive, link
// Sizes: xs, sm, default, lg, icon

struct ShadButton: View {
    let title: String?
    let icon: String?
    let variant: Variant
    let size: Size
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme

    enum Variant {
        case `default`
        case secondary
        case outline
        case ghost
        case destructive
        case link
    }

    enum Size {
        case xs
        case sm
        case `default`
        case lg
        case icon
        case iconXs
    }

    init(
        _ title: String? = nil,
        icon: String? = nil,
        variant: Variant = .default,
        size: Size = .default,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.icon = icon
        self.variant = variant
        self.size = size
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: spacing) {
                if let icon {
                    Image(systemName: icon)
                        .font(iconFont)
                }
                if let title {
                    Text(title)
                        .font(font)
                }
            }
            .padding(.horizontal, hPadding)
            .padding(.vertical, vPadding)
            .frame(minHeight: minHeight)
            .background(background)
            .foregroundStyle(foreground)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            .overlay(borderOverlay)
        }
        .buttonStyle(.plain)
        .opacity(isEnabled ? 1 : 0.5)
    }

    // MARK: - Styling

    private var background: some ShapeStyle {
        switch variant {
        case .default:     return Theme.Colors.primary.resolve(for: colorScheme)
        case .secondary:   return Theme.Colors.secondary.resolve(for: colorScheme)
        case .outline:     return .clear
        case .ghost:       return .clear
        case .destructive: return Theme.Colors.destructive.resolve(for: colorScheme)
        case .link:        return .clear
        }
    }

    private var foreground: SwiftUI.Color {
        switch variant {
        case .default:     return Theme.Colors.primaryForeground.resolve(for: colorScheme)
        case .secondary:   return Theme.Colors.secondaryForeground.resolve(for: colorScheme)
        case .outline:     return Theme.Colors.foreground.resolve(for: colorScheme)
        case .ghost:       return Theme.Colors.foreground.resolve(for: colorScheme)
        case .destructive: return Theme.Colors.destructiveForeground.resolve(for: colorScheme)
        case .link:        return Theme.Colors.primary.resolve(for: colorScheme)
        }
    }

    @ViewBuilder
    private var borderOverlay: some View {
        switch variant {
        case .outline:
            RoundedRectangle(cornerRadius: cornerRadius)
                .strokeBorder(Theme.Colors.border.resolve(for: colorScheme), lineWidth: 1)
        default:
            EmptyView()
        }
    }

    // MARK: - Size metrics

    private var font: SwiftUI.Font {
        switch size {
        case .xs, .iconXs: return Theme.Font.xs
        case .sm, .icon:   return Theme.Font.sm
        case .default:     return Theme.Font.body
        case .lg:          return Theme.Font.lg
        }
    }

    private var iconFont: SwiftUI.Font {
        switch size {
        case .xs, .iconXs: return SwiftUI.Font.system(size: 10)
        case .sm:          return SwiftUI.Font.system(size: 11)
        case .default:     return SwiftUI.Font.system(size: 12)
        case .lg, .icon:   return SwiftUI.Font.system(size: 14)
        }
    }

    private var hPadding: CGFloat {
        switch size {
        case .xs, .iconXs: return 6
        case .sm:          return 8
        case .default:     return 12
        case .lg:          return 16
        case .icon:        return 6
        }
    }

    private var vPadding: CGFloat {
        switch size {
        case .xs, .iconXs: return 2
        case .sm:          return 4
        case .default:     return 6
        case .lg:          return 8
        case .icon:        return 6
        }
    }

    private var spacing: CGFloat {
        switch size {
        case .xs, .iconXs: return 2
        case .sm:          return 3
        default:           return 4
        }
    }

    private var cornerRadius: CGFloat {
        switch size {
        case .xs, .iconXs: return Theme.Radius.sm
        case .sm:          return Theme.Radius.md
        case .default:     return Theme.Radius.md
        case .lg:          return Theme.Radius.lg
        case .icon:        return Theme.Radius.md
        }
    }

    private var minHeight: CGFloat {
        switch size {
        case .xs, .iconXs: return 20
        case .sm:          return 24
        case .default:     return 30
        case .lg:          return 36
        case .icon:        return 30
        }
    }
}
