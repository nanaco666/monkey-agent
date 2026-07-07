import Foundation

/// JSON-RPC transport over a Unix domain socket using POSIX + DispatchSource.
final class UnixSocketTransport: @unchecked Sendable {
    var onReceive: ((JSONRPCMessage) -> Void)?
    var onConnect: (() -> Void)?
    var onDisconnect: (() -> Void)?

    private var fd: Int32 = -1
    private var readSource: DispatchSourceRead?
    private var reconnectTimer: Timer?
    private var buffer = ""

    static var socketPath: String {
        "\(NSHomeDirectory())/.monkey-cli/monkey.sock"
    }

    // MARK: - Public

    func connect() {
        guard fd < 0 else { return }
        tryConnect()
    }

    func disconnect() {
        reconnectTimer?.invalidate()
        reconnectTimer = nil
        closeSocket()
    }

    func send(request: JSONRPCRequest) {
        var dict: [String: Any] = ["jsonrpc": "2.0", "id": request.id, "method": request.method]
        if let params = request.params { dict["params"] = params }
        writeJSON(dict)
    }

    func send(notification: JSONRPCNotification) {
        var dict: [String: Any] = ["jsonrpc": "2.0", "method": notification.method]
        if let params = notification.params { dict["params"] = params }
        writeJSON(dict)
    }

    // MARK: - Private

    private func tryConnect() {
        let sockfd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard sockfd >= 0 else { scheduleReconnect(); return }

        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        let path = Self.socketPath
        let len = min(path.utf8.count, MemoryLayout.size(ofValue: addr.sun_path) - 1)
        withUnsafeMutableBytes(of: &addr.sun_path) { buf in
            path.withCString { cStr in
                buf.baseAddress?.copyMemory(from: cStr, byteCount: len + 1)
            }
        }
        addr.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)

        let result = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Foundation.connect(sockfd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }

        guard result == 0 else {
            Foundation.close(sockfd)
            scheduleReconnect()
            return
        }

        fd = sockfd
        reconnectTimer?.invalidate()
        reconnectTimer = nil

        // Use DispatchSource for reliable async reads on sockets
        let source = DispatchSource.makeReadSource(fileDescriptor: sockfd, queue: .main)
        source.setEventHandler { [weak self] in
            guard let self, self.fd == sockfd else { return }
            var buf = [UInt8](repeating: 0, count: 8192)
            let n = read(sockfd, &buf, buf.count)
            if n <= 0 {
                self.handleEOF()
                return
            }
            if let str = String(bytes: buf[..<n], encoding: .utf8) {
                self.processOutput(str)
            }
        }
        source.setCancelHandler { [weak self] in
            Foundation.close(sockfd)
            self?.scheduleReconnect()
        }
        source.resume()
        readSource = source

        onConnect?()
    }

    private func handleEOF() {
        closeSocket()
        onDisconnect?()
        scheduleReconnect()
    }

    private func closeSocket() {
        readSource?.cancel()
        readSource = nil
        fd = -1
    }

    private func scheduleReconnect() {
        guard reconnectTimer == nil else { return }
        reconnectTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { [weak self] _ in
            guard let self, self.fd < 0 else { return }
            self.tryConnect()
        }
    }

    private func writeJSON(_ object: [String: Any]) {
        guard fd >= 0,
              let data = try? JSONSerialization.data(withJSONObject: object),
              let str = String(data: data, encoding: .utf8) else { return }
        let payload = (str + "\n")
        payload.withCString { cStr in
            _ = write(fd, cStr, strlen(cStr))
        }
    }

    private func processOutput(_ output: String) {
        buffer += output
        while let idx = buffer.firstIndex(of: "\n") {
            let line = String(buffer[..<idx]).trimmingCharacters(in: .whitespaces)
            buffer = String(buffer[buffer.index(after: idx)...])
            guard !line.isEmpty,
                  let data = line.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { continue }
            onReceive?(parseMessage(json))
        }
    }

    private func parseMessage(_ json: [String: Any]) -> JSONRPCMessage {
        if let id = json["id"] as? Int {
            if let err = json["error"] as? [String: Any] {
                return .error(id: id, message: err["message"] as? String ?? "Unknown error")
            }
            return .response(id: id, result: json["result"] as? [String: Any])
        }
        let method = json["method"] as? String ?? ""
        let params = json["params"] as? [String: Any] ?? [:]
        return .notification(method: method, params: params)
    }
}
