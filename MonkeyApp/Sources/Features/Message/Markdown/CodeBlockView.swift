import SwiftUI

/// Syntax-highlighted code block with warm background and glass border.
struct CodeBlockView: View {
    let code: String
    let language: String?
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let lang = language, !lang.isEmpty {
                HStack {
                    Text(lang)
                        .font(Theme.Font.xs)
                        .fontWeight(.medium)
                        .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))
                    Spacer()
                    CopyButton(text: code)
                }
                .padding(.horizontal, Theme.Spacing.md)
                .padding(.vertical, 5)
                .background(Theme.Colors.codeHeaderBackground.resolve(for: colorScheme))
            } else {
                HStack {
                    Spacer()
                    CopyButton(text: code)
                }
                .padding(.horizontal, Theme.Spacing.md)
                .padding(.vertical, 2)
            }

            Divider()

            ScrollView(.horizontal, showsIndicators: false) {
                Text(highlightedCode)
                    .font(Theme.Font.code)
                    .textSelection(.enabled)
                    .padding(Theme.Spacing.md)
            }
        }
        .background(Theme.Colors.codeBackground.resolve(for: colorScheme))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md)
                .strokeBorder(Theme.Colors.border.resolve(for: colorScheme), lineWidth: 0.5)
        )
    }

    private var highlightedCode: AttributedString {
        var attr = AttributedString(code)
        attr.foregroundColor = Theme.Colors.foreground.resolve(for: colorScheme)

        let keywordColor = Color(hex: "C86420")
        let keywords = ["func", "class", "struct", "enum", "protocol", "extension",
                        "var", "let", "const", "if", "else", "for", "while", "return",
                        "import", "export", "from", "async", "await", "try", "catch",
                        "throw", "throws", "public", "private", "static", "self",
                        "this", "new", "true", "false", "nil", "null", "undefined",
                        "switch", "case", "break", "continue", "default", "guard",
                        "typealias", "init", "deinit", "override", "super", "where"]
        for keyword in keywords {
            let pattern = "\\b\(keyword)\\b"
            if let regex = try? NSRegularExpression(pattern: pattern) {
                let nsRange = NSRange(code.startIndex..., in: code)
                for match in regex.matches(in: code, range: nsRange) {
                    if let range = Range(match.range, in: code),
                       let attrRange = Range(range, in: attr) {
                        attr[attrRange].foregroundColor = keywordColor
                    }
                }
            }
        }

        let stringColor = Color(hex: "5E7A50")
        for pattern in ["\"[^\"\\\\]*(\\\\.[^\"\\\\]*)*\"", "'[^'\\\\]*(\\\\.[^'\\\\]*)*'"] {
            if let regex = try? NSRegularExpression(pattern: pattern) {
                let nsRange = NSRange(code.startIndex..., in: code)
                for match in regex.matches(in: code, range: nsRange) {
                    if let range = Range(match.range, in: code),
                       let attrRange = Range(range, in: attr) {
                        attr[attrRange].foregroundColor = stringColor
                    }
                }
            }
        }

        let commentColor = Color(hex: "8F7E72")
        for pattern in ["//.*$", "#[^\\n]*$"] {
            if let regex = try? NSRegularExpression(pattern: pattern, options: [.anchorsMatchLines]) {
                let nsRange = NSRange(code.startIndex..., in: code)
                for match in regex.matches(in: code, range: nsRange) {
                    if let range = Range(match.range, in: code),
                       let attrRange = Range(range, in: attr) {
                        attr[attrRange].foregroundColor = commentColor
                    }
                }
            }
        }

        let numberColor = Color(hex: "5A3835")
        if let regex = try? NSRegularExpression(pattern: "\\b\\d+(\\.\\d+)?\\b") {
            let nsRange = NSRange(code.startIndex..., in: code)
            for match in regex.matches(in: code, range: nsRange) {
                if let range = Range(match.range, in: code),
                   let attrRange = Range(range, in: attr) {
                    attr[attrRange].foregroundColor = numberColor
                }
            }
        }

        return attr
    }
}
