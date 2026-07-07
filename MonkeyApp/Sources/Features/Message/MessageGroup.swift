import SwiftUI

/// Groups consecutive messages from the same sender, hiding redundant avatars/headers.
/// Inspired by shadcn MessageGroup.
struct MessageGroupBuilder {
    /// Group consecutive messages of the same role, returning (message, showAvatar, isGrouped) tuples.
    static func group(_ messages: [ChatMessage]) -> [(message: ChatMessage, showAvatar: Bool, isGrouped: Bool)] {
        var result: [(message: ChatMessage, showAvatar: Bool, isGrouped: Bool)] = []

        for (index, msg) in messages.enumerated() {
            let prevSameRole: Bool
            if index > 0 {
                let prev = messages[index - 1]
                // Tool messages are grouped with assistant
                prevSameRole = effectiveRole(msg.role) == effectiveRole(prev.role)
            } else {
                prevSameRole = false
            }

            let showAvatar: Bool
            let isGrouped: Bool

            switch msg.role {
            case .user:
                // Always show user bubbles standalone
                showAvatar = true
                isGrouped = false
            case .assistant:
                // Group consecutive assistant messages
                showAvatar = !prevSameRole
                isGrouped = prevSameRole
            case .tool:
                // Tool messages grouped with assistant
                showAvatar = false
                isGrouped = true
            case .system:
                // System messages always standalone
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
