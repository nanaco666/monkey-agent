import SwiftUI

/// A single message in a conversation, inspired by shadcn Message.
struct MessageRow: View {
    let message: ChatMessage
    let showAvatar: Bool
    let isGrouped: Bool

    @Environment(\.colorScheme) private var colorScheme

    init(message: ChatMessage, showAvatar: Bool = true, isGrouped: Bool = false) {
        self.message = message
        self.showAvatar = showAvatar
        self.isGrouped = isGrouped
    }

    var body: some View {
        switch message.role {
        case .user:      userMessage
        case .assistant: assistantMessage
        case .tool:      toolMessage
        case .system:    systemMessage
        }
    }

    // MARK: - User Message (right-aligned, shadcn primary bubble)

    private var userMessage: some View {
        HStack {
            Spacer(minLength: Theme.Spacing.xxl)

            VStack(alignment: .trailing, spacing: Theme.Spacing.sm) {
                if !message.attachments.isEmpty {
                    AttachmentGroup(attachments: message.attachments)
                        .frame(maxWidth: 300, alignment: .trailing)
                }

                if !message.content.isEmpty {
                    Text(message.content)
                        .font(Theme.Font.body)
                        .foregroundStyle(Theme.Colors.userBubbleForeground.resolve(for: colorScheme))
                        .textSelection(.enabled)
                        .padding(.horizontal, Theme.Spacing.md + 2)
                        .padding(.vertical, Theme.Spacing.sm + 2)
                        .background(Theme.Colors.userBubble.resolve(for: colorScheme))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.lg)
                                .strokeBorder(Theme.Colors.userBubble.resolve(for: colorScheme), lineWidth: 1.5)
                        )
                }

                if !isGrouped, let time = message.timestamp {
                    Text(time, style: .time)
                        .font(Theme.Font.xs)
                        .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.vertical, isGrouped ? Theme.Spacing.xs : Theme.Spacing.sm)
    }

    // MARK: - Assistant Message (left-aligned with avatar)

    @State private var isAssistantHovered = false

    private var assistantMessage: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.md) {
            if showAvatar {
                if let nsImage = NSImage(contentsOfFile: Bundle.main.path(forResource: "monkey_avatar", ofType: "png") ?? "") {
                    Image(nsImage: nsImage)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: Theme.Avatar.md, height: Theme.Avatar.md)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                } else {
                    Text("🐵")
                        .font(.title2)
                        .frame(width: Theme.Avatar.md, height: Theme.Avatar.md, alignment: .top)
                }
            } else {
                Color.clear
                    .frame(width: Theme.Avatar.md)
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                if showAvatar {
                    Text(message.role.displayName)
                        .font(Theme.Font.sm)
                        .fontWeight(.semibold)
                        .foregroundStyle(Theme.Colors.assistantAccent.resolve(for: colorScheme))
                }

                if !message.attachments.isEmpty {
                    AttachmentGroup(attachments: message.attachments)
                        .frame(maxWidth: 400, alignment: .leading)
                }

                if !message.content.isEmpty {
                    MarkdownRenderer(content: message.content, isStreaming: message.isStreaming)
                }

                if !isGrouped, !message.isStreaming, let time = message.timestamp {
                    HStack(spacing: Theme.Spacing.sm) {
                        Text(time, style: .time)
                            .font(Theme.Font.xs)
                            .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))

                        if !message.isStreaming && !message.content.isEmpty {
                            CopyButton(text: message.content)
                        }
                    }
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.vertical, isGrouped ? Theme.Spacing.xs : Theme.Spacing.sm)
    }

    // MARK: - Tool Message (single-line shimmer style)

    @State private var shimmerOffset: CGFloat = -100

    private var toolMessage: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.md) {
            Color.clear.frame(width: Theme.Avatar.md)

            HStack(spacing: Theme.Spacing.sm) {
                // Spinning gear while running, checkmark when done
                if message.isStreaming {
                    Image(systemName: "gearshape.fill")
                        .font(Theme.Font.xs)
                        .foregroundStyle(Theme.Colors.toolAccent.resolve(for: colorScheme))
                        .rotationEffect(.degrees(shimmerOffset * 3.6))
                        .onAppear {
                            withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) {
                                shimmerOffset = 0
                            }
                        }
                } else {
                    Image(systemName: "checkmark.circle.fill")
                        .font(Theme.Font.xs)
                        .foregroundStyle(Theme.Colors.success.resolve(for: colorScheme))
                }

                if let name = message.toolName {
                    ShadBadge(text: name, variant: .outline)
                }

                if let summary = message.toolSummary, !summary.isEmpty {
                    Text(summary)
                        .font(Theme.Font.sm)
                        .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))
                        .lineLimit(1)
                        .shimmer()
                        .opacity(message.isStreaming ? 1 : 0.7)
                }

                // Show error inline if present
                if !message.content.isEmpty, message.content.hasPrefix("Error:") {
                    Text(message.content)
                        .font(Theme.Font.xs)
                        .foregroundStyle(Theme.Colors.error.resolve(for: colorScheme))
                        .lineLimit(1)
                }
            }
            .font(Theme.Font.sm)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.vertical, Theme.Spacing.xs)
    }

    // MARK: - System Message (centered, shadcn muted)

    private var systemMessage: some View {
        HStack {
            Spacer()
            Text(message.content)
                .font(Theme.Font.sm)
                .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))
                .padding(.horizontal, Theme.Spacing.md)
                .padding(.vertical, Theme.Spacing.sm)
                .background(Theme.Colors.muted.resolve(for: colorScheme).opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            Spacer()
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.vertical, Theme.Spacing.sm)
    }
}
