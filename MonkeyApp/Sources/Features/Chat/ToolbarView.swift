import SwiftUI

/// Top toolbar: connection status, model picker, mode toggle, usage, commands
struct ToolbarView: View {
    let store: ChatStore
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: Theme.Spacing.md) {
            StatusDot(isConnected: store.isConnected)

            modelPicker

            ShadSeparator(orientation: .vertical)
                .frame(height: 14)

            modeToggle

            Spacer()

            if store.usage.requests > 0 {
                Text(store.usage.summary)
                    .font(Theme.Font.xs)
                    .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))
            }

            commandsMenu

            clearButton
        }
        .padding(.horizontal, Theme.Spacing.lg)
        .padding(.vertical, Theme.Spacing.md - 2)
        .background(
            Theme.Colors.card.resolve(for: colorScheme)
                .shadow(color: Theme.Colors.foreground.resolve(for: colorScheme).opacity(0.06), radius: 2, y: 1)
        )
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
            ShadBadge(text: store.displayModel, icon: "cpu", variant: .default)
        }
        .menuStyle(.borderlessButton)
    }

    private var modeToggle: some View {
        Button {
            store.wildMode.toggle()
            store.handleSlashCommand(store.wildMode ? "/wild" : "/tame")
        } label: {
            ShadBadge(
                text: store.wildMode ? "Wild" : "Tame",
                icon: store.wildMode ? "flame.fill" : "shield.fill",
                variant: store.wildMode ? .warning : .success
            )
        }
        .buttonStyle(.plain)
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
                .font(Theme.Font.sm)
                .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))
        }
        .menuStyle(.borderlessButton)
    }

    private var clearButton: some View {
        ShadButton(icon: "trash", variant: .ghost, size: .iconXs) {
            store.clearConversation()
        }
    }
}
