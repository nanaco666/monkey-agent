import Foundation
import SwiftUI

// MARK: - Message Types

enum MessageRole: String, Codable, Sendable {
    case user, assistant, tool, system
}

struct ChatMessage: Identifiable {
    let id: UUID
    let role: MessageRole
    var content: String
    var toolName: String?
    var toolSummary: String?   // Short description of what the tool is doing
    var toolId: String?        // Matches tool_start with tool_result
    var timestamp: Date?
    var isStreaming: Bool
    var attachments: [MessageAttachment]

    init(
        id: UUID = UUID(),
        role: MessageRole,
        content: String,
        toolName: String? = nil,
        toolSummary: String? = nil,
        toolId: String? = nil,
        timestamp: Date? = Date(),
        isStreaming: Bool = false,
        attachments: [MessageAttachment] = []
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.toolName = toolName
        self.toolSummary = toolSummary
        self.toolId = toolId
        self.timestamp = timestamp
        self.isStreaming = isStreaming
        self.attachments = attachments
    }
}

// MARK: - Attachment

struct MessageAttachment: Identifiable {
    let id: UUID
    let name: String
    let fileType: String       // e.g. "PDF", "PNG", "TypeScript"
    let fileSize: String?      // e.g. "2.4 MB"
    let state: AttachmentState
    let imageData: Data?       // For image previews
    let url: String?           // For clickable links

    enum AttachmentState {
        case idle
        case uploading(progress: Double)  // 0..1
        case processing
        case error(String)                // Error message
        case done
    }

    init(
        id: UUID = UUID(),
        name: String,
        fileType: String,
        fileSize: String? = nil,
        state: AttachmentState = .done,
        imageData: Data? = nil,
        url: String? = nil
    ) {
        self.id = id
        self.name = name
        self.fileType = fileType
        self.fileSize = fileSize
        self.state = state
        self.imageData = imageData
        self.url = url
    }

    var isImage: Bool {
        ["PNG", "JPG", "JPEG", "GIF", "WEBP", "SVG"].contains(fileType.uppercased())
    }
}

// MARK: - Usage

struct UsageInfo: Sendable {
    var inputTokens: Int = 0
    var outputTokens: Int = 0
    var cacheReadTokens: Int = 0
    var requests: Int = 0

    var summary: String {
        let fmtK = { (n: Int) -> String in n >= 1000 ? String(format: "%.1fK", Double(n) / 1000) : String(n) }
        return "\(requests) req · \(fmtK(inputTokens + outputTokens)) tok"
    }
}

// MARK: - Model & Command Registry

enum ModelRegistry {
    static let all: [(alias: String, model: String)] = [
        ("Sonnet 4", "claude-sonnet-4-6"),
        ("Opus 4",   "claude-opus-4-6"),
        ("Haiku 4",  "claude-haiku-4-5-latest"),
        ("GPT-4o",   "gpt-4o"),
        ("o3",       "o3"),
        ("o4-mini",  "o4-mini"),
        ("GLM-5",    "glm-5"),
        ("GLM-4.5",  "glm-4.5"),
    ]
}

enum SlashCommandRegistry {
    static let all: [(cmd: String, description: String)] = [
        ("/commit", "Generate git commit"),
        ("/plan",   "Read-only planning mode"),
        ("/memory", "View & manage memory"),
        ("/model",  "Show or switch model"),
        ("/usage",  "Show token usage & cost"),
        ("/clean",  "Prune stale sessions & memory"),
        ("/clear",  "Clear conversation history"),
        ("/wild",   "Unlock dangerous commands"),
        ("/tame",   "Re-enable safety mode"),
    ]
}

// MARK: - Role Display

extension MessageRole {
    var displayName: String {
        switch self {
        case .user: return "You"
        case .assistant: return "Monkey"
        case .tool: return "Tool"
        case .system: return "System"
        }
    }

    /// Alignment: user = end (right), others = start (left)
    var alignment: HorizontalAlignment {
        switch self {
        case .user: return .trailing
        default:    return .leading
        }
    }

    /// System icon for avatar
    var avatarIcon: String {
        switch self {
        case .user:      return "person.circle.fill"
        case .assistant: return "monkey"
        case .tool:      return "wrench.and.screwdriver.fill"
        case .system:    return "info.circle"
        }
    }
}
