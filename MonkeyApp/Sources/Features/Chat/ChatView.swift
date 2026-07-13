import SwiftUI

/// Main layout: sidebar + chat with NavigationSplitView (macOS 26 sidebar style)
struct ChatView: View {
    @Bindable var store: ChatStore
    @State private var scrollState = ChatScrollState()
    @Environment(\.colorScheme) private var colorScheme
    @State private var sidebarVisibility: NavigationSplitViewVisibility = .all

    private var isAgentThinking: Bool {
        store.isStreaming && !store.messages.contains(where: { $0.role == .assistant && $0.isStreaming })
    }

    var body: some View {
        NavigationSplitView(columnVisibility: $sidebarVisibility) {
            SidebarView(store: store)
        } detail: {
            chatDetail
        }
        .frame(minWidth: 720, minHeight: 480)
        .toolbar {
            MonkeyToolbar(store: store)
        }
        .onAppear {
            store.start()
            store.loadCurrentSession()
        }
    }

    private var chatDetail: some View {
        VStack(spacing: 0) {
            MessageListView(
                messages: store.messages,
                scrollState: scrollState,
                assistantName: store.assistantName,
                isAgentThinking: isAgentThinking
            )
            InputBar(store: store, scrollState: scrollState)
        }
        .background(Theme.Colors.background.resolve(for: colorScheme))
        .navigationTitle(store.sessionStore.currentSession?.title ?? "Monkey")
        .navigationSubtitle(store.displayModel)
    }
}
