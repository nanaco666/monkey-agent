import SwiftUI

/// Button using Liquid Glass styles on macOS 26.
struct ShadButton: View {
    let title: String?
    let icon: String?
    let variant: Variant
    let size: Size
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled

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
        labelContent
            .padding(.horizontal, hPadding)
            .padding(.vertical, vPadding)
            .frame(minHeight: minHeight)
    }

    @ViewBuilder
    private var labelContent: some View {
        switch variant {
        case .default:
            buttonWithStyle(.glassProminent)
        case .secondary:
            buttonWithStyle(.glass(.regular))
        case .outline:
            buttonWithStyle(.glass(.clear))
        case .ghost:
            buttonWithStyle(.plain)
        case .destructive:
            buttonWithStyle(.glass(.regular))
                .tint(.red)
        case .link:
            buttonWithStyle(.plain)
                .tint(.accentColor)
        }
    }

    private func buttonWithStyle(_ style: some PrimitiveButtonStyle) -> some View {
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
        }
        .buttonStyle(style)
        .opacity(isEnabled ? 1 : 0.5)
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
