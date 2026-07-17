import SwiftUI
import UniformTypeIdentifiers

/// Input bar: Liquid Glass capsule floating above warm background.
struct InputBar: View {
    let store: ChatStore
    let scrollState: ChatScrollState
    @State private var inputText = ""
    @State private var pendingAttachments: [MessageAttachment] = []
    @FocusState private var inputFocused: Bool
    @Environment(\.colorScheme) private var colorScheme

    /// Whether the slash command menu should be visible
    private var showSlashMenu: Bool {
        inputText.hasPrefix("/") && !inputText.contains(" ")
    }

    /// Filtered commands matching current input
    private var filteredCommands: [(cmd: String, description: String)] {
        guard showSlashMenu else { return [] }
        let query = inputText.lowercased()
        return SlashCommandRegistry.all.filter { $0.cmd.hasPrefix(query) || $0.cmd.contains(query) }
    }

    var body: some View {
        VStack(spacing: 4) {
            // Slash command menu — inline above input, same width
            if showSlashMenu && !filteredCommands.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(filteredCommands, id: \.cmd) { item in
                        Button {
                            withAnimation(Theme.Animation.spring) {
                                inputText = item.cmd + " "
                            }
                            inputFocused = true
                        } label: {
                            HStack(spacing: 8) {
                                Text(item.cmd)
                                    .font(Theme.Font.code)
                                    .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                                Text(item.description)
                                    .font(Theme.Font.sm)
                                    .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))
                                Spacer()
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .glassEffect(.regular, in: .rect(cornerRadius: Theme.Radius.lg))
                .padding(.horizontal, 16)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }

            // Pending attachments
            if !pendingAttachments.isEmpty {
                VStack(spacing: 0) {
                    ForEach(pendingAttachments) { att in
                        AttachmentCard(
                            attachment: att,
                            onRemove: { removeAttachment(att.id) }
                        )
                        .padding(.horizontal, 16)
                        .padding(.vertical, 2)
                    }
                }
                .padding(.top, 4)
            }

            // Input capsule
            HStack(alignment: .center, spacing: 0) {
                // Attachment button
                Button(action: { showFilePicker() }) {
                    Image(systemName: "paperclip")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Colors.mutedForeground.resolve(for: colorScheme))
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
                .padding(.leading, 8)

                TextField("Message \(store.assistantName)…", text: $inputText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...8)
                    .font(Theme.Font.body)
                    .foregroundStyle(Theme.Colors.foreground.resolve(for: colorScheme))
                    .focused($inputFocused)
                    .onSubmit { send() }
                    .padding(.leading, 4)
                    .padding(.vertical, 10)

                Spacer(minLength: 0)

                sendOrStopButton
                    .padding(.trailing, 6)
            }
            .glassEffect(.regular, in: .capsule)
            .padding(.horizontal, 16)
            // Drop zone for files
            .onDrop(of: [.fileURL], isTargeted: nil) { providers in
                handleDrop(providers)
            }
        }
        .animation(Theme.Animation.spring, value: showSlashMenu)
        .animation(Theme.Animation.spring, value: pendingAttachments.count)
        .padding(.top, 8)
        .padding(.bottom, 16)
        .onAppear { inputFocused = true }
    }

    private var canSend: Bool {
        (!inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !pendingAttachments.isEmpty)
        && store.isConnected
    }

    @ViewBuilder
    private var sendOrStopButton: some View {
        if store.isStreaming {
            Button(action: { store.abortResponse() }) {
                Image(systemName: "stop.fill")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(Color(red: 232/255, green: 98/255, blue: 42/255)))
            }
            .buttonStyle(.plain)
            .transition(.scale.combined(with: .opacity))
        } else {
            Button(action: { send() }) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(
                        canSend
                            ? Theme.Colors.primaryForeground.resolve(for: colorScheme)
                            : Theme.Colors.mutedForeground.resolve(for: colorScheme)
                    )
                    .frame(width: 28, height: 28)
                    .background(
                        Circle().fill(
                            canSend
                                ? Theme.Colors.primary.resolve(for: colorScheme)
                                : Theme.Colors.muted.resolve(for: colorScheme).opacity(0.5)
                        )
                    )
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
            .animation(Theme.Animation.spring, value: canSend)
        }
    }

    private func send() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        let atts = pendingAttachments
        guard !text.isEmpty || !atts.isEmpty, store.isConnected else { return }
        inputText = ""
        pendingAttachments = []
        inputFocused = true
        scrollState.engageFollowing()

        if text.hasPrefix("/") {
            store.handleSlashCommand(text)
        } else {
            Task { await store.sendMessage(text.isEmpty ? "(See attachment)" : text, attachments: atts) }
        }
    }

    // MARK: - File picking

    private func showFilePicker() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowedContentTypes = [
            .image, .pdf, .plainText, .sourceCode, .json,
            .text, .commaSeparatedText,
        ]
        if panel.runModal() == .OK {
            for url in panel.urls {
                if let att = loadAttachment(from: url) {
                    pendingAttachments.append(att)
                }
            }
        }
    }

    private func handleDrop(_ providers: [NSItemProvider]) -> Bool {
        for provider in providers {
            if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
                provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                    if let data = item as? Data,
                       let url = URL(dataRepresentation: data, relativeTo: nil) {
                        DispatchQueue.main.async {
                            if let att = loadAttachment(from: url) {
                                pendingAttachments.append(att)
                            }
                        }
                    }
                }
            }
        }
        return true
    }

    private func loadAttachment(from url: URL) -> MessageAttachment? {
        let fileName = url.lastPathComponent
        let ext = url.pathExtension.uppercased()

        // Determine file type
        let fileType: String
        switch ext {
        case "PNG", "JPG", "JPEG", "GIF", "WEBP", "SVG", "HEIC":
            fileType = ext
        case "PDF":
            fileType = "PDF"
        case "TXT", "MD":
            fileType = "TXT"
        case "JSON":
            fileType = "JSON"
        case "TS", "TSX", "JS", "JSX", "SWIFT", "PY":
            fileType = ext
        case "CSV", "XLSX", "XLS":
            fileType = ext
        case "ZIP", "TAR", "GZ":
            fileType = ext
        default:
            fileType = "FILE"
        }

        let isImage = ["PNG", "JPG", "JPEG", "GIF", "WEBP", "SVG", "HEIC"].contains(ext)

        // For images, load as image data
        if isImage {
            guard let data = try? Data(contentsOf: url) else { return nil }
            // Convert HEIC to PNG if needed
            if ext == "HEIC" || ext == "HEIF" {
                if let nsImage = NSImage(data: data),
                   let tiff = nsImage.tiffRepresentation,
                   let rep = NSBitmapImageRep(data: tiff),
                   let pngData = rep.representation(using: .png, properties: [:]) {
                    return MessageAttachment(
                        name: fileName,
                        fileType: "PNG",
                        state: .done,
                        imageData: pngData
                    )
                }
            }
            return MessageAttachment(
                name: fileName,
                fileType: ext,
                state: .done,
                imageData: data
            )
        }

        // For text-like files, read content to send to the LLM
        if ["TXT", "MD", "JSON", "TS", "TSX", "JS", "JSX", "SWIFT", "PY", "CSV"].contains(fileType) {
            guard let data = try? Data(contentsOf: url),
                  let content = String(data: data, encoding: .utf8) else { return nil }
            return MessageAttachment(
                name: fileName,
                fileType: fileType,
                fileSize: formatFileSize(url),
                state: .done,
                textContent: content
            )
        }

        // For other file types (PDF, ZIP, etc.), just show the card
        return MessageAttachment(
            name: fileName,
            fileType: fileType,
            fileSize: formatFileSize(url),
            state: .done
        )
    }

    private func formatFileSize(_ url: URL) -> String? {
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attrs[.size] as? Int else { return nil }
        if size < 1024 { return "\(size) B" }
        if size < 1024 * 1024 { return String(format: "%.1f KB", Double(size) / 1024) }
        return String(format: "%.1f MB", Double(size) / (1024 * 1024))
    }

    private func removeAttachment(_ id: UUID) {
        pendingAttachments.removeAll { $0.id == id }
    }
}
