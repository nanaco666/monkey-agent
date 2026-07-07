import SwiftUI

/// Horizontally scrollable row of attachments — inspired by shadcn AttachmentGroup.
struct AttachmentGroup: View {
    let attachments: [MessageAttachment]
    var onRemove: ((UUID) -> Void)? = nil

    var body: some View {
        if attachments.count == 1, let attachment = attachments.first {
            AttachmentCard(
                attachment: attachment,
                onRemove: onRemove.map { _ in { onRemove!(attachment.id) } }
            )
        } else if !attachments.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Theme.Spacing.sm) {
                    ForEach(attachments) { attachment in
                        AttachmentCard(
                            attachment: attachment,
                            onRemove: onRemove.map { _ in { onRemove!(attachment.id) } }
                        )
                    }
                }
            }
        }
    }
}
