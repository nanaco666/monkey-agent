import Foundation
import SwiftUI

// MARK: - Types

enum MessageRole: String, Codable {
    case user, assistant, tool, system
}

struct ChatMessage: Identifiable {
    let id = UUID()
    let role: MessageRole
    var content: String
    var toolName: String?
    var timestamp: Date?
    var isStreaming: Bool = false
}

struct UsageInfo {
    var inputTokens: Int = 0
    var outputTokens: Int = 0
    var cacheReadTokens: Int = 0
    var requests: Int = 0

    var summary: String {
        let fmtK = { (n: Int) -> String in n >= 1000 ? String(format: "%.1fK", Double(n)/1000) : String(n) }
        return "\(requests) req · \(fmtK(inputTokens + outputTokens)) tok"
    }
}

// MARK: - ChatState

@MainActor
class ChatState: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var isStreaming = false
    @Published var wildMode = false
    @Published var usage = UsageInfo()
    @Published var displayModel = "…"
    @Published var assistantName = "Monkey"
    @Published var isConnected = false

    private var monkeyProcess: Process?
    private var inputHandle: FileHandle?
    private var buffer = ""
    private var nextRequestId = 1
    // Track which request IDs are chat requests (to know when streaming ends)
    private var activeChatRequestIds: Set<Int> = []

    // MARK: - Lifecycle

    func startMonkeyProcess() {
        guard monkeyProcess == nil else { return }

        let process = Process()
        let outputPipe = Pipe()
        let errorPipe = Pipe()
        let inputPipe = Pipe()

        let cliPath = findMonkeyCli()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["node", cliPath, "app"]
        process.currentDirectoryURL = URL(fileURLWithPath: NSHomeDirectory())
        process.standardOutput = outputPipe
        process.standardError = errorPipe
        process.standardInput = inputPipe

        // Read JSON-RPC from stdout
        outputPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let output = String(data: data, encoding: .utf8) else { return }
            Task { @MainActor in
                self?.handleOutput(output)
            }
        }

        // Debug stderr
        errorPipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            if !data.isEmpty, let str = String(data: data, encoding: .utf8), !str.isEmpty {
                fputs(str, stderr)
            }
        }

        process.terminationHandler = { [weak self] _ in
            Task { @MainActor in
                self?.isConnected = false
                self?.monkeyProcess = nil
                self?.inputHandle = nil
            }
        }

        do {
            try process.run()
            self.monkeyProcess = process
            self.inputHandle = inputPipe.fileHandleForWriting

            // Initialize
            let initId = sendRequest("initialize", params: [:])
            // We'll handle the response in handleOutput
            self.pendingInitId = initId
        } catch {
            messages.append(ChatMessage(role: .system, content: "Error starting Monkey: \(error.localizedDescription)", timestamp: Date()))
        }
    }

    func stopMonkeyProcess() {
        sendNotification("shutdown", params: [:])
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.monkeyProcess?.terminate()
            self?.monkeyProcess = nil
            self?.inputHandle = nil
            self?.isConnected = false
        }
    }

    // MARK: - Public API

    func sendMessage(_ text: String) async {
        guard isConnected else {
            messages.append(ChatMessage(role: .system, content: "Monkey is not connected. Please wait…", timestamp: Date()))
            return
        }
        guard !isStreaming else { return }

        messages.append(ChatMessage(role: .user, content: text, timestamp: Date()))
        isStreaming = true

        let chatId = sendRequest("chat", params: ["prompt": text])
        activeChatRequestIds.insert(chatId)
    }

    func handleSlashCommand(_ input: String) {
        let cmd = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        switch cmd {
        case "/clear":
            if isConnected { sendRequest("slash", params: ["cmd": "/clear"]) }
            messages.removeAll()
        case "/wild":
            wildMode = true
            if isConnected { sendNotification("set_wild", params: ["wild": true]) }
            messages.append(ChatMessage(role: .system, content: "Wild mode — all commands allowed 🐒", timestamp: Date()))
        case "/tame":
            wildMode = false
            if isConnected { sendNotification("set_wild", params: ["wild": false]) }
            messages.append(ChatMessage(role: .system, content: "Tame mode — dangerous commands blocked", timestamp: Date()))
        case "/model":
            messages.append(ChatMessage(role: .system, content: "Current model: \(displayModel)", timestamp: Date()))
        case "/usage":
            messages.append(ChatMessage(role: .system, content: usage.summary, timestamp: Date()))
        default:
            if isConnected {
                Task { await sendMessage(input) }
            }
        }
    }

    func switchModel(_ model: String) {
        displayModel = model
        if isConnected { sendNotification("set_model", params: ["model": model]) }
    }

    func clearConversation() {
        messages.removeAll()
        if isConnected { sendRequest("clear", params: [:]) }
    }

    func abortResponse() {
        if isConnected { sendNotification("abort", params: [:]) }
        isStreaming = false
        activeChatRequestIds.removeAll()
        for i in messages.indices {
            if messages[i].isStreaming { messages[i].isStreaming = false }
        }
    }

    func compactContext() async {
        messages.append(ChatMessage(role: .system, content: "Context compaction happens automatically", timestamp: Date()))
    }

    func cleanStale() async {
        messages.append(ChatMessage(role: .system, content: "Stale data cleaned on startup", timestamp: Date()))
    }

    // MARK: - JSON-RPC

    private var pendingInitId: Int? = nil

    private func sendRequest(_ method: String, params: [String: Any]) -> Int {
        let id = nextRequestId
        nextRequestId += 1

        var request: [String: Any] = [
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
        ]
        if !params.isEmpty {
            request["params"] = params
        }

        if let data = try? JSONSerialization.data(withJSONObject: request),
           let str = String(data: data, encoding: .utf8) {
            writeLine(str)
        }
        return id
    }

    private func sendNotification(_ method: String, params: [String: Any]) {
        var notification: [String: Any] = [
            "jsonrpc": "2.0",
            "method": method,
        ]
        if !params.isEmpty {
            notification["params"] = params
        }

        if let data = try? JSONSerialization.data(withJSONObject: notification),
           let str = String(data: data, encoding: .utf8) {
            writeLine(str)
        }
    }

    private func writeLine(_ line: String) {
        guard let handle = inputHandle else { return }
        let data = (line + "\n").data(using: .utf8) ?? Data()
        handle.write(data)
    }

    // MARK: - Output Parsing

    private func handleOutput(_ output: String) {
        buffer += output

        while let newlineIdx = buffer.firstIndex(of: "\n") {
            let line = String(buffer[..<newlineIdx]).trimmingCharacters(in: .whitespacesAndNewlines)
            buffer = String(buffer[buffer.index(after: newlineIdx)...])
            if line.isEmpty { continue }

            guard let data = line.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }

            if let id = json["id"] as? Int {
                handleResponse(id: id, json: json)
            } else if let method = json["method"] as? String {
                let params = json["params"] as? [String: Any] ?? [:]
                handleStreamNotification(method: method, params: params)
            }
        }
    }

    private func handleResponse(id: Int, json: [String: Any]) {
        // Check for error
        if let error = json["error"] as? [String: Any] {
            let msg = error["message"] as? String ?? "Unknown error"
            messages.append(ChatMessage(role: .system, content: "Error: \(msg)", timestamp: Date()))
            if activeChatRequestIds.contains(id) {
                isStreaming = false
                activeChatRequestIds.remove(id)
                finalizeStreamingMessages()
            }
            return
        }

        // Initialize response
        if id == pendingInitId {
            pendingInitId = nil
            if let result = json["result"] as? [String: Any] {
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

        // Slash command response with system message
        if let result = json["result"] as? [String: Any],
           let type = result["type"] as? String, type == "system",
           let message = result["message"] as? String {
            messages.append(ChatMessage(role: .system, content: message, timestamp: Date()))
        }
    }

    private func finalizeStreamingMessages() {
        for i in messages.indices {
            if messages[i].isStreaming { messages[i].isStreaming = false }
        }
    }

    private func handleStreamNotification(method: String, params: [String: Any]) {
        switch method {
        case "stream/text":
            let text = params["text"] as? String ?? ""
            appendOrExtendAssistant(text)

        case "stream/tool_start":
            let name = params["name"] as? String ?? "tool"
            let summary = params["summary"] as? String ?? ""
            let content = summary.isEmpty ? name : "\(name)  \(summary)"
            messages.append(ChatMessage(role: .tool, content: content, toolName: name, timestamp: Date()))

        case "stream/tool_result":
            let name = params["name"] as? String
            let result = params["result"] as? String ?? ""
            let display = result.count > 300 ? String(result.prefix(300)) + "…" : result
            messages.append(ChatMessage(role: .tool, content: display, toolName: name, timestamp: Date()))

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
            messages.append(ChatMessage(role: .system, content: msg, timestamp: Date()))

        default:
            break
        }
    }

    private func appendOrExtendAssistant(_ text: String) {
        if let lastIdx = messages.lastIndex(where: { $0.role == .assistant && $0.isStreaming }) {
            messages[lastIdx].content += text
        } else {
            messages.append(ChatMessage(role: .assistant, content: text, timestamp: Date(), isStreaming: true))
        }
    }

    // MARK: - Path Resolution

    private func findMonkeyCli() -> String {
        let localBuild = NSHomeDirectory() + "/monkey-cli/dist/index.js"
        if FileManager.default.fileExists(atPath: localBuild) {
            return localBuild
        }
        for path in ["/opt/homebrew/bin/monkey", "/usr/local/bin/monkey"] {
            if FileManager.default.fileExists(atPath: path) { return path }
        }
        return "/opt/homebrew/bin/monkey"
    }

    deinit {
        monkeyProcess?.terminate()
    }
}
