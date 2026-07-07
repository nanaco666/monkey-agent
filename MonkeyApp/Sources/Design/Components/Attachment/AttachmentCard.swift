import SwiftUI

/// File/image attachment card — inspired by shadcn Attachment.
struct AttachmentCard: View {
    let attachment: MessageAttachment
    var onRemove: (() -> Void)? = nil
    var onOpen: (() -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: Theme.Spacing.md) {
            mediaSlot
            contentSlot
            actionsSlot
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, Theme.Spacing.sm + 2)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md)
                .strokeBorder(borderColor, lineWidth: 0.5)
        )
        .overlay(shimmerOverlay)
    }

    @ViewBuilder
    private var mediaSlot: some View {
        if attachment.isImage, let data = attachment.imageData, let nsImage = NSImage(data: data) {
            Image(nsImage: nsImage)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 40, height: 40)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
        } else {
            fileIcon
        }
    }

    private var fileIcon: some View {
        Image(systemName: fileTypeIcon)
            .font(.title3)
            .foregroundStyle(fileIconColor)
            .frame(width: 40, height: 40)
            .background(Theme.Colors.muted.resolve(for: colorScheme))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
    }

    private var contentSlot: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(attachment.name)
                .font(Theme.Font.sm)
                .fontWeight(.medium)
                .foregroundStyle(titleColor)
                .lineLimit(1)

            Text(descriptionText)
                .font(Theme.Font.xs)
                .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))
                .lineLimit(1)
        }
    }

    @ViewBuilder
    private var actionsSlot: some View {
        if onRemove != nil {
            ShadButton(icon: "xmark", variant: .ghost, size: .iconXs) {
                onRemove?()
            }
        }
    }

    private var cardBackground: SwiftUI.Color {
        switch attachment.state {
        case .error: return Theme.Colors.destructive.resolve(for: colorScheme).opacity(0.04)
        default:     return Theme.Colors.card.resolve(for: colorScheme)
        }
    }

    private var borderColor: SwiftUI.Color {
        switch attachment.state {
        case .error: return Theme.Colors.destructive.resolve(for: colorScheme).opacity(0.2)
        default:     return Theme.Colors.border.resolve(for: colorScheme)
        }
    }

    private var titleColor: SwiftUI.Color {
        switch attachment.state {
        case .uploading, .processing: return Theme.Colors.mutedForeground.resolve(for: colorScheme)
        case .error:                  return Theme.Colors.destructive.resolve(for: colorScheme)
        default:                      return Theme.Colors.foreground.resolve(for: colorScheme)
        }
    }

    private var descriptionText: String {
        switch attachment.state {
        case .idle:           return "Ready to upload"
        case .uploading(let p): return "Uploading · \(Int(p * 100))%"
        case .processing:     return "Processing…"
        case .error(let msg): return msg
        case .done:
            var parts = [attachment.fileType]
            if let size = attachment.fileSize { parts.append(size) }
            return parts.joined(separator: " · ")
        }
    }

    @ViewBuilder
    private var shimmerOverlay: some View {
        if case .uploading = attachment.state {
            GeometryReader { geo in
                let gradient = LinearGradient(
                    stops: [
                        .init(color: .clear, location: 0),
                        .init(color: SwiftUI.Color.white.opacity(0.15), location: 0.5),
                        .init(color: .clear, location: 1),
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                gradient
                    .frame(width: geo.size.width * 2)
                    .offset(x: -geo.size.width + (Date().timeIntervalSince1970.truncatingRemainder(dividingBy: 2) / 2) * geo.size.width * 3)
            }
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            .allowsHitTesting(false)
        }
    }

    private var fileTypeIcon: String {
        switch attachment.fileType.uppercased() {
        case "PDF":       return "doc.fill"
        case "PNG", "JPG", "JPEG", "GIF", "WEBP", "SVG": return "photo.fill"
        case "ZIP", "TAR", "GZ": return "doc.zipper"
        case "CSV", "XLSX", "XLS": return "tablecells.fill"
        case "TS", "TSX", "JS", "JSX": return "curlybraces"
        case "SWIFT":     return "swift"
        case "PY":        return "terminal.fill"
        default:          return "doc.text.fill"
        }
    }

    private var fileIconColor: SwiftUI.Color {
        switch attachment.fileType.uppercased() {
        case "PDF":       return .red
        case "PNG", "JPG", "JPEG", "GIF", "WEBP", "SVG": return .green
        case "ZIP", "TAR", "GZ": return .orange
        case "CSV", "XLSX", "XLS": return .green
        case "TS", "TSX", "JS", "JSX": return .yellow
        case "SWIFT":     return .orange
        case "PY":        return .blue
        default:          return Theme.Colors.mutedForeground.resolve(for: colorScheme)
        }
    }
}
