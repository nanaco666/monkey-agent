import SwiftUI

/// Native macOS toolbar with model picker.
struct MonkeyToolbar: ToolbarContent {
    @Bindable var store: ChatStore
    @Environment(\.colorScheme) private var colorScheme

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            modelPicker
        }
    }

    // MARK: - Model Picker

    private var modelPicker: some View {
        Menu {
            ForEach(ModelRegistry.all, id: \.0) { alias, model in
                Button {
                    store.switchModel(model)
                } label: {
                    if model == store.displayModel {
                        Text("✓ \(alias)")
                    } else {
                        Text(alias)
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "cpu")
                    .font(.caption2)
                Text(store.displayModel)
                    .lineLimit(1)
                    .font(.caption)
            }
        }
    }
}
