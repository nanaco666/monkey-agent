import SwiftUI

/// A single message in a conversation, using Liquid Glass for badges and system messages.
struct MessageRow: View {
    let message: ChatMessage
    let showAvatar: Bool
    let isGrouped: Bool

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

    // MARK: - User Message (right-aligned bubble)

    private var userMessage: some View {
        HStack {
            Spacer(minLength: 48)

            VStack(alignment: .trailing, spacing: 4) {
                if !message.attachments.isEmpty {
                    AttachmentGroup(attachments: message.attachments)
                        .frame(maxWidth: 300, alignment: .trailing)
                }

                if !message.content.isEmpty {
                    Text(message.content)
                        .font(Theme.Font.body)
                        .foregroundStyle(Color.white)
                        .textSelection(.enabled)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Color.accentColor)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg))
                }

                if !isGrouped, let time = message.timestamp {
                    Text(time, style: .time)
                        .font(Theme.Font.xs)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, isGrouped ? 2 : 6)
    }

    // MARK: - Assistant Message (left-aligned with avatar)

    private var assistantMessage: some View {
        HStack(alignment: .top, spacing: 10) {
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

            VStack(alignment: .leading, spacing: 4) {
                if showAvatar {
                    Text(message.role.displayName)
                        .font(Theme.Font.sm)
                        .fontWeight(.semibold)
                        .foregroundStyle(.secondary)
                }

                if !message.attachments.isEmpty {
                    AttachmentGroup(attachments: message.attachments)
                        .frame(maxWidth: 400, alignment: .leading)
                }

                if !message.content.isEmpty {
                    MarkdownRenderer(content: message.content, isStreaming: message.isStreaming)
                }

                if !isGrouped, !message.isStreaming, let time = message.timestamp {
                    HStack(spacing: 6) {
                        Text(time, style: .time)
                            .font(Theme.Font.xs)
                            .foregroundStyle(.tertiary)

                        if !message.isStreaming && !message.content.isEmpty {
                            CopyButton(text: message.content)
                        }
                    }
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, isGrouped ? 2 : 6)
    }

    // MARK: - Tool Message (glass badge style)

    @State private var shimmerOffset: CGFloat = -100

    private var toolMessage: some View {
        HStack(alignment: .top, spacing: 10) {
            Color.clear.frame(width: Theme.Avatar.md)

            HStack(spacing: 6) {
                if message.isStreaming {
                    Image(systemName: "gearshape.fill")
                        .font(Theme.Font.xs)
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(shimmerOffset * 3.6))
                        .onAppear {
                            withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) {
                                shimmerOffset = 0
                            }
                        }
                } else {
                    Image(systemName: "checkmark.circle.fill")
                        .font(Theme.Font.xs)
                        .foregroundStyle(.green)
                }

                if let name = message.toolName {
                    Text(name)
                        .font(Theme.Font.xs)
                        .fontWeight(.medium)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .glassEffect(.clear, in: .capsule)
                }

                if let summary = message.toolSummary, !summary.isEmpty {
                    Text(summary)
                        .font(Theme.Font.sm)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .shimmer()
                        .opacity(message.isStreaming ? 1 : 0.7)
                }

                if !message.content.isEmpty, message.content.hasPrefix("Error:") {
                    Text(message.content)
                        .font(Theme.Font.xs)
                        .foregroundStyle(.red)
                        .lineLimit(1)
                }
            }
            .font(Theme.Font.sm)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 2)
    }

    // MARK: - System Message (centered glass pill)

    private var systemMessage: some View {
        HStack {
            Spacer()
            Text(message.content)
                .font(Theme.Font.sm)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .glassEffect(.clear, in: .capsule)
            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 6)
    }
}
