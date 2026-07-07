import Foundation

// MARK: - JSON-RPC Types

struct JSONRPCRequest {
    let id: Int
    let method: String
    let params: [String: Any]?

    init(id: Int, method: String, params: [String: Any]? = nil) {
        self.id = id
        self.method = method
        self.params = params
    }
}

struct JSONRPCNotification {
    let method: String
    let params: [String: Any]?

    init(method: String, params: [String: Any]? = nil) {
        self.method = method
        self.params = params
    }
}

enum JSONRPCMessage: @unchecked Sendable {
    case response(id: Int, result: [String: Any]?)
    case error(id: Int, message: String)
    case notification(method: String, params: [String: Any])
}

// MARK: - Stdio Transport

/// Manages JSON-RPC over stdin/stdout with a child process
final class StdioTransport: @unchecked Sendable {
    var onReceive: ((JSONRPCMessage) -> Void)?

    private var inputHandle: FileHandle?
    private var buffer = ""

    func setInputHandle(_ handle: FileHandle) {
        self.inputHandle = handle
    }

    func setOutputSource(_ handle: FileHandle) {
        handle.readabilityHandler = { [weak self] fh in
            let data = fh.availableData
            guard !data.isEmpty, let output = String(data: data, encoding: .utf8) else { return }
            self?.processOutput(output)
        }
    }

    func send(request: JSONRPCRequest) {
        var dict: [String: Any] = [
            "jsonrpc": "2.0",
            "id": request.id,
            "method": request.method,
        ]
        if let params = request.params { dict["params"] = params }
        writeJSON(dict)
    }

    func send(notification: JSONRPCNotification) {
        var dict: [String: Any] = [
            "jsonrpc": "2.0",
            "method": notification.method,
        ]
        if let params = notification.params { dict["params"] = params }
        writeJSON(dict)
    }

    // MARK: - Private

    private func writeJSON(_ object: [String: Any]) {
        guard let handle = inputHandle,
              let data = try? JSONSerialization.data(withJSONObject: object),
              let str = String(data: data, encoding: .utf8) else { return }
        let line = (str + "\n").data(using: .utf8) ?? Data()
        handle.write(line)
    }

    private func processOutput(_ output: String) {
        buffer += output

        while let newlineIdx = buffer.firstIndex(of: "\n") {
            let line = String(buffer[..<newlineIdx]).trimmingCharacters(in: .whitespacesAndNewlines)
            buffer = String(buffer[buffer.index(after: newlineIdx)...])
            if line.isEmpty { continue }

            guard let data = line.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }

            let message = parseMessage(json)
            onReceive?(message)
        }
    }

    private func parseMessage(_ json: [String: Any]) -> JSONRPCMessage {
        if let id = json["id"] as? Int {
            if let error = json["error"] as? [String: Any] {
                return .error(id: id, message: error["message"] as? String ?? "Unknown error")
            }
            return .response(id: id, result: json["result"] as? [String: Any])
        }
        let method = json["method"] as? String ?? ""
        let params = json["params"] as? [String: Any] ?? [:]
        return .notification(method: method, params: params)
    }
}
