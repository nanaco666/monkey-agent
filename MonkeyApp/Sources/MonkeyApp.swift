import SwiftUI

@main
struct MonkeyApp: App {
    @StateObject private var chatState = ChatState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(chatState)
                .onAppear {
                    chatState.startMonkeyProcess()
                }
                .onDisappear {
                    chatState.stopMonkeyProcess()
                }
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified(showsTitle: true))
        .defaultSize(width: 720, height: 560)
        .commands {
            CommandGroup(replacing: .newItem) { }
            CommandMenu("Monkey") {
                Button("Clear Conversation") {
                    chatState.clearConversation()
                }
                .keyboardShortcut("k", modifiers: [.command, .shift])

                Divider()

                Button("Wild Mode") {
                    chatState.wildMode = true
                    chatState.handleSlashCommand("/wild")
                }
                Button("Tame Mode") {
                    chatState.wildMode = false
                    chatState.handleSlashCommand("/tame")
                }

                Divider()

                Button("Compact Context") {
                    Task { await chatState.compactContext() }
                }
                .keyboardShortcut("e", modifiers: [.command, .shift])

                Button("Clean Stale Data") {
                    Task { await chatState.cleanStale() }
                }
            }
        }

        Settings {
            SettingsView()
                .environmentObject(chatState)
        }
    }
}
