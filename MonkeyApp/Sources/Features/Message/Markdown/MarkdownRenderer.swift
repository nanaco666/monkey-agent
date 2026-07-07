import SwiftUI

/// Markdown renderer using AttributedString with code block support.
struct MarkdownRenderer: View {
    let content: String
    var isStreaming: Bool = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let segments = ContentParser.parse(content)
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(segments.enumerated()), id: \.offset) { _, seg in
                switch seg {
                case .text(let text):
                    AttributedTextView(text: text, colorScheme: colorScheme)
                case .code(let code, let lang):
                    CodeBlockView(code: code, language: lang)
                }
            }

            if isStreaming {
                StreamingCursor()
            }
        }
    }
}

private struct AttributedTextView: View {
    let text: String
    let colorScheme: ColorScheme

    var body: some View {
        if let attributed = try? AttributedString(
            markdown: text,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        ) {
            Text(attributed)
                .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                .textSelection(.enabled)
        } else {
            Text(text)
                .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                .textSelection(.enabled)
        }
    }
}

enum ContentSegment {
    case text(String)
    case code(code: String, language: String?)
}

enum ContentParser {
    static func parse(_ content: String) -> [ContentSegment] {
        var segments: [ContentSegment] = []
        let pattern = try? NSRegularExpression(pattern: "```(\\w*)\\n([\\s\\S]*?)```", options: [])
        let nsRange = NSRange(content.startIndex..., in: content)

        guard let regex = pattern else {
            return [.text(content)]
        }
        let matches = regex.matches(in: content, range: nsRange)
        guard !matches.isEmpty else {
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
}
