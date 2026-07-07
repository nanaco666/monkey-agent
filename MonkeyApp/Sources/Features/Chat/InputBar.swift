import SwiftUI

/// Input bar inspired by shadcn/ui Message Scroller prompt area.
/// Floating rounded capsule with embedded send/stop button,
/// smooth focus ring transition, and auto-expanding text field.
struct InputBar: View {
    let store: ChatStore
    let scrollState: ChatScrollState
    @State private var inputText = ""
    @FocusState private var inputFocused: Bool
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            // Capsule input area
            HStack(alignment: .bottom, spacing: 0) {
                // Text field
                TextField("Message \(store.assistantName)…", text: $inputText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...8)
                    .font(Theme.Font.body)
                    .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                    .focused($inputFocused)
                    .onSubmit { send() }
                    .padding(.leading, Theme.Spacing.lg)
                    .padding(.vertical, Theme.Spacing.md + 2)

                // Send / Stop button embedded in the capsule
                sendOrStopButton
                    .padding(.trailing, Theme.Spacing.sm)
                    .padding(.bottom, Theme.Spacing.sm)
            }
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                    .fill(Theme.Colors.inputBarBackground.resolve(for: colorScheme))
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                    .strokeBorder(
                        inputFocused
                            ? Theme.Colors.inputBarBorderFocused.resolve(for: colorScheme)
                            : Theme.Colors.inputBarBorder.resolve(for: colorScheme),
                        lineWidth: inputFocused ? 1.5 : 1
                    )
            )
            .shadow(
                color: inputFocused
                    ? Theme.Colors.inputBarBorderFocused.resolve(for: colorScheme).opacity(0.2)
                    : Theme.Colors.foreground.resolve(for: colorScheme).opacity(0.08),
                radius: inputFocused ? 8 : 4,
                y: inputFocused ? 2 : 1
            )
            .animation(Theme.Animation.spring, value: inputFocused)
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.top, Theme.Spacing.md)
            .padding(.bottom, Theme.Spacing.lg)
        }
        .background(Theme.Colors.background.resolve(for: colorScheme))
        .onAppear { inputFocused = true }
    }

    private var canSend: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && store.isConnected
    }

    @ViewBuilder
    private var sendOrStopButton: some View {
        if store.isStreaming {
            // Stop button — circular, destructive
            Button(action: { store.abortResponse() }) {
                Image(systemName: "stop.fill")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 28, height: 28)
                    .background(
                        Circle()
                            .fill(Theme.Colors.destructive.resolve(for: colorScheme))
                    )
            }
            .buttonStyle(.plain)
            .transition(.scale.combined(with: .opacity))
        } else {
            // Send button — circular, fills when active
            Button(action: { send() }) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(
                        canSend
                            ? Theme.Colors.primaryForeground.resolve(for: colorScheme)
                            : Theme.Colors.mutedForeground.resolve(for: colorScheme)
                    )
                    .frame(width: 28, height: 28)
                    .background(
                        Circle()
                            .fill(
                                canSend
                                    ? Theme.Colors.primary.resolve(for: colorScheme)
                                    : Theme.Colors.muted.resolve(for: colorScheme).opacity(0.5)
                            )
                    )
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
            .animation(Theme.Animation.spring, value: canSend)
        }
    }

    private func send() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, store.isConnected else { return }
        inputText = ""
        inputFocused = true
        scrollState.engageFollowing()

        if text.hasPrefix("/") {
            store.handleSlashCommand(text)
        } else {
            Task { await store.sendMessage(text) }
        }
    }
}
