import SwiftUI

/// Top toolbar: connection status, model picker, mode toggle, usage, commands.
/// Uses native macOS 26 glass button styles.
struct ToolbarView: View {
    let store: ChatStore

    var body: some View {
        HStack(spacing: 8) {
            StatusDot(isConnected: store.isConnected)

            modelPicker

            Spacer()
                .frame(width: 8)

            modeToggle

            Spacer()

            if store.usage.requests > 0 {
                Text(store.usage.summary)
                    .font(Theme.Font.xs)
                    .foregroundStyle(.tertiary)
            }

            commandsMenu

            clearButton
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }

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
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
        }
        .menuStyle(.borderlessButton)
    }

    private var modeToggle: some View {
        Button {
            store.wildMode.toggle()
            store.handleSlashCommand(store.wildMode ? "/wild" : "/tame")
        } label: {
            HStack(spacing: 3) {
                Image(systemName: store.wildMode ? "flame.fill" : "shield.fill")
                    .font(.caption2)
                Text(store.wildMode ? "Wild" : "Tame")
                    .font(.caption)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
        }
        .buttonStyle(.glass(.regular))
        .tint(store.wildMode ? .orange : .green)
    }

    private var commandsMenu: some View {
        Menu {
            Section("Commands") {
                ForEach(SlashCommandRegistry.all, id: \.cmd) { entry in
                    Button("\(entry.cmd) — \(entry.description)") {
                        store.handleSlashCommand(entry.cmd)
                    }
                }
            }
        } label: {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .font(.caption)
        }
        .menuStyle(.borderlessButton)
    }

    private var clearButton: some View {
        Button {
            store.clearConversation()
        } label: {
            Image(systemName: "trash")
                .font(.caption)
        }
        .buttonStyle(.glass(.regular))
        .tint(.red)
    }
}
