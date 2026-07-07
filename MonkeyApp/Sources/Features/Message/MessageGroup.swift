import SwiftUI

/// Groups consecutive messages from the same sender, hiding redundant avatars/headers.
/// Inspired by shadcn MessageGroup.
struct MessageGroupBuilder {
    /// Group consecutive messages of the same role, returning (message, showAvatar, isGrouped) tuples.
    ///
    /// Special rule: the first tool message after a user message gets its own avatar group
    /// (showing the assistant avatar), because the assistant is actively working even before
    /// producing text output.
    static func group(_ messages: [ChatMessage]) -> [(message: ChatMessage, showAvatar: Bool, isGrouped: Bool)] {
        var result: [(message: ChatMessage, showAvatar: Bool, isGrouped: Bool)] = []

        for (index, msg) in messages.enumerated() {
            let prev: ChatMessage? = index > 0 ? messages[index - 1] : nil
            let prevEffective = prev.map { effectiveRole($0.role) }

            let showAvatar: Bool
            let isGrouped: Bool

            switch msg.role {
            case .user:
                showAvatar = true
                isGrouped = false

            case .assistant:
                let isGroupedWithPrev = prevEffective == .assistant
                showAvatar = !isGroupedWithPrev
                isGrouped = isGroupedWithPrev

            case .tool:
                // First tool after a user message → show assistant avatar (this is the start of agent work)
                if prev?.role == .user {
                    showAvatar = true
                    isGrouped = false
                } else {
                    // Subsequent tools or tools after assistant → grouped
                    showAvatar = false
                    isGrouped = true
                }

            case .system:
                showAvatar = false
                isGrouped = false
            }

            result.append((message: msg, showAvatar: showAvatar, isGrouped: isGrouped))
        }

        return result
    }

    /// Tool messages effectively belong to the assistant group
    private static func effectiveRole(_ role: MessageRole) -> MessageRole {
        role == .tool ? .assistant : role
    }
}
