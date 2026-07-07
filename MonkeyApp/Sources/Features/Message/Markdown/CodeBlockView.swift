import SwiftUI

/// Syntax-highlighted code block with language label and copy button
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
                .padding(.vertical, Theme.Spacing.sm + 1)
                .background(Theme.Colors.codeHeaderBackground.resolve(for: colorScheme))
            } else {
                HStack {
                    Spacer()
                    CopyButton(text: code)
                }
                .padding(.horizontal, Theme.Spacing.md)
                .padding(.vertical, Theme.Spacing.xs)
            }

            ShadSeparator()

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

    /// Simple syntax highlighting via AttributedString
    private var highlightedCode: AttributedString {
        var attr = AttributedString(code)
        let fg = colorScheme == .dark
            ? NSColor(red: 0.63, green: 0.63, blue: 0.63, alpha: 1) // #A1A1AA
            : NSColor(red: 0.44, green: 0.44, blue: 0.47, alpha: 1) // #71717A

        attr.foregroundColor = Color(fg)

        // Keywords (common across languages)
        let keywordColor = colorScheme == .dark
            ? NSColor(red: 0.98, green: 0.57, blue: 0.24, alpha: 1) // orange
            : NSColor(red: 0.80, green: 0.30, blue: 0.10, alpha: 1)
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
                        attr[attrRange].foregroundColor = Color(keywordColor)
                    }
                }
            }
        }

        // Strings (single and double quoted)
        let stringColor = colorScheme == .dark
            ? NSColor(red: 0.29, green: 0.76, blue: 0.47, alpha: 1) // green
            : NSColor(red: 0.13, green: 0.55, blue: 0.27, alpha: 1)
        for pattern in ["\"[^\"\\\\]*(\\\\.[^\"\\\\]*)*\"", "'[^'\\\\]*(\\\\.[^'\\\\]*)*'"] {
            if let regex = try? NSRegularExpression(pattern: pattern) {
                let nsRange = NSRange(code.startIndex..., in: code)
                for match in regex.matches(in: code, range: nsRange) {
                    if let range = Range(match.range, in: code),
                       let attrRange = Range(range, in: attr) {
                        attr[attrRange].foregroundColor = Color(stringColor)
                    }
                }
            }
        }

        // Comments (// and #)
        let commentColor = colorScheme == .dark
            ? NSColor(red: 0.42, green: 0.44, blue: 0.47, alpha: 1) // dim
            : NSColor(red: 0.55, green: 0.57, blue: 0.60, alpha: 1)
        for pattern in ["//.*$", "#[^\\n]*$"] {
            if let regex = try? NSRegularExpression(pattern: pattern, options: [.anchorsMatchLines]) {
                let nsRange = NSRange(code.startIndex..., in: code)
                for match in regex.matches(in: code, range: nsRange) {
                    if let range = Range(match.range, in: code),
                       let attrRange = Range(range, in: attr) {
                        attr[attrRange].foregroundColor = Color(commentColor)
                    }
                }
            }
        }

        // Numbers
        let numberColor = colorScheme == .dark
            ? NSColor(red: 0.55, green: 0.65, blue: 0.95, alpha: 1) // light blue
            : NSColor(red: 0.30, green: 0.35, blue: 0.70, alpha: 1)
        if let regex = try? NSRegularExpression(pattern: "\\b\\d+(\\.\\d+)?\\b") {
            let nsRange = NSRange(code.startIndex..., in: code)
            for match in regex.matches(in: code, range: nsRange) {
                if let range = Range(match.range, in: code),
                   let attrRange = Range(range, in: attr) {
                    attr[attrRange].foregroundColor = Color(numberColor)
                }
            }
        }

        return attr
    }
}
