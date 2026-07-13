import Foundation
import SwiftUI

// MARK: - Message Types

enum MessageRole: String, Codable, Sendable {
    case user, assistant, tool, system
}

struct ChatMessage: Identifiable, Codable {
    let id: UUID
    let role: MessageRole
    var content: String
    var toolName: String?
    var toolSummary: String?   // Short description of what the tool is doing
    var toolId: String?        // Matches tool_start with tool_result
    var timestamp: Date?
    var isStreaming: Bool
    var attachments: [MessageAttachment]

    enum CodingKeys: String, CodingKey {
        case id, role, content, toolName, toolSummary, toolId, timestamp, attachments
    }

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

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        role = try c.decode(MessageRole.self, forKey: .role)
        content = try c.decode(String.self, forKey: .content)
        toolName = try c.decodeIfPresent(String.self, forKey: .toolName)
        toolSummary = try c.decodeIfPresent(String.self, forKey: .toolSummary)
        toolId = try c.decodeIfPresent(String.self, forKey: .toolId)
        timestamp = try c.decodeIfPresent(Date.self, forKey: .timestamp)
        attachments = try c.decodeIfPresent([MessageAttachment].self, forKey: .attachments) ?? []
        isStreaming = false
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(role, forKey: .role)
        try c.encode(content, forKey: .content)
        try c.encodeIfPresent(toolName, forKey: .toolName)
        try c.encodeIfPresent(toolSummary, forKey: .toolSummary)
        try c.encodeIfPresent(toolId, forKey: .toolId)
        try c.encodeIfPresent(timestamp, forKey: .timestamp)
        try c.encode(attachments, forKey: .attachments)
    }
}

// MARK: - Attachment

struct MessageAttachment: Identifiable, Codable {
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

    enum CodingKeys: String, CodingKey {
        case id, name, fileType, fileSize, url
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

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        fileType = try c.decode(String.self, forKey: .fileType)
        fileSize = try c.decodeIfPresent(String.self, forKey: .fileSize)
        url = try c.decodeIfPresent(String.self, forKey: .url)
        state = .done
        imageData = nil
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(name, forKey: .name)
        try c.encode(fileType, forKey: .fileType)
        try c.encodeIfPresent(fileSize, forKey: .fileSize)
        try c.encodeIfPresent(url, forKey: .url)
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
    /// Built-in fallback models shown when daemon hasn't connected yet
    static let fallback: [(alias: String, id: String)] = [
        ("Sonnet 4", "claude-sonnet-4-6"),
        ("Haiku 4.5", "claude-haiku-4-5"),
        ("GLM-5.2", "glm-5.2"),
        ("GLM-5.1", "glm-5.1"),
        ("GLM-5", "glm-5"),
        ("GLM-4.5", "glm-4.5"),
    ]

    /// Convert model ID to display alias
    static func alias(for model: String, models: [(alias: String, id: String)] = []) -> String {
        models.first(where: { $0.id == model })?.alias ?? model
    }
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
