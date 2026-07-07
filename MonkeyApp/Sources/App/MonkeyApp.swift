import SwiftUI

@main
struct MonkeyApp: App {
    @State private var store = ChatStore()

    var body: some Scene {
        WindowGroup {
            ChatView(store: store)
                .onAppear { store.start() }
                .onDisappear { store.stop() }
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified(showsTitle: true))
        .defaultSize(width: 720, height: 560)
        .commands {
            CommandGroup(replacing: .newItem) { }
            CommandMenu("Monkey") {
                Button("Clear Conversation") {
                    store.clearConversation()
                }
                .keyboardShortcut("k", modifiers: [.command, .shift])

                Divider()

                Button("Wild Mode") {
                    store.wildMode = true
                    store.handleSlashCommand("/wild")
                }
                Button("Tame Mode") {
                    store.wildMode = false
                    store.handleSlashCommand("/tame")
                }

                Divider()

                Button("Compact Context") {
                    Task { await store.compactContext() }
                }
                .keyboardShortcut("e", modifiers: [.command, .shift])

                Button("Clean Stale Data") {
                    Task { await store.cleanStale() }
                }
            }
        }

        Settings {
            SettingsView(store: store)
        }
    }
}
