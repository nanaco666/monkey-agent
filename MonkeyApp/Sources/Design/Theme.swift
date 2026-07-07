import SwiftUI

// MARK: - Design System for Monkey macOS App
//
// macOS 26 Liquid Glass design system.
// Let the system handle materials, backgrounds, and colors where possible.
// Keep semantic tokens only for app-specific branding.

enum Theme {
    // MARK: - Spacing (4px grid)
    enum Spacing {
        static let xs: CGFloat = 2
        static let sm: CGFloat = 4
        static let md: CGFloat = 8
        static let lg: CGFloat = 12
        static let xl: CGFloat = 16
        static let xxl: CGFloat = 24
        static let xxxl: CGFloat = 32
    }

    // MARK: - Radius
    enum Radius {
        static let sm: CGFloat = 6
        static let md: CGFloat = 8
        static let lg: CGFloat = 10
        static let xl: CGFloat = 14
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
}
