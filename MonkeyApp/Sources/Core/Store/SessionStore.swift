import Foundation

/// A chat session metadata (lightweight, no messages).
/// Used for sidebar listing. Full messages come from the daemon.
struct ChatSessionMeta: Identifiable, Codable, Hashable {
    let id: String
    var title: String
    var model: String
    var wildMode: Bool
    var createdAt: String
    var updatedAt: String
    var messageCount: Int

    init(from dict: [String: Any]) {
        self.id = dict["id"] as? String ?? UUID().uuidString
        self.title = dict["title"] as? String ?? "Untitled"
        self.model = dict["model"] as? String ?? ""
        self.wildMode = dict["wildMode"] as? Bool ?? false
        self.createdAt = dict["createdAt"] as? String ?? ""
        self.updatedAt = dict["updatedAt"] as? String ?? ""
        self.messageCount = dict["messageCount"] as? Int ?? 0
    }
}

/// Manages session list via daemon RPC.
/// No longer stores sessions locally — the daemon is the single source of truth.
@Observable
@MainActor
final class SessionStore {
    private(set) var sessions: [ChatSessionMeta] = []
    var currentSessionId: String?

    // MARK: - Access

    var currentSession: ChatSessionMeta? {
        guard let id = currentSessionId else { return nil }
        return sessions.first { $0.id == id }
    }

    /// Group sessions by day for sidebar display
    var groupedByDay: [(label: String, sessions: [ChatSessionMeta])] {
        let cal = Calendar.current
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let groups = Dictionary(grouping: sessions) { session -> Date in
            guard let date = formatter.date(from: session.updatedAt) else {
                // Fallback: try without fractional seconds
                let fallback = ISO8601DateFormatter()
                if let d = fallback.date(from: session.updatedAt) { return cal.startOfDay(for: d) }
                return Date(timeIntervalSince1970: 0)
            }
            return cal.startOfDay(for: date)
        }

        let displayFormatter = DateFormatter()
        displayFormatter.locale = Locale.current

        return groups
            .sorted { $0.key > $1.key }
            .map { (day, sessions) in
                if cal.isDateInToday(day) {
                    return ("Today", sessions)
                } else if cal.isDateInYesterday(day) {
                    return ("Yesterday", sessions)
                } else {
                    displayFormatter.dateStyle = .medium
                    return (displayFormatter.string(from: day), sessions)
                }
            }
    }

    // MARK: - Update from RPC

    func updateSessions(_ metas: [ChatSessionMeta]) {
        sessions = metas
    }

    func setCurrent(_ id: String) {
        currentSessionId = id
    }

    // MARK: - Local cache (for sidebar preview before daemon connects)

    private let cacheDir: URL = {
        URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent(".monkey-cli/sessions")
    }()

    func loadCache() {
        guard let files = try? FileManager.default.contentsOfDirectory(at: cacheDir, includingPropertiesForKeys: nil) else {
            return
        }
        var cached: [ChatSessionMeta] = []
        for file in files where file.pathExtension == "json" {
            guard let data = try? Data(contentsOf: file),
                  let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
            // Extract metadata from cached session files
            let meta = ChatSessionMeta(from: dict)
            cached.append(meta)
        }
        if sessions.isEmpty {
            sessions = cached.sorted { $0.updatedAt > $1.updatedAt }
            currentSessionId = sessions.first?.id
        }
    }
}
