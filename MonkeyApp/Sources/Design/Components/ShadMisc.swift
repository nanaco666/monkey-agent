import SwiftUI

/// Spinner
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

/// Tooltip (hover) with warm palette
struct ShadTooltip<Content: View, Label: View>: View {
    let content: Content
    let label: Label
    var placement: Edge = .top
    @Environment(\.colorScheme) private var colorScheme

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
                        .background(Theme.Colors.popover.resolve(for: colorScheme))
                        .foregroundStyle(Theme.Colors.popoverForeground.resolve(for: colorScheme))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        .shadow(color: .black.opacity(0.2), radius: 4, y: 2)
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

/// Empty State with warm palette
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

/// Welcome State (empty chat, branded)
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

    private let columnColors: [SwiftUI.Color] = [
        Color(red: 232/255, green: 98/255, blue: 42/255),
        Color(red: 244/255, green: 160/255, blue: 176/255),
        Color(red: 240/255, green: 183/255, blue: 49/255),
        Color(red: 107/255, green: 140/255, blue: 78/255),
        Color(red: 135/255, green: 206/255, blue: 235/255),
        Color(red: 91/255, green: 184/255, blue: 168/255),
    ]

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

    private let accentColors: [SwiftUI.Color] = [
        Color(red: 232/255, green: 98/255, blue: 42/255),
        Color(red: 244/255, green: 160/255, blue: 176/255),
        Color(red: 240/255, green: 183/255, blue: 49/255),
        Color(red: 107/255, green: 140/255, blue: 78/255),
        Color(red: 135/255, green: 206/255, blue: 235/255),
        Color(red: 91/255, green: 184/255, blue: 168/255),
    ]

    var body: some View {
        VStack(spacing: Theme.Spacing.xxl) {
            Spacer()

            VStack(spacing: 0) {
                ForEach(Array(asciiArt.enumerated()), id: \.offset) { _, line in
                    coloredLineView(line)
                }
            }
            .padding(.bottom, Theme.Spacing.sm)

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

            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Theme.Spacing.xxl)
    }

    @ViewBuilder
    private func coloredLineView(_ line: String) -> some View {
        let chars = Array(line)
        let spans = buildSpans(for: chars)
        HStack(spacing: 0) {
            Spacer(minLength: 0)
            ForEach(Array(spans.enumerated()), id: \.offset) { _, span in
                Text(span.text)
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(span.color)
            }
            Spacer(minLength: 0)
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

/// Keyboard shortcut display with warm palette
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
