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
    var isConnected = false

    // MARK: - Dependencies
    private let transport: StdioTransport
    private let processManager: MonkeyProcess
    private var nextRequestId = 1
    private var activeChatRequestIds: Set<Int> = []
    private var pendingInitId: Int? = nil

    // MARK: - Init

    init(transport: StdioTransport = StdioTransport(), processManager: MonkeyProcess = MonkeyProcess()) {
        self.transport = transport
        self.processManager = processManager

        self.transport.onReceive = { [weak self] message in
            Task { @MainActor in
                self?.handleMessage(message)
            }
        }
    }

    // MARK: - Lifecycle

    func start() {
        let cliPath = MonkeyProcess.findCliPath()
        guard let handles = processManager.start(cliPath: cliPath) else {
            appendSystemMessage("Error: Could not start Monkey process")
            return
        }
        transport.setInputHandle(handles.writeHandle)
        transport.setOutputSource(handles.readHandle)

        let initId = sendRequest("initialize", params: [:])
        pendingInitId = initId
    }

    func stop() {
        sendNotification("shutdown", params: [:])
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.processManager.terminate()
            self?.isConnected = false
        }
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
                isConnected = true
            }
            return
        }

        // Chat response (done)
        if activeChatRequestIds.contains(id) {
            activeChatRequestIds.remove(id)
            isStreaming = false
            finalizeStreamingMessages()
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
