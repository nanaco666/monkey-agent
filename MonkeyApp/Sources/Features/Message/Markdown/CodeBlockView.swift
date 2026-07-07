import SwiftUI

/// Syntax-highlighted code block with language label and copy button
struct CodeBlockView: View {
    let code: String
    let language: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let lang = language, !lang.isEmpty {
                HStack {
                    Text(lang)
                        .font(Theme.Font.xs)
                        .fontWeight(.medium)
                        .foregroundStyle(.secondary)
                    Spacer()
                    CopyButton(text: code)
                }
                .padding(.horizontal, Theme.Spacing.md)
                .padding(.vertical, 5)
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
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: Theme.Radius.md))
    }

    /// Simple syntax highlighting via AttributedString
    private var highlightedCode: AttributedString {
        var attr = AttributedString(code)
        attr.foregroundColor = .secondary

        // Keywords
        let keywordColor = Color.orange
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

        // Strings
        let stringColor = Color.green
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

        // Comments
        let commentColor = Color.gray
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

        // Numbers
        let numberColor = Color.blue
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
