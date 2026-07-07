import SwiftUI

/// Main chat layout: toolbar + messages + input
struct ChatView: View {
    let store: ChatStore
    @State private var scrollState = ChatScrollState()

    var body: some View {
        VStack(spacing: 0) {
            ToolbarView(store: store)
            MessageListView(messages: store.messages, scrollState: scrollState, assistantName: store.assistantName)
            InputBar(store: store, scrollState: scrollState)
        }
        .frame(minWidth: 480, minHeight: 360)
    }
}
