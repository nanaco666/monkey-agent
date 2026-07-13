import SwiftUI

/// Single source of truth for chat state.
/// Uses Swift's modern Observation framework (macOS 14+).
@Observable
@MainActor
final class ChatStore: @unchecked Sendable {
    // MARK: - Public State
    var messages: [ChatMessage] = []
    var isStreaming = false
    var wildMode = false
    var usage = UsageInfo()
    var displayModel = "…"
    var assistantName = "Monkey"
    var availableModels: [(alias: String, id: String)] = []
    var isConnected = false
    var sessionStore = SessionStore()

    // MARK: - Dependencies
    private let transport: UnixSocketTransport
    private var nextRequestId = 1
    private var activeChatRequestIds: Set<Int> = []
    private var pendingInitId: Int? = nil
    private var pendingSessionListId: Int? = nil
    private var pendingSessionSwitchId: Int? = nil
    private var pendingSessionNewId: Int? = nil
    private var pendingSessionDeleteId: Int? = nil
    private var saveDebounceTask: Task<Void, Never>?

    // MARK: - Init

    init(transport: UnixSocketTransport = UnixSocketTransport()) {
        self.transport = transport

        transport.onReceive = { [weak self] message in
            Task { @MainActor in self?.handleMessage(message) }
        }
        transport.onConnect = { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                let id = self.sendRequest("initialize", params: [:])
                self.pendingInitId = id
            }
        }
        transport.onDisconnect = { [weak self] in
            Task { @MainActor in
                self?.isConnected = false
                self?.isStreaming = false
            }
        }
    }

    // MARK: - Lifecycle

    func start() {
        launchDaemonIfNeeded()
        transport.connect()
    }

    func stop() {
        saveCurrentSession()
        transport.disconnect()
        isConnected = false
    }

    // MARK: - Session Management

    /// Load the current session's messages into the store
    func loadCurrentSession() {
        guard let session = sessionStore.currentSession else {
            messages = []
            return
        }
        // Messages come from daemon on initialize/session_switch response
        // Just set model/wildMode from session metadata
        displayModel = session.model.isEmpty ? displayModel : session.model
        wildMode = session.wildMode
    }

    /// Request session list from daemon
    func refreshSessions() {
        guard isConnected else { return }
        let id = sendRequest("session_list", params: [:])
        pendingSessionListId = id
    }

    /// Switch to an existing session (via daemon RPC)
    func switchSession(_ id: String) {
        guard isConnected else { return }
        // Save current session first
        sendNotification("session_save", params: [:])
        let reqId = sendRequest("session_switch", params: ["id": id])
        pendingSessionSwitchId = reqId
    }

    /// Start a new chat session (via daemon RPC)
    func newSession() {
        guard isConnected else { return }
        sendNotification("session_save", params: [:])
        let reqId = sendRequest("session_new", params: [:])
        pendingSessionNewId = reqId
    }

    /// Delete a session (via daemon RPC)
    func deleteSession(_ id: String) {
        guard isConnected else { return }
        let reqId = sendRequest("session_delete", params: ["id": id])
        pendingSessionDeleteId = reqId
    }

    /// Debounced save — coalesces rapid updates (e.g. streaming) into one write
    func scheduleSave() {
        saveDebounceTask?.cancel()
        saveDebounceTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            // Tell daemon to save
            if isConnected { sendNotification("session_save", params: [:]) }
        }
    }

    /// Persist current messages — now just tells daemon to save
    func saveCurrentSession() {
        saveDebounceTask?.cancel()
        guard isConnected else { return }
        sendNotification("session_save", params: [:])
    }

    // MARK: - Daemon launcher

    private func launchDaemonIfNeeded() {
        let cliPath = findCliPath()
        guard !cliPath.isEmpty else { return }

        // Spawn `node <cli> daemon` detached — daemon manages its own lifecycle.
        // The daemon itself exits immediately if another instance is already running.
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        task.arguments = ["node", cliPath, "daemon"]
        task.standardOutput = FileHandle.nullDevice
        task.standardError = FileHandle.nullDevice
        task.qualityOfService = .background
        try? task.run()
        // Do not call waitUntilExit — let it run in background
    }

    private func findCliPath() -> String {
        let local = NSHomeDirectory() + "/monkey-cli/dist/index.js"
        if FileManager.default.fileExists(atPath: local) { return local }
        for path in ["/opt/homebrew/bin/monkey", "/usr/local/bin/monkey"] {
            if FileManager.default.fileExists(atPath: path) { return path }
        }
        return ""
    }

    // MARK: - Public Actions

    func sendMessage(_ text: String) async {
        guard isConnected else {
            appendSystemMessage("Monkey is not connected. Please wait…")
            return
        }
        guard !isStreaming else { return }

        messages.append(ChatMessage(role: .user, content: text))
        isStreaming = true
        scheduleSave()

        let chatId = sendRequest("chat", params: ["prompt": text])
        activeChatRequestIds.insert(chatId)
    }

    func handleSlashCommand(_ input: String) {
        let action = CommandService.parse(input)
        switch action {
        case .clear:
            if isConnected { _ = sendRequest("clear", params: [:]) }
            messages.removeAll()
        case .setWild:
            wildMode = true
            if isConnected { sendNotification("set_wild", params: ["wild": true]) }
            appendSystemMessage("Wild mode — all commands allowed 🐒")
        case .setTame:
            wildMode = false
            if isConnected { sendNotification("set_wild", params: ["wild": false]) }
            appendSystemMessage("Tame mode — dangerous commands blocked")
        case .showModel:
            appendSystemMessage("Current model: \(displayModel)")
        case .showUsage:
            appendSystemMessage(usage.summary)
        case .forwardToChat(let text):
            if isConnected {
                Task { await sendMessage(text) }
            }
        }
    }

    func switchModel(_ model: String) {
        displayModel = model
        if isConnected { sendNotification("set_model", params: ["model": model]) }
    }

    func clearConversation() {
        messages.removeAll()
        if isConnected { _ = sendRequest("clear", params: [:]) }
        scheduleSave()
    }

    func abortResponse() {
        if isConnected { sendNotification("abort", params: [:]) }
        isStreaming = false
        activeChatRequestIds.removeAll()
        finalizeStreamingMessages()
    }

    func compactContext() async {
        appendSystemMessage("Context compaction happens automatically")
    }

    func cleanStale() async {
        appendSystemMessage("Stale data cleaned on startup")
    }

    // MARK: - Message Handling

    private func handleMessage(_ message: JSONRPCMessage) {
        switch message {
        case .response(let id, let result):
            handleResponse(id: id, result: result)
        case .error(let id, let msg):
            appendSystemMessage("Error: \(msg)")
            if activeChatRequestIds.contains(id) {
                isStreaming = false
                activeChatRequestIds.remove(id)
                finalizeStreamingMessages()
            }
        case .notification(let method, let params):
            handleStreamNotification(method: method, params: params)
        }
    }

    private func handleResponse(id: Int, result: [String: Any]?) {
        // Initialize response
        if id == pendingInitId {
            pendingInitId = nil
            if let result {
                displayModel = result["model"] as? String ?? "unknown"
                assistantName = result["name"] as? String ?? "Monkey"
                if let models = result["models"] as? [[String: String]] {
                    availableModels = models.compactMap { item in
                        guard let alias = item["alias"], let id = item["id"] else { return nil }
                        return (alias: alias, id: id)
                    }
                }
                if let sessionId = result["sessionId"] as? String {
                    sessionStore.setCurrent(sessionId)
                }
                // Load existing session messages
                if let rawMessages = result["messages"] as? [[String: Any]] {
                    for raw in rawMessages {
                        let role = raw["role"] as? String ?? "user"
                        let content = raw["content"] as? String ?? ""
                        let toolName = raw["toolName"] as? String
                        let toolId = raw["toolId"] as? String
                        if role == "tool" {
                            var msg = ChatMessage(role: .tool, content: content, toolName: toolName, toolId: toolId)
                            msg.isStreaming = false
                            messages.append(msg)
                        } else if role == "user" {
                            messages.append(ChatMessage(role: .user, content: content))
                        } else if role == "assistant" {
                            messages.append(ChatMessage(role: .assistant, content: content))
                        }
                    }
                }
                isConnected = true
                // Fetch session list for sidebar
                refreshSessions()
            }
            return
        }

        // Session list response
        if id == pendingSessionListId {
            pendingSessionListId = nil
            if let result, let rawSessions = result["sessions"] as? [[String: Any]] {
                let metas = rawSessions.map { ChatSessionMeta(from: $0) }
                sessionStore.updateSessions(metas)
            }
            return
        }

        // Session new response
        if id == pendingSessionNewId {
            pendingSessionNewId = nil
            if let result, let sessionId = result["sessionId"] as? String {
                messages.removeAll()
                sessionStore.setCurrent(sessionId)
                if isConnected { _ = sendRequest("clear", params: [:]) }
                refreshSessions()
            }
            return
        }

        // Session switch response
        if id == pendingSessionSwitchId {
            pendingSessionSwitchId = nil
            if let result {
                if let sessionId = result["sessionId"] as? String {
                    sessionStore.setCurrent(sessionId)
                }
                if let model = result["model"] as? String { displayModel = model }
                if let wild = result["wildMode"] as? Bool { wildMode = wild }
                messages.removeAll()
                // Load historical messages from daemon
                if let rawMessages = result["messages"] as? [[String: Any]] {
                    for raw in rawMessages {
                        let role = raw["role"] as? String ?? "user"
                        let content = raw["content"] as? String ?? ""
                        let toolName = raw["toolName"] as? String
                        let toolId = raw["toolId"] as? String
                        if role == "tool" {
                            var msg = ChatMessage(role: .tool, content: content, toolName: toolName, toolId: toolId)
                            msg.isStreaming = false
                            messages.append(msg)
                        } else if role == "user" {
                            messages.append(ChatMessage(role: .user, content: content))
                        } else if role == "assistant" {
                            messages.append(ChatMessage(role: .assistant, content: content))
                        }
                    }
                }
                refreshSessions()
            }
            return
        }

        // Session delete response
        if id == pendingSessionDeleteId {
            pendingSessionDeleteId = nil
            if let result {
                if let sessionId = result["sessionId"] as? String {
                    sessionStore.setCurrent(sessionId)
                }
                if let model = result["model"] as? String { displayModel = model }
                if let wild = result["wildMode"] as? Bool { wildMode = wild }
                messages.removeAll()
                if let rawMessages = result["messages"] as? [[String: Any]] {
                    for raw in rawMessages {
                        let role = raw["role"] as? String ?? "user"
                        let content = raw["content"] as? String ?? ""
                        let toolName = raw["toolName"] as? String
                        let toolId = raw["toolId"] as? String
                        if role == "tool" {
                            var msg = ChatMessage(role: .tool, content: content, toolName: toolName, toolId: toolId)
                            msg.isStreaming = false
                            messages.append(msg)
                        } else if role == "user" {
                            messages.append(ChatMessage(role: .user, content: content))
                        } else if role == "assistant" {
                            messages.append(ChatMessage(role: .assistant, content: content))
                        }
                    }
                }
                refreshSessions()
            }
            return
        }

        // Chat response (done)
        if activeChatRequestIds.contains(id) {
            activeChatRequestIds.remove(id)
            isStreaming = false
            finalizeStreamingMessages()
            // Refresh session list to update sidebar previews
            refreshSessions()
            return
        }

        // Slash command response
        if let result,
           let type = result["type"] as? String, type == "system",
           let message = result["message"] as? String {
            appendSystemMessage(message)
        }
    }

    private func handleStreamNotification(method: String, params: [String: Any]) {
        switch method {
        case "stream/text":
            let text = params["text"] as? String ?? ""
            appendOrExtendAssistant(text)

        case "stream/tool_start":
            let id = params["id"] as? String
            let name = params["name"] as? String ?? "tool"
            let summary = params["summary"] as? String ?? ""
            let content = summary.isEmpty ? name : summary
            var msg = ChatMessage(role: .tool, content: content, toolName: name, toolSummary: summary.isEmpty ? nil : summary)
            msg.toolId = id
            msg.isStreaming = true
            messages.append(msg)

        case "stream/tool_result":
            let id = params["id"] as? String
            let name = params["name"] as? String
            let result = params["result"] as? String ?? ""
            let display = result.count > 300 ? String(result.prefix(300)) + "…" : result

            // Update the existing tool_start message in-place
            if let id, let idx = messages.lastIndex(where: { $0.role == .tool && $0.toolId == id }) {
                messages[idx].content = display
                messages[idx].isStreaming = false
                if name != nil { messages[idx].toolName = name }
            } else {
                var msg = ChatMessage(role: .tool, content: display, toolName: name)
                msg.toolId = id
                messages.append(msg)
            }
            scheduleSave()

        case "stream/usage":
            if let input = params["inputTokens"] as? Int { usage.inputTokens = input }
            if let output = params["outputTokens"] as? Int { usage.outputTokens = output }
            if let cache = params["cacheReadTokens"] as? Int { usage.cacheReadTokens = cache }
            if let reqs = params["requests"] as? Int { usage.requests = reqs }

        case "stream/compacted":
            let removed = params["removed"] as? Int ?? 0
            let learned = params["knowledgeSaved"] as? Int ?? 0
            var msg = "Context compacted (−\(removed) messages)"
            if learned > 0 { msg += ", learned \(learned) new things" }
            appendSystemMessage(msg)

        default:
            break
        }
    }

    // MARK: - Helpers

    private func appendOrExtendAssistant(_ text: String) {
        // Only extend if the LAST message is a streaming assistant — never reach
        // back past tool/system messages, so text after a tool call starts fresh.
        if let last = messages.last, last.role == .assistant, last.isStreaming {
            messages[messages.count - 1].content += text
        } else {
            // Finalize any previous streaming messages so the cursor only shows
            // on the newest one.
            finalizeStreamingMessages()
            messages.append(ChatMessage(role: .assistant, content: text, isStreaming: true))
        }
    }

    private func appendSystemMessage(_ text: String) {
        messages.append(ChatMessage(role: .system, content: text))
    }

    private func finalizeStreamingMessages() {
        for i in messages.indices {
            if messages[i].isStreaming { messages[i].isStreaming = false }
        }
        scheduleSave()
    }

    // MARK: - JSON-RPC Transport

    private func sendRequest(_ method: String, params: [String: Any]) -> Int {
        let id = nextRequestId
        nextRequestId += 1
        transport.send(request: JSONRPCRequest(id: id, method: method, params: params.isEmpty ? nil : params))
        return id
    }

    private func sendNotification(_ method: String, params: [String: Any]) {
        transport.send(notification: JSONRPCNotification(method: method, params: params.isEmpty ? nil : params))
    }
}
