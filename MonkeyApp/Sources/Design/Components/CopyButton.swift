import SwiftUI

/// Copy to clipboard button
struct CopyButton: View {
    let text: String
    @State private var copied = false

    var body: some View {
        ShadButton(icon: copied ? "checkmark" : "doc.on.doc", variant: .ghost, size: .iconXs) {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(text, forType: .string)
            copied = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                copied = false
            }
        }
        .foregroundStyle(copied ? .green : .secondary)
    }
}
