import SwiftUI

/// Main chat layout: warm background + Liquid Glass controls floating above
struct ChatView: View {
    let store: ChatStore
    @State private var scrollState = ChatScrollState()
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            ToolbarView(store: store)
            MessageListView(messages: store.messages, scrollState: scrollState, assistantName: store.assistantName)
            InputBar(store: store, scrollState: scrollState)
        }
        .frame(minWidth: 480, minHeight: 360)
        .background(Theme.Colors.background.resolve(for: colorScheme))
    }
}
