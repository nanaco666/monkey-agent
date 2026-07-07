import SwiftUI

// MARK: - shadcn/ui Design System for SwiftUI
//
// Translates shadcn/ui theming tokens (CSS variables) into SwiftUI equivalents.
// Token convention: background/foreground pairs, semantic naming.
// Dark mode is the default (chat AI app). Light mode supported via ColorScheme.

/// Centralized design system. All UI references colors/spacing/fonts/radius from here.
enum Theme {
    // MARK: - Spacing (4px grid, Tailwind-like)
    enum Spacing {
        static let px: CGFloat = 1
        static let xs: CGFloat = 2
        static let sm: CGFloat = 4
        static let md: CGFloat = 8
        static let lg: CGFloat = 12
        static let xl: CGFloat = 16
        static let xxl: CGFloat = 24
        static let xxxl: CGFloat = 32
    }

    // MARK: - Radius (shadcn scale from --radius)
    enum Radius {
        static let base: CGFloat = 10
        static let sm: CGFloat = base * 0.6
        static let md: CGFloat = base * 0.8
        static let lg: CGFloat = base
        static let xl: CGFloat = base * 1.4
        static let xxl: CGFloat = base * 1.8
        static let pill: CGFloat = 100
    }

    // MARK: - Typography
    enum Font {
        static let xs = SwiftUI.Font.system(size: 11)
        static let sm = SwiftUI.Font.system(size: 12)
        static let body = SwiftUI.Font.system(size: 13)
        static let lg = SwiftUI.Font.system(size: 14, weight: .medium)
        static let heading = SwiftUI.Font.system(size: 15, weight: .semibold)
        static let title = SwiftUI.Font.system(size: 18, weight: .bold)
        static let code = SwiftUI.Font.system(size: 12, design: .monospaced)
        static let codeBody = SwiftUI.Font.system(size: 13, design: .monospaced)
    }

    // MARK: - Avatar
    enum Avatar {
        static let sm: CGFloat = 24
        static let md: CGFloat = 32
        static let lg: CGFloat = 40
    }

    // MARK: - Animation
    enum Animation {
        static let scroll = SwiftUI.Animation.easeOut(duration: 0.2)
        static let fade = SwiftUI.Animation.easeInOut(duration: 0.15)
        static let spring = SwiftUI.Animation.spring(response: 0.3, dampingFraction: 0.8)
        static let streamingCursor = SwiftUI.Animation.easeInOut(duration: 0.6).repeatForever(autoreverses: true)
    }

    // MARK: - Colors namespace
    enum Colors { }
}

// MARK: - Color Token

/// A semantic color that resolves differently in light/dark mode.
struct ColorToken {
    let light: SwiftUI.Color
    let dark: SwiftUI.Color

    func resolve(for scheme: ColorScheme) -> SwiftUI.Color {
        scheme == .dark ? dark : light
    }
}

// MARK: - Semantic Colors (shadcn token convention)

extension Theme.Colors {
    // --background / --foreground  (#DFDBC4 warm parchment / #4B2D2B deep mahogany)
    static let background = ColorToken(light: Color(hex: "DFDBC4"), dark: Color(hex: "DFDBC4"))
    static let foreground = ColorToken(light: Color(hex: "4B2D2B"), dark: Color(hex: "4B2D2B"))

    // --card / --card-foreground  (#E3DEC5 lighter parchment)
    static let card = ColorToken(light: Color(hex: "E3DEC5"), dark: Color(hex: "E3DEC5"))
    static let cardForeground = ColorToken(light: Color(hex: "4B2D2B"), dark: Color(hex: "4B2D2B"))

    // --popover / --popover-foreground
    static let popover = ColorToken(light: Color(hex: "E3DEC5"), dark: Color(hex: "E3DEC5"))
    static let popoverForeground = ColorToken(light: Color(hex: "4B2D2B"), dark: Color(hex: "4B2D2B"))

    // --primary / --primary-foreground  (#4B2D2B mahogany / #E8E3CB light cream)
    static let primary = ColorToken(light: Color(hex: "4B2D2B"), dark: Color(hex: "4B2D2B"))
    static let primaryForeground = ColorToken(light: Color(hex: "E8E3CB"), dark: Color(hex: "E8E3CB"))

    // --secondary / --secondary-foreground
    static let secondary = ColorToken(light: Color(hex: "E3DEC5"), dark: Color(hex: "E3DEC5"))
    static let secondaryForeground = ColorToken(light: Color(hex: "4B2D2B"), dark: Color(hex: "4B2D2B"))

    // --muted / --muted-foreground  (#8F7E72 warm gray)
    static let muted = ColorToken(light: Color(hex: "D5CFB8"), dark: Color(hex: "D5CFB8"))
    static let mutedForeground = ColorToken(light: Color(hex: "8F7E72"), dark: Color(hex: "8F7E72"))

    // --accent / --accent-foreground
    static let accent = ColorToken(light: Color(hex: "D5CFB8"), dark: Color(hex: "D5CFB8"))
    static let accentForeground = ColorToken(light: Color(hex: "4B2D2B"), dark: Color(hex: "4B2D2B"))

    // --destructive
    static let destructive = ColorToken(light: Color(hex: "A03030"), dark: Color(hex: "A03030"))
    static let destructiveForeground = ColorToken(light: Color(hex: "E8E3CB"), dark: Color(hex: "E8E3CB"))

    // --border  (#5A3835 warm brown)
    static let border = ColorToken(light: Color(hex: "5A3835"), dark: Color(hex: "5A3835"))

    // --input
    static let input = ColorToken(light: Color(hex: "8B7A6E"), dark: Color(hex: "8B7A6E"))

    // --ring
    static let ring = ColorToken(light: Color(hex: "4B2D2B"), dark: Color(hex: "4B2D2B"))

    // App-specific semantic tokens
    static let userBubble = ColorToken(light: Color(hex: "4B2D2B"), dark: Color(hex: "4B2D2B"))
    static let userBubbleForeground = ColorToken(light: Color(hex: "E8E3CB"), dark: Color(hex: "E8E3CB"))
    static let assistantAccent = ColorToken(light: Color(hex: "5A3835"), dark: Color(hex: "5A3835"))
    static let toolAccent = ColorToken(light: Color(hex: "7A6350"), dark: Color(hex: "7A6350"))
    static let systemAccent = ColorToken(light: Color(hex: "6B5040"), dark: Color(hex: "6B5040"))
    static let success = ColorToken(light: Color(hex: "5E7A50"), dark: Color(hex: "5E7A50"))
    static let warning = ColorToken(light: Color(hex: "8B6A3E"), dark: Color(hex: "8B6A3E"))
    static let error = ColorToken(light: Color(hex: "A03030"), dark: Color(hex: "A03030"))

    // Code block
    static let codeBackground = ColorToken(light: Color(hex: "E3DEC5"), dark: Color(hex: "E3DEC5"))
    static let codeHeaderBackground = ColorToken(light: Color(hex: "D5CFB8"), dark: Color(hex: "D5CFB8"))

    // Input bar  (#E8E3CB input bg, #8B7A6E border, #5A3835 focus)
    static let inputBarBackground = ColorToken(light: Color(hex: "E8E3CB"), dark: Color(hex: "E8E3CB"))
    static let inputBarBorder = ColorToken(light: Color(hex: "8B7A6E"), dark: Color(hex: "8B7A6E"))
    static let inputBarBorderFocused = ColorToken(light: Color(hex: "5A3835"), dark: Color(hex: "5A3835"))

    // Welcome gradient
    static let welcomeGradientTop = ColorToken(light: Color(hex: "E8E3CB"), dark: Color(hex: "E8E3CB"))
    static let welcomeGradientBottom = ColorToken(light: Color(hex: "DFDBC4"), dark: Color(hex: "DFDBC4"))
}

// MARK: - Color hex convenience

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
