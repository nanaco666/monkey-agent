import SwiftUI

// MARK: - Chat Scroll State

/// Tracks whether the reader is at the live edge of the conversation.
/// Inspired by shadcn's MessageScroller philosophy:
/// - Auto-scroll only when the reader is at the bottom
/// - Scrolling away disengages follow-output
/// - Explicit actions (send, jump) re-engage it
@Observable
final class ChatScrollState {
    /// Whether the reader is near the bottom (within threshold)
    var isAtBottom: Bool = true

    /// Whether auto-scroll is engaged (follows streaming output)
    var isFollowing: Bool = true

    /// Distance threshold to consider "at bottom"
    let bottomThreshold: CGFloat = 60

    /// Previous item peek height when anchoring a new turn
    let previousItemPeek: CGFloat = 64

    /// Re-engage following (e.g. when user sends a message or clicks jump)
    func engageFollowing() {
        isFollowing = true
        isAtBottom = true
    }

    /// Disengage following (e.g. when user scrolls up)
    func disengageFollowing() {
        isFollowing = false
        isAtBottom = false
    }

    /// Update state based on scroll position
    func updateFromScroll(offset: CGFloat, contentHeight: CGFloat, viewportHeight: CGFloat) {
        let distanceFromBottom = contentHeight - offset - viewportHeight
        let wasAtBottom = isAtBottom
        isAtBottom = distanceFromBottom < bottomThreshold

        // If user scrolled up away from bottom, disengage
        if !isAtBottom && wasAtBottom {
            isFollowing = false
        }
        // If user scrolled back to bottom, re-engage
        if isAtBottom && !isFollowing {
            isFollowing = true
        }
    }
}
