import SwiftUI

/// Input field with warm palette and glass overlay.
struct ShadInput: View {
    let placeholder: String
    @Binding var text: String
    var axis: Axis = .horizontal
    var onCommit: (() -> Void)? = nil
    @Environment(\.colorScheme) private var colorScheme

    @FocusState private var isFocused: Bool

    var body: some View {
        Group {
            if axis == .vertical {
                TextField(placeholder, text: $text, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...8)
                    .font(Theme.Font.body)
                    .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .focused($isFocused)
                    .onSubmit { onCommit?() }
            } else {
                TextField(placeholder, text: $text)
                    .textFieldStyle(.plain)
                    .font(Theme.Font.body)
                    .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .focused($isFocused)
                    .onSubmit { onCommit?() }
            }
        }
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: Theme.Radius.md))
    }
}
