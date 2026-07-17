import SwiftUI

/// Full-featured Markdown renderer with block-level support.
/// Uses AttributedString(markdown: .full) to get PresentationIntent metadata,
/// then renders headings, lists, blockquotes, tables, and code blocks natively.
struct MarkdownRenderer: View {
    let content: String
    var isStreaming: Bool = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let blocks = BlockParser.parse(content)
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                switch block {
                case .codeBlock(let code, let lang):
                    CodeBlockView(code: code, language: lang)
                case .richText(let text):
                    RichTextView(text: text, colorScheme: colorScheme)
                }
            }

            if isStreaming {
                StreamingCursor()
            }
        }
    }
}

// MARK: - Block-level parsing

/// Splits raw markdown into code blocks and rich-text segments.
/// Code blocks are isolated first (they must not be parsed as markdown).
/// Everything else goes through AttributedString(markdown: .full) for full GFM rendering.
enum MarkdownBlock {
    case richText(String)
    case codeBlock(code: String, language: String?)
}

enum BlockParser {
    static func parse(_ content: String) -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        // Match fenced code blocks: ```lang\n...\n```
        let pattern = "```(\\w*)\\n([\\s\\S]*?)```"
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return [.richText(content)]
        }
        let nsRange = NSRange(content.startIndex..., in: content)
        let matches = regex.matches(in: content, range: nsRange)

        var lastEnd = content.startIndex
        for match in matches {
            guard let textRange = Range(match.range, in: content),
                  let codeRange = Range(match.range(at: 2), in: content),
                  let langRange = Range(match.range(at: 1), in: content) else { continue }

            // Text before this code block
            let before = String(content[lastEnd..<textRange.lowerBound])
            if !before.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                blocks.append(.richText(before))
            }

            let lang = String(content[langRange])
            let code = String(content[codeRange])
            blocks.append(.codeBlock(code: code, language: lang.isEmpty ? nil : lang))
            lastEnd = textRange.upperBound
        }

        let remaining = String(content[lastEnd...])
        if !remaining.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            blocks.append(.richText(remaining))
        }

        return blocks.isEmpty ? [.richText(content)] : blocks
    }
}

// MARK: - Rich text rendering with PresentationIntent

private struct RichTextView: View {
    let text: String
    let colorScheme: ColorScheme

    var body: some View {
        let elements = FullMarkdownParser.parse(text)
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(elements.enumerated()), id: \.offset) { _, element in
                switch element {
                case .heading(let level, let attr):
                    headingView(level: level, attr: attr)
                case .paragraph(let attr):
                    Text(attr)
                        .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                        .textSelection(.enabled)
                case .blockquote(let attr):
                    HStack(alignment: .top, spacing: 8) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Theme.Colors.mutedForeground.resolve(for: colorScheme).opacity(0.5))
                            .frame(width: 3)
                        Text(attr)
                            .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))
                            .textSelection(.enabled)
                    }
                    .padding(.leading, 4)
                case .listItem(let ordinal, let attr):
                    HStack(alignment: .top, spacing: 6) {
                        if let ord = ordinal {
                            Text("\(ord).")
                                .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))
                                .frame(width: 22, alignment: .trailing)
                        } else {
                            Text("•")
                                .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))
                                .frame(width: 14, alignment: .center)
                        }
                        Text(attr)
                            .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                            .textSelection(.enabled)
                    }
                case .table(let table):
                    TableView(table: table, colorScheme: colorScheme)
                case .thematicBreak:
                    Divider()
                        .foregroundStyle(Theme.Colors.border.resolve(for: colorScheme))
                }
            }
        }
    }

    @ViewBuilder
    private func headingView(level: Int, attr: AttributedString) -> some View {
        switch level {
        case 1:
            Text(attr)
                .font(Theme.Font.title)
                .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                .padding(.top, 8)
                .padding(.bottom, 2)
                .textSelection(.enabled)
        case 2:
            Text(attr)
                .font(Theme.Font.heading)
                .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                .padding(.top, 6)
                .padding(.bottom, 1)
                .textSelection(.enabled)
        case 3:
            Text(attr)
                .font(Theme.Font.lg)
                .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                .padding(.top, 4)
                .textSelection(.enabled)
        default:
            Text(attr)
                .font(Theme.Font.body.bold())
                .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                .textSelection(.enabled)
        }
    }
}

// MARK: - Full Markdown Parser using PresentationIntent

enum MarkdownElement {
    case heading(level: Int, AttributedString)
    case paragraph(AttributedString)
    case blockquote(AttributedString)
    case listItem(ordinal: Int?, AttributedString)
    case table(ParsedTable)
    case thematicBreak
}

struct ParsedTable {
    struct Column {
        let alignment: PresentationIntent.TableColumn.Alignment
        var header: AttributedString
    }
    struct Row {
        var cells: [AttributedString]
    }
    var columns: [Column]
    var rows: [Row]
}

enum FullMarkdownParser {
    /// Check if two runs belong to the same block (same structural identity).
    /// Without this, "**bold**：text" splits into two separate paragraphs/lines.
    private static func sameBlock(_ a: PresentationIntent?, _ b: PresentationIntent?) -> Bool {
        guard let a, let b else { return a == nil && b == nil }
        guard a.components.count == b.components.count else { return false }
        return zip(a.components, b.components).allSatisfy { $0.identity == $1.identity }
    }

    static func parse(_ source: String) -> [MarkdownElement] {
        guard let fullAttr = try? AttributedString(
            markdown: source,
            options: .init(interpretedSyntax: .full)
        ) else {
            return [.paragraph(AttributedString(source))]
        }

        // Pre-merge consecutive runs with the same block-level presentation intent.
        // Inline style changes (bold, italic, etc.) create separate runs even
        // within the same paragraph — without merging, each becomes its own line.
        var merged: [(attr: AttributedString, intent: PresentationIntent?)] = []
        for run in fullAttr.runs {
            let slice = AttributedString(fullAttr[run.range])
            let intent = run.presentationIntent
            if let last = merged.last, sameBlock(last.intent, intent) {
                merged[merged.count - 1].attr += slice
            } else {
                merged.append((slice, intent))
            }
        }

        var elements: [MarkdownElement] = []
        var currentTableId: Int? = nil
        var tableData = ParsedTable(columns: [], rows: [])

        for (attrSlice, intent) in merged {
            guard let intent else {
                elements.append(.paragraph(attrSlice))
                continue
            }

            let kinds = intent.components.map(\.kind)

            // Thematic break (---)
            if kinds.contains(.thematicBreak) {
                flushTable(&elements, &currentTableId, &tableData)
                elements.append(.thematicBreak)
                continue
            }

            // Heading
            if let headingLevel = kinds.compactMap({ kind -> Int? in
                if case .header(let level) = kind { return level }
                return nil
            }).first {
                flushTable(&elements, &currentTableId, &tableData)
                elements.append(.heading(level: headingLevel, attrSlice))
                continue
            }

            // Blockquote
            if kinds.contains(.blockQuote) {
                flushTable(&elements, &currentTableId, &tableData)
                elements.append(.blockquote(attrSlice))
                continue
            }

            // List item
            if let listItemOrdinal = kinds.compactMap({ kind -> Int?? in
                if case .listItem(let ordinal) = kind { return .some(ordinal) }
                return nil
            }).first ?? nil {
                flushTable(&elements, &currentTableId, &tableData)
                let isOrdered = kinds.contains(.orderedList)
                elements.append(.listItem(ordinal: isOrdered ? listItemOrdinal : nil, attrSlice))
                continue
            }

            // Table
            if kinds.contains(where: { if case .table = $0 { true } else { false } }) {
                // Get table ID to group cells
                let tableComp = intent.components.first { if case .table = $0.kind { true } else { false } }!
                let tableId = tableComp.identity

                if currentTableId != tableId {
                    flushTable(&elements, &currentTableId, &tableData)
                    currentTableId = tableId
                    // Extract column alignments
                    if case .table(let columns) = tableComp.kind {
                        tableData.columns = columns.map { ParsedTable.Column(alignment: $0.alignment, header: AttributedString("")) }
                    }
                }

                let isHeaderRow = kinds.contains(.tableHeaderRow)
                let cellIndex = kinds.compactMap { kind -> Int? in
                    if case .tableCell(let idx) = kind { return idx }
                    return nil
                }.first ?? 0
                let rowIndex = kinds.compactMap { kind -> Int? in
                    if case .tableRow(let idx) = kind { return idx }
                    return nil
                }.first ?? 0

                if isHeaderRow {
                    if cellIndex < tableData.columns.count {
                        tableData.columns[cellIndex].header = attrSlice
                    }
                } else {
                    // Ensure enough rows
                    while tableData.rows.count <= rowIndex {
                        tableData.rows.append(ParsedTable.Row(cells: []))
                    }
                    // Ensure enough cells in row
                    while tableData.rows[rowIndex].cells.count <= cellIndex {
                        tableData.rows[rowIndex].cells.append(AttributedString(""))
                    }
                    tableData.rows[rowIndex].cells[cellIndex] = attrSlice
                }
                continue
            }

            // Paragraph (default fallback)
            flushTable(&elements, &currentTableId, &tableData)
            elements.append(.paragraph(attrSlice))
        }

        flushTable(&elements, &currentTableId, &tableData)
        return elements
    }

    private static func flushTable(
        _ elements: inout [MarkdownElement],
        _ currentTableId: inout Int?,
        _ tableData: inout ParsedTable
    ) {
        guard currentTableId != nil else { return }
        if !tableData.columns.isEmpty {
            elements.append(.table(tableData))
        }
        currentTableId = nil
        tableData = ParsedTable(columns: [], rows: [])
    }
}

// MARK: - Table View

private struct TableView: View {
    let table: ParsedTable
    let colorScheme: ColorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header row
            HStack(spacing: 1) {
                ForEach(Array(table.columns.enumerated()), id: \.offset) { idx, col in
                    Text(col.header)
                        .font(Theme.Font.sm.bold())
                        .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                        .frame(maxWidth: .infinity, alignment: alignmentFor(col.alignment))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(Theme.Colors.muted.resolve(for: colorScheme))
                }
            }

            // Data rows
            ForEach(Array(table.rows.enumerated()), id: \.offset) { rowIdx, row in
                HStack(spacing: 1) {
                    ForEach(Array(row.cells.enumerated()), id: \.offset) { cellIdx, cell in
                        let align = cellIdx < table.columns.count ? table.columns[cellIdx].alignment : .left
                        Text(cell)
                            .font(Theme.Font.sm)
                            .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                            .frame(maxWidth: .infinity, alignment: alignmentFor(align))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(
                                rowIdx % 2 == 0
                                    ? Theme.Colors.card.resolve(for: colorScheme)
                                    : Theme.Colors.background.resolve(for: colorScheme)
                            )
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                .strokeBorder(Theme.Colors.border.resolve(for: colorScheme).opacity(0.3), lineWidth: 0.5)
        )
    }

    private func alignmentFor(_ alignment: PresentationIntent.TableColumn.Alignment) -> Alignment {
        switch alignment {
        case .center: return .center
        case .right: return .trailing
        default: return .leading
        }
    }
}
