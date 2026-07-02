import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var chatState: ChatState
    @AppStorage("monkeyModel") private var selectedModel = "claude-sonnet-4-6"
    @AppStorage("monkeyCliPath") private var cliPath = ""

    var body: some View {
        TabView {
            GeneralSettingsView()
                .tabItem {
                    Label("General", systemImage: "gear")
                }

            AboutView()
                .tabItem {
                    Label("About", systemImage: "info.circle")
                }
        }
        .frame(width: 400, height: 280)
    }
}

struct GeneralSettingsView: View {
    @EnvironmentObject var chatState: ChatState
    @AppStorage("monkeyModel") private var selectedModel = "claude-sonnet-4-6"

    var body: some View {
        Form {
            Picker("Default Model", selection: $selectedModel) {
                ForEach(ModelAliases.all, id: \.1) { alias, model in
                    Text(alias).tag(model)
                }
            }
            .onChange(of: selectedModel) {
                chatState.switchModel(selectedModel)
            }

            Toggle("Wild Mode (dangerous commands allowed)", isOn: Binding(
                get: { chatState.wildMode },
                set: { chatState.wildMode = $0; chatState.handleSlashCommand($0 ? "/wild" : "/tame") }
            ))

            LabeledContent("Status") {
                HStack(spacing: 4) {
                    Circle()
                        .fill(chatState.isConnected ? Color.green : Color.orange)
                        .frame(width: 8, height: 8)
                    Text(chatState.isConnected ? "Connected" : "Connecting…")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(20)
    }
}

struct AboutView: View {
    var body: some View {
        VStack(spacing: 16) {
            Text("🐵")
                .font(.system(size: 64))

            Text("Monkey")
                .font(.title.weight(.bold))

            Text("The AI assistant that evolves")
                .foregroundStyle(.secondary)

            Text("macOS native client")
                .font(.caption)
                .foregroundStyle(.tertiary)

            Divider()
                .frame(width: 200)

            Text("Pure local. Your data stays on your Mac.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(24)
    }
}
