import SwiftUI

struct MessageRow: View {
    let message: ChatMessage

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            // Avatar
            avatarView
                .frame(width: 28, alignment: .top)

            // Content
            VStack(alignment: .leading, spacing: 3) {
                // Header line
                HStack(spacing: 6) {
                    Text(message.role.displayName)
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(message.role.headerColor)

                    if let name = message.toolName {
                        Text(name)
                            .font(.caption2)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Color.orange.opacity(0.1))
                            .cornerRadius(3)
                    }

                    Spacer()

                    if let time = message.timestamp {
                        Text(time, style: .time)
                            .font(.caption2)
                            .foregroundStyle(.quaternary)
                    }
                }

                // Body
                if message.role == .tool {
                    toolResultView
                } else {
                    markdownBody
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 2)
    }

    // MARK: - Avatar

    @ViewBuilder
    private var avatarView: some View {
        switch message.role {
        case .user:
            Image(systemName: "person.circle.fill")
                .font(.title2)
                .foregroundStyle(.secondary)
        case .assistant:
            Text("🐵")
                .font(.title2)
        case .tool:
            Image(systemName: "wrench.and.screwdriver.fill")
                .font(.callout)
                .foregroundStyle(.orange)
        case .system:
            Image(systemName: "info.circle")
                .font(.callout)
                .foregroundStyle(.blue)
        }
    }

    // MARK: - Markdown Body

    @ViewBuilder
    private var markdownBody: some View {
        let segments = parseContent(message.content)
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(segments.enumerated()), id: \.offset) { _, seg in
                switch seg {
                case .code(let code, let lang):
                    codeBlock(code: code, language: lang)
                case .text(let text):
                    textView(text)
                }
            }
        }
    }

    @ViewBuilder
    private func textView(_ text: String) -> some View {
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false)
        VStack(alignment: .leading, spacing: 1) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                let trimmed = String(line)
                if trimmed.hasPrefix("### ") {
                    Text(String(trimmed.dropFirst(4)))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                } else if trimmed.hasPrefix("## ") {
                    Text(String(trimmed.dropFirst(3)))
                        .font(.subheadline.weight(.semibold))
                } else if trimmed.hasPrefix("# ") {
                    Text(String(trimmed.dropFirst(2)))
                        .font(.headline)
                } else if trimmed.hasPrefix("- ") || trimmed.hasPrefix("• ") {
                    HStack(alignment: .top, spacing: 4) {
                        Text("•")
                            .font(.body)
                            .foregroundStyle(.secondary)
                        Text(String(trimmed.dropFirst(2)))
                            .font(.body)
                    }
                } else if trimmed.hasPrefix("> ") {
                    Text(String(trimmed.dropFirst(2)))
                        .font(.body)
                        .italic()
                        .foregroundStyle(.secondary)
                        .padding(.leading, 8)
                        .overlay(
                            Rectangle()
                                .fill(Color.accentColor.opacity(0.3))
                                .frame(width: 2),
                            alignment: .leading
                        )
                } else if trimmed.isEmpty {
                    Spacer().frame(height: 4)
                } else {
                    Text(trimmed)
                        .font(.body)
                }
            }
        }
        .textSelection(.enabled)
    }

    @ViewBuilder
    private func codeBlock(code: String, language: String?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if let lang = language, !lang.isEmpty {
                HStack {
                    Text(lang)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    Spacer()
                    Button {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(code, forType: .string)
                    } label: {
                        Image(systemName: "doc.on.doc")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Color(nsColor: .controlBackgroundColor).opacity(0.5))
            }

            ScrollView(.horizontal, showsIndicators: false) {
                Text(code)
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
                    .padding(8)
            }
        }
        .background(Color(nsColor: .textBackgroundColor).opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .strokeBorder(Color(nsColor: .separatorColor).opacity(0.5), lineWidth: 0.5)
        )
    }

    // MARK: - Tool Result

    @ViewBuilder
    private var toolResultView: some View {
        let content = message.content
        let isError = content.hasPrefix("Error:")

        Group {
            if content.count > 300 {
                VStack(alignment: .leading, spacing: 4) {
                    Text(String(content.prefix(300)))
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(isError ? .red : .secondary)
                    Text("… (\(content.count) chars)")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            } else {
                Text(content)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(isError ? .red : .secondary)
            }
        }
        .textSelection(.enabled)
    }
}

// MARK: - Content Parsing

enum ContentSegment {
    case text(String)
    case code(code: String, language: String?)
}

func parseContent(_ content: String) -> [ContentSegment] {
    var segments: [ContentSegment] = []
    let pattern = try? NSRegularExpression(pattern: "```(\\w*)\\n([\\s\\S]*?)```", options: [])
    let nsRange = NSRange(content.startIndex..., in: content)

    guard let regex = pattern,
          let matches = try? regex.matches(in: content, range: nsRange),
          !matches.isEmpty else {
        return [.text(content)]
    }

    var lastEnd = content.startIndex
    for match in matches {
        if let textRange = Range(match.range, in: content),
           let codeRange = Range(match.range(at: 2), in: content),
           let langRange = Range(match.range(at: 1), in: content) {
            let before = String(content[lastEnd..<textRange.lowerBound])
            if !before.isEmpty {
                segments.append(.text(before))
            }
            let lang = String(content[langRange])
            let code = String(content[codeRange])
            segments.append(.code(code: code, language: lang.isEmpty ? nil : lang))
            lastEnd = textRange.upperBound
        }
    }
    let remaining = String(content[lastEnd...])
    if !remaining.isEmpty {
        segments.append(.text(remaining))
    }

    return segments.isEmpty ? [.text(content)] : segments
}

// MARK: - Role Extensions

extension MessageRole {
    var displayName: String {
        switch self {
        case .user: return "You"
        case .assistant: return "Monkey"
        case .tool: return "Tool"
        case .system: return "System"
        }
    }

    var headerColor: Color {
        switch self {
        case .user: return .accentColor
        case .assistant: return .orange
        case .tool: return .secondary
        case .system: return .blue
        }
    }
}
