import SwiftUI

/// Input bar: Liquid Glass capsule floating above warm background.
struct InputBar: View {
    let store: ChatStore
    let scrollState: ChatScrollState
    @State private var inputText = ""
    @FocusState private var inputFocused: Bool
    @Environment(\.colorScheme) private var colorScheme

    /// Whether the slash command menu should be visible
    private var showSlashMenu: Bool {
        inputText.hasPrefix("/") && !inputText.contains(" ")
    }

    /// Filtered commands matching current input
    private var filteredCommands: [(cmd: String, description: String)] {
        guard showSlashMenu else { return [] }
        let query = inputText.lowercased()
        return SlashCommandRegistry.all.filter { $0.cmd.hasPrefix(query) || $0.cmd.contains(query) }
    }

    var body: some View {
        VStack(spacing: 4) {
            // Slash command menu — inline above input, same width
            if showSlashMenu && !filteredCommands.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(filteredCommands, id: \.cmd) { item in
                        Button {
                            withAnimation(Theme.Animation.spring) {
                                inputText = item.cmd + " "
                            }
                            inputFocused = true
                        } label: {
                            HStack(spacing: 8) {
                                Text(item.cmd)
                                    .font(Theme.Font.code)
                                    .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                                Text(item.description)
                                    .font(Theme.Font.sm)
                                    .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))
                                Spacer()
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .glassEffect(.regular, in: .rect(cornerRadius: Theme.Radius.lg))
                .padding(.horizontal, 16)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }

            // Input capsule
            HStack(alignment: .center, spacing: 0) {
                TextField("Message \(store.assistantName)…", text: $inputText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...8)
                    .font(Theme.Font.body)
                    .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                    .focused($inputFocused)
                    .onSubmit { send() }
                    .padding(.leading, 16)
                    .padding(.vertical, 10)

                Spacer(minLength: 0)

                sendOrStopButton
                    .padding(.trailing, 6)
            }
            .glassEffect(.regular, in: .capsule)
            .padding(.horizontal, 16)
        }
        .animation(Theme.Animation.spring, value: showSlashMenu)
        .padding(.top, 8)
        .padding(.bottom, 16)
        .onAppear { inputFocused = true }
    }

    private var canSend: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && store.isConnected
    }

    @ViewBuilder
    private var sendOrStopButton: some View {
        if store.isStreaming {
            Button(action: { store.abortResponse() }) {
                Image(systemName: "stop.fill")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(Color(red: 232/255, green: 98/255, blue: 42/255)))
            }
            .buttonStyle(.plain)
            .transition(.scale.combined(with: .opacity))
        } else {
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
                        Circle().fill(
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
