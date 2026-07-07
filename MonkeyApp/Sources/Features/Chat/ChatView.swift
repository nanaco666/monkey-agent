import SwiftUI

/// Main chat layout: warm background + Liquid Glass controls floating above
struct ChatView: View {
    let store: ChatStore
    @State private var scrollState = ChatScrollState()
    @Environment(\.colorScheme) private var colorScheme

    /// True when agent is streaming but hasn't produced any text yet
    private var isAgentThinking: Bool {
        store.isStreaming && !store.messages.contains(where: { $0.role == .assistant && $0.isStreaming })
    }

    var body: some View {
        VStack(spacing: 0) {
            MessageListView(
                messages: store.messages,
                scrollState: scrollState,
                assistantName: store.assistantName,
                isAgentThinking: isAgentThinking
            )
            InputBar(store: store, scrollState: scrollState)
        }
        .frame(minWidth: 480, minHeight: 360)
        .background(Theme.Colors.background.resolve(for: colorScheme))
        .toolbar {
            MonkeyToolbar(store: store)
        }
    }
}
