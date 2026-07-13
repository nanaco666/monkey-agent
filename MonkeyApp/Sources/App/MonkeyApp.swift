import SwiftUI

@main
struct MonkeyApp: App {
    @State private var store = ChatStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ChatView(store: store)
                .windowResizeAnchor(.center)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background {
                store.stop()
            } else if phase == .active {
                store.start()
            }
            // .inactive = window losing focus, don't disconnect
        }
        .windowToolbarStyle(.unified)
        .defaultSize(width: 900, height: 600)
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
