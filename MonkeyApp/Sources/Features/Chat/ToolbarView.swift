import SwiftUI

/// Native macOS toolbar with model picker using system Picker.
/// System renders it as a proper menu button showing the selected model name.
struct MonkeyToolbar: ToolbarContent {
    @Bindable var store: ChatStore

    var body: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            Picker(selection: $store.displayModel) {
                ForEach(models, id: \.id) { item in
                    Text(item.alias).tag(item.id)
                }
            } label: {
                Label("Model", systemImage: "monkey")
            }
            .pickerStyle(.menu)
            .onChange(of: store.displayModel) { _, newValue in
                store.switchModel(newValue)
            }
        }
    }

    private var models: [(alias: String, id: String)] {
        store.availableModels.isEmpty ? ModelRegistry.fallback : store.availableModels
    }
}
