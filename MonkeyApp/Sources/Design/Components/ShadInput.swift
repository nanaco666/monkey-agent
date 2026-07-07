import SwiftUI

/// Input field — replaced by native glass input where possible.
/// Kept as a fallback for standalone text fields.
struct ShadInput: View {
    let placeholder: String
    @Binding var text: String
    var axis: Axis = .horizontal
    var onCommit: (() -> Void)? = nil

    @FocusState private var isFocused: Bool

    var body: some View {
        Group {
            if axis == .vertical {
                TextField(placeholder, text: $text, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...8)
                    .font(Theme.Font.body)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .focused($isFocused)
                    .onSubmit { onCommit?() }
            } else {
                TextField(placeholder, text: $text)
                    .textFieldStyle(.plain)
                    .font(Theme.Font.body)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .focused($isFocused)
                    .onSubmit { onCommit?() }
            }
        }
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: Theme.Radius.md))
    }
}
