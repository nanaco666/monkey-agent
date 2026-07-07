import SwiftUI

/// Pill-shaped badge — now backed by ShadBadge.
/// Kept as a convenience wrapper for call sites that use the old API.
struct PillBadge: View {
    let text: String
    var icon: String? = nil
    var style: Style = .default

    enum Style {
        case `default`
        case accent
        case warning
        case success

        var badgeVariant: ShadBadge.Variant {
            switch self {
            case .default:  return .secondary
            case .accent:   return .default
            case .warning:  return .warning
            case .success:  return .success
            }
        }
    }

    var body: some View {
        ShadBadge(text: text, icon: icon, variant: style.badgeVariant)
    }
}
