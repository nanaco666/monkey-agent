import SwiftUI

struct ContentView: View {
    @EnvironmentObject var chatState: ChatState
    @State private var inputText = ""
    @FocusState private var inputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Toolbar
            toolbarView

            Divider()

            // Message list
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(chatState.messages) { msg in
                            MessageRow(message: msg)
                                .id(msg.id)
                        }
                    }
                    .padding(.vertical, 8)
                }
                .onChange(of: chatState.messages.count) {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(chatState.messages.last?.id, anchor: .bottom)
                    }
                }
            }

            Divider()

            // Input area
            inputView
        }
        .frame(minWidth: 480, minHeight: 360)
        .background(Color(nsColor: .textBackgroundColor))
        .onAppear {
            inputFocused = true
        }
    }

    // MARK: - Toolbar

    private var toolbarView: some View {
        HStack(spacing: 8) {
            // Connection indicator
            Circle()
                .fill(chatState.isConnected ? Color.green : Color.orange)
                .frame(width: 8, height: 8)

            // Model picker
            Menu {
                ForEach(ModelAliases.all, id: \.0) { alias, model in
                    Button {
                        chatState.switchModel(model)
                    } label: {
                        if model == chatState.displayModel {
                            Text("✓ \(alias)")
                        } else {
                            Text(alias)
                        }
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "cpu")
                        .font(.caption2)
                    Text(chatState.displayModel)
                        .lineLimit(1)
                        .font(.caption)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(RoundedRectangle(cornerRadius: 5).fill(Color.accentColor.opacity(0.08)))
            }
            .menuStyle(.borderlessButton)

            // Wild/Tame toggle
            Button {
                chatState.wildMode.toggle()
                chatState.handleSlashCommand(chatState.wildMode ? "/wild" : "/tame")
            } label: {
                HStack(spacing: 3) {
                    Image(systemName: chatState.wildMode ? "flame.fill" : "shield.fill")
                        .font(.caption2)
                    Text(chatState.wildMode ? "Wild" : "Tame")
                        .font(.caption)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(
                    RoundedRectangle(cornerRadius: 5)
                        .fill(chatState.wildMode ? Color.orange.opacity(0.12) : Color.green.opacity(0.08))
                )
            }
            .buttonStyle(.plain)

            Spacer()

            // Usage
            if chatState.usage.requests > 0 {
                Text(chatState.usage.summary)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            // Slash commands menu
            Menu {
                Section("Commands") {
                    ForEach(SlashCommands.all, id: \.cmd) { entry in
                        Button("\(entry.cmd) — \(entry.description)") {
                            sendSlashCommand(entry.cmd)
                        }
                    }
                }
            } label: {
                Image(systemName: "line.3.horizontal.decrease.circle")
                    .font(.caption)
            }
            .menuStyle(.borderlessButton)

            // Clear
            Button {
                chatState.clearConversation()
            } label: {
                Image(systemName: "trash")
                    .font(.caption)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.bar)
    }

    // MARK: - Input

    private var inputView: some View {
        HStack(alignment: .bottom, spacing: 8) {
            // Multi-line text field
            TextField("Message \(chatState.assistantName)…", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...8)
                .font(.body)
                .focused($inputFocused)
                .onSubmit {
                    sendMessage()
                }

            // Send / Stop button
            if chatState.isStreaming {
                Button {
                    chatState.abortResponse()
                } label: {
                    Image(systemName: "stop.circle.fill")
                        .font(.title2)
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(.red)
                }
                .buttonStyle(.plain)
            } else {
                Button {
                    sendMessage()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(canSend ? Color.accentColor : Color.gray.opacity(0.4))
                }
                .buttonStyle(.plain)
                .disabled(!canSend)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.bar)
    }

    private var canSend: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && chatState.isConnected
    }

    // MARK: - Actions

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, chatState.isConnected else { return }
        inputText = ""
        inputFocused = true

        if text.hasPrefix("/") {
            chatState.handleSlashCommand(text)
        } else {
            Task { await chatState.sendMessage(text) }
        }
    }

    private func sendSlashCommand(_ cmd: String) {
        inputText = ""
        chatState.handleSlashCommand(cmd)
    }
}

// MARK: - Model Aliases

struct ModelAliases {
    static let all: [(String, String)] = [
        ("Sonnet 4", "claude-sonnet-4-6"),
        ("Opus 4",   "claude-opus-4-6"),
        ("Haiku 4",  "claude-haiku-4-5-latest"),
        ("GPT-4o",   "gpt-4o"),
        ("o3",       "o3"),
        ("o4-mini",  "o4-mini"),
        ("GLM-5",    "glm-5"),
        ("GLM-4.5",  "glm-4.5"),
    ]
}

// MARK: - Slash Commands

struct SlashCommands {
    static let all: [(cmd: String, description: String)] = [
        ("/commit", "Generate git commit"),
        ("/plan",   "Read-only planning mode"),
        ("/memory", "View & manage memory"),
        ("/model",  "Show or switch model"),
        ("/usage",  "Show token usage & cost"),
        ("/clean",  "Prune stale sessions & memory"),
        ("/clear",  "Clear conversation history"),
        ("/wild",   "Unlock dangerous commands"),
        ("/tame",   "Re-enable safety mode"),
    ]
}
