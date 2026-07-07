import SwiftUI

/// Input bar with Liquid Glass send/stop button and auto-expanding text field.
struct InputBar: View {
    let store: ChatStore
    let scrollState: ChatScrollState
    @State private var inputText = ""
    @FocusState private var inputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .bottom, spacing: 0) {
                TextField("Message \(store.assistantName)…", text: $inputText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...8)
                    .font(Theme.Font.body)
                    .focused($inputFocused)
                    .onSubmit { send() }
                    .padding(.leading, 16)
                    .padding(.vertical, 10)

                sendOrStopButton
                    .padding(.trailing, 6)
                    .padding(.bottom, 6)
            }
            .glassEffect(.regular, in: .capsule)
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 16)
        }
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
            }
            .buttonStyle(.glass(.regular))
            .tint(.red)
            .transition(.scale.combined(with: .opacity))
        } else {
            Button(action: { send() }) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 13, weight: .semibold))
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.glassProminent)
            .tint(canSend ? nil : .gray)
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
