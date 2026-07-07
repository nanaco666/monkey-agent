import SwiftUI

/// shadcn/ui Input for SwiftUI
struct ShadInput: View {
    let placeholder: String
    @Binding var text: String
    var axis: Axis = .horizontal
    var onCommit: (() -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme
    @FocusState private var isFocused: Bool

    var body: some View {
        if axis == .vertical {
            TextField(placeholder, text: $text, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...8)
                .font(Theme.Font.body)
                .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Theme.Colors.background.resolve(for: colorScheme))
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.md)
                        .strokeBorder(
                            isFocused
                                ? Theme.Colors.ring.resolve(for: colorScheme)
                                : Theme.Colors.input.resolve(for: colorScheme),
                            lineWidth: isFocused ? 1.5 : 0.5
                        )
                )
                .focused($isFocused)
                .onSubmit { onCommit?() }
        } else {
            TextField(placeholder, text: $text)
                .textFieldStyle(.plain)
                .font(Theme.Font.body)
                .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Theme.Colors.background.resolve(for: colorScheme))
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.md)
                        .strokeBorder(
                            isFocused
                                ? Theme.Colors.ring.resolve(for: colorScheme)
                                : Theme.Colors.input.resolve(for: colorScheme),
                            lineWidth: isFocused ? 1.5 : 0.5
                        )
                )
                .focused($isFocused)
                .onSubmit { onCommit?() }
        }
    }
}
