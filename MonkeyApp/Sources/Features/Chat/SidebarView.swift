import SwiftUI

/// Sidebar listing all chat sessions grouped by day.
/// macOS 26 sidebar style with liquid glass.
struct SidebarView: View {
    @Bindable var store: ChatStore
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        List(selection: Binding(
            get: { store.sessionStore.currentSessionId ?? "" },
            set: { newId in
                if !newId.isEmpty && newId != store.sessionStore.currentSessionId {
                    store.switchSession(newId)
                }
            }
        )) {
            ForEach(store.sessionStore.groupedByDay, id: \.label) { group in
                Section(group.label) {
                    ForEach(group.sessions) { session in
                        SessionRow(session: session)
                            .tag(session.id)
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    store.deleteSession(session.id)
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("Chats")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    store.newSession()
                } label: {
                    Label("New Chat", systemImage: "square.and.pencil")
                }
            }
        }
    }
}

/// Single session row — title + last message time
private struct SessionRow: View {
    let session: ChatSessionMeta

    private var timeString: String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: session.updatedAt) else {
            let fallback = ISO8601DateFormatter()
            guard let d = fallback.date(from: session.updatedAt) else { return "" }
            return formatTime(d)
        }
        return formatTime(date)
    }

    private func formatTime(_ date: Date) -> String {
        let cal = Calendar.current
        let displayFormatter = DateFormatter()
        if cal.isDateInToday(date) {
            displayFormatter.timeStyle = .short
        } else {
            displayFormatter.dateStyle = .short
        }
        return displayFormatter.string(from: date)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(session.title)
                    .font(.system(size: 13, weight: .medium))
                    .lineLimit(1)
                Spacer()
                Text(timeString)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }
            Text("\(session.messageCount) messages")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(.vertical, 2)
    }
}
