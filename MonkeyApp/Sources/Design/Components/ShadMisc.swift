import SwiftUI

// MARK: - shadcn/ui Spinner for SwiftUI

struct ShadSpinner: View {
    var size: CGFloat = 16
    var color: SwiftUI.Color? = nil

    @Environment(\.colorScheme) private var colorScheme
    @State private var isAnimating = false

    var body: some View {
        Circle()
            .trim(from: 0, to: 0.7)
            .stroke(
                color ?? Theme.Colors.mutedForeground.resolve(for: colorScheme),
                style: StrokeStyle(lineWidth: 2, lineCap: .round)
            )
            .frame(width: size, height: size)
            .rotationEffect(.degrees(isAnimating ? 360 : 0))
            .onAppear {
                withAnimation(.linear(duration: 0.8).repeatForever(autoreverses: false)) {
                    isAnimating = true
                }
            }
    }
}

// MARK: - shadcn/ui Tooltip (hover)

struct ShadTooltip<Content: View, Label: View>: View {
    let content: Content
    let label: Label
    var placement: Edge = .top

    init(placement: Edge = .top, @ViewBuilder content: () -> Content, @ViewBuilder label: () -> Label) {
        self.placement = placement
        self.content = content()
        self.label = label()
    }

    @State private var isHovering = false

    var body: some View {
        content
            .onHover { isHovering = $0 }
            .overlay(alignment: alignment) {
                if isHovering {
                    label
                        .font(Theme.Font.xs)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Theme.Colors.popover.resolve(for: .dark))
                        .foregroundStyle(Theme.Colors.popoverForeground.resolve(for: .dark))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
                        .offset(y: placement == .top ? -36 : (placement == .bottom ? 36 : 0))
                        .offset(x: placement == .leading ? -60 : (placement == .trailing ? 60 : 0))
                        .transition(.opacity)
                        .animation(Theme.Animation.fade, value: isHovering)
                }
            }
    }

    private var alignment: Alignment {
        switch placement {
        case .top: return .top
        case .bottom: return .bottom
        case .leading: return .leading
        case .trailing: return .trailing
        }
    }
}

// MARK: - shadcn/ui Empty State

struct ShadEmpty: View {
    let icon: String
    let title: String
    let description: String

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: Theme.Spacing.lg) {
            Text(icon)
                .font(.system(size: 48))

            Text(title)
                .font(Theme.Font.title)
                .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))

            Text(description)
                .font(Theme.Font.body)
                .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))
                .multilineTextAlignment(.center)
                .frame(maxWidth: 280)
        }
        .padding(Theme.Spacing.xxxl)
    }
}

// MARK: - Welcome State (empty chat, branded)

struct WelcomeView: View {
    let assistantName: String
    @Environment(\.colorScheme) private var colorScheme

    private let asciiArt = [
        "███╗   ███╗ ██████╗ ███╗   ██╗██╗  ██╗███████╗██╗   ██╗",
        "████╗ ████║██╔═══██╗████╗  ██║██║ ██╔╝██╔════╝╚██╗ ██╔╝",
        "██╔████╔██║██║   ██║██╔██╗ ██║█████╔╝ █████╗   ╚████╔╝ ",
        "██║╚██╔╝██║██║   ██║██║╚██╗██║██╔═██╗ ██╔══╝    ╚██╔╝  ",
        "██║ ╚═╝ ██║╚██████╔╝██║ ╚████║██║  ██╗███████╗   ██║   ",
        "╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝   ╚═╝  ",
    ]

    // Column colors matching the terminal banner: M orange, O pink, N yellow, K green, E blue, Y teal
    private let columnColors: [SwiftUI.Color] = [
        Color(red: 232/255, green: 98/255, blue: 42/255),   // M orange
        Color(red: 244/255, green: 160/255, blue: 176/255),  // O pink
        Color(red: 240/255, green: 183/255, blue: 49/255),   // N yellow
        Color(red: 107/255, green: 140/255, blue: 78/255),   // K green
        Color(red: 135/255, green: 206/255, blue: 235/255),  // E blue
        Color(red: 91/255, green: 184/255, blue: 168/255),   // Y teal
    ]

    // Character column boundaries (same as banner.ts)
    private let colBounds: [(start: Int, end: Int)] = [
        (0, 11), (12, 20), (21, 31), (32, 40), (41, 49), (50, 99)
    ]

    private let kaomojis = [
        "⊂((・▽・))⊃", "⊂((≧▽≦))⊃", "⊂((￣▽￣))⊃",
        "⊂((・⊥・))⊃", "⊂((￣⊥￣))⊃", "⊂((≧⊥≦))⊃",
        "⊂((*＞⊥σ))⊃", "⊂((。・o・))⊃", "⊂((✧▽✧))⊃",
        "⊂((･ω･))⊃", "⊂((◉⊥◉))⊃", "⊂((ᵔ▽ᵔ))⊃",
        "⊂((◕▽◕))⊃", "⊂((´･ω･`))⊃", "⊂((¬‿¬))⊃",
        "⊂((⚆▽⚆))⊃", "⊂((╥▽╥))⊃",
    ]

    // Accent colors for random kaomoji coloring
    private let accentColors: [SwiftUI.Color] = [
        Color(red: 232/255, green: 98/255, blue: 42/255),   // orange
        Color(red: 244/255, green: 160/255, blue: 176/255),  // pink
        Color(red: 240/255, green: 183/255, blue: 49/255),   // yellow
        Color(red: 107/255, green: 140/255, blue: 78/255),   // green
        Color(red: 135/255, green: 206/255, blue: 235/255),  // blue
        Color(red: 91/255, green: 184/255, blue: 168/255),   // teal
    ]

    var body: some View {
        VStack(spacing: Theme.Spacing.xxl) {
            Spacer()

            // ASCII art header
            VStack(spacing: 0) {
                ForEach(Array(asciiArt.enumerated()), id: \.offset) { _, line in
                    coloredLineView(line)
                }
            }
            .padding(.bottom, Theme.Spacing.sm)

            // Tagline + metadata
            HStack(spacing: Theme.Spacing.lg) {
                Text("the AI that evolves")
                    .font(Theme.Font.body)
                    .fontWeight(.medium)
                    .foregroundStyle(Color(red: 232/255, green: 98/255, blue: 42/255))

                Text("v0.2.0")
                    .font(Theme.Font.sm)
                    .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))

                Text(Date.now, format: .dateTime.year().month().day())
                    .font(Theme.Font.sm)
                    .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))

                Text(kaomojis.randomElement() ?? "⊂((・▽・))⊃")
                    .font(Theme.Font.sm)
                    .foregroundStyle(accentColors.randomElement() ?? Color(red: 240/255, green: 183/255, blue: 49/255))
            }

            Text(assistantName)
                .font(Theme.Font.sm)
                .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))

            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Theme.Spacing.xxl)
    }

    // MARK: - Colored ASCII Line

    @ViewBuilder
    private func coloredLineView(_ line: String) -> some View {
        let chars = Array(line)
        let spans = buildSpans(for: chars)
        HStack(spacing: 0) {
            ForEach(Array(spans.enumerated()), id: \.offset) { _, span in
                Text(span.text)
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(span.color)
            }
        }
    }

    private struct ColoredSpan: Identifiable {
        let id = UUID()
        let text: String
        let color: SwiftUI.Color
    }

    private func buildSpans(for chars: [Character]) -> [ColoredSpan] {
        var spans: [ColoredSpan] = []
        var currentText = ""
        var currentColor: SwiftUI.Color = Theme.Colors.foreground.resolve(for: colorScheme)

        for (i, ch) in chars.enumerated() {
            let col = colBounds.enumerated().first { _, bounds in i >= bounds.start && i <= bounds.end }
            let color: SwiftUI.Color
            if let col = col {
                color = columnColors[col.offset]
            } else {
                color = Theme.Colors.foreground.resolve(for: colorScheme)
            }

            if color == currentColor {
                currentText.append(ch)
            } else {
                if !currentText.isEmpty {
                    spans.append(ColoredSpan(text: currentText, color: currentColor))
                }
                currentText = String(ch)
                currentColor = color
            }
        }
        if !currentText.isEmpty {
            spans.append(ColoredSpan(text: currentText, color: currentColor))
        }
        return spans
    }

}

// MARK: - shadcn/ui Kbd (keyboard shortcut display)

struct ShadKbd: View {
    let text: String

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Text(text)
            .font(Theme.Font.xs)
            .fontWeight(.medium)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Theme.Colors.muted.resolve(for: colorScheme))
            .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                    .strokeBorder(Theme.Colors.border.resolve(for: colorScheme), lineWidth: 0.5)
            )
    }
}
