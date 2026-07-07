import SwiftUI

/// Badge using Liquid Glass on macOS 26.
struct ShadBadge: View {
    let text: String
    var icon: String? = nil
    var variant: Variant = .default

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
        .glassEffect(.regular, in: .capsule)
        .tint(tintColor)
    }

    private var tintColor: Color? {
        switch variant {
        case .default:     return nil
        case .secondary:   return .gray
        case .outline:     return nil
        case .destructive: return .red
        case .success:     return .green
        case .warning:     return .orange
        }
    }
}
