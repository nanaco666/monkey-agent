import SwiftUI

struct SettingsView: View {
    let store: ChatStore
    @AppStorage("monkeyModel") private var selectedModel = "claude-sonnet-4-6"

    var body: some View {
        TabView {
            GeneralSettingsTab(store: store, selectedModel: $selectedModel)
                .tabItem { Label("General", systemImage: "gear") }

            AboutTab()
                .tabItem { Label("About", systemImage: "info.circle") }
        }
        .frame(width: 400, height: 280)
    }
}

private struct GeneralSettingsTab: View {
    let store: ChatStore
    @Binding var selectedModel: String

    private var models: [(alias: String, id: String)] {
        store.availableModels.isEmpty ? ModelRegistry.fallback : store.availableModels
    }

    var body: some View {
        Form {
            Picker("Default Model", selection: $selectedModel) {
                ForEach(models, id: \.id) { item in
                    Text(item.alias).tag(item.id)
                }
            }
            .onChange(of: selectedModel) {
                store.switchModel(selectedModel)
            }

            Toggle("Wild Mode (dangerous commands allowed)", isOn: Binding(
                get: { store.wildMode },
                set: { store.wildMode = $0; store.handleSlashCommand($0 ? "/wild" : "/tame") }
            ))


        }
        .padding(20)
    }
}

private struct AboutTab: View {
    var body: some View {
        VStack(spacing: 16) {
            Image("monkey_avatar", bundle: .module)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))

            Text("Monkey")
                .font(Theme.Font.title)

            Text("The AI assistant that evolves")
                .foregroundStyle(.secondary)

            Text("macOS native client")
                .font(Theme.Font.xs)
                .foregroundStyle(.tertiary)

            Divider()
                .frame(width: 200)

            Text("Pure local. Your data stays on your Mac.")
                .font(Theme.Font.xs)
                .foregroundStyle(.secondary)
        }
        .padding(24)
    }
}
