import Foundation
import Security

enum MonkeyFailure: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let value) = self { return value }; return nil }
}
enum Shared {
    static let defaults = UserDefaults(suiteName: "group.com.monkey.keyboard")!
    static var keychainGroup: String? { Bundle.main.object(forInfoDictionaryKey: "MonkeyKeychainGroup") as? String }
    static var query: [String: Any] {
        var query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "monkey.keyboard", kSecAttrAccount as String: "connection"]
        if let group = keychainGroup, !group.isEmpty { query[kSecAttrAccessGroup as String] = group }
        return query
    }
    static func token() -> String {
        var q = query; q[kSecReturnData as String] = true
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return "" }
        return String(data: data, encoding: .utf8) ?? ""
    }
    static func save(address: String, token: String) throws {
        let attributes: [String: Any] = [kSecValueData as String: Data(token.utf8), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil) }
        guard status == errSecSuccess else { throw MonkeyFailure.message("安全存储失败（\(status)），请检查签名与 Keychain Sharing 配置。") }
        defaults.set(address, forKey: "address")
    }
    static func clearContext() {
        for key in ["context", "contextDate", "instruction", "reference"] { defaults.removeObject(forKey: key) }
    }
    static func forget() { SecItemDelete(query as CFDictionary); defaults.removeObject(forKey: "address"); clearContext() }
    static func prepare(context: String, platform: String, scenario: String, instruction: String, reference: String) {
        defaults.set(context, forKey: "context"); defaults.set(Date().timeIntervalSince1970, forKey: "contextDate")
        defaults.set(platform, forKey: "platform"); defaults.set(scenario, forKey: "scenario")
        defaults.set(instruction, forKey: "instruction"); defaults.set(reference, forKey: "reference")
    }
}
struct KeyboardProfile: Codable {
    var background = "", voice = "", examples = "", notes = "", repository = ""
    var platforms: [String: String] = ["twitter": "", "discord": "", "xiaohongshu": ""]
}
struct Evidence: Codable, Identifiable {
    var kind: String, number: Int, title: String, url: String, state: String, merged: Bool, checkedAt: String
    var id: String { url }
}
struct ReplyResult: Codable { var candidates: [String]; var evidence: [Evidence]; var notice: String; var createdAt: String }
struct ProfileResult: Codable { var profile: KeyboardProfile }
struct MonkeyAPI {
    var address: String
    var token: String
    init(address: String? = nil, token: String? = nil) {
        self.address = address ?? Shared.defaults.string(forKey: "address") ?? ""
        self.token = token ?? Shared.token()
    }
    static func endpoint(_ raw: String) throws -> URL {
        guard var c = URLComponents(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)), let scheme = c.scheme?.lowercased(), ["http", "https", "ws", "wss"].contains(scheme), let host = c.host, c.user == nil, c.password == nil, c.query == nil, c.fragment == nil else { throw MonkeyFailure.message("请填写不带密钥的 HTTP(S) 主机地址。") }
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        let octets = parts.compactMap { Int($0) }
        let ipv4 = parts.count == 4 && octets.count == 4 && octets.allSatisfy { (0...255).contains($0) }
        let lan = ipv4 && (octets[0] == 10 || octets[0] == 192 && octets[1] == 168 || octets[0] == 172 && (16...31).contains(octets[1]))
        let local = host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "[::1]" || lan
        if ["http", "ws"].contains(scheme) && !local { throw MonkeyFailure.message("远程主机请使用 HTTPS，HTTP 仅用于本机或可信局域网调试。") }
        c.scheme = ["https", "wss"].contains(scheme) ? "wss" : "ws"
        var path = c.path
        if path.hasSuffix("/") { path.removeLast() }
        if !path.hasSuffix("/rpc") { path += "/rpc" }; c.path = path
        guard let url = c.url else { throw MonkeyFailure.message("服务地址无效。") }; return url
    }
    func request<T: Decodable>(_ method: String, params: [String: Any] = [:]) async throws -> T {
        guard token.count >= 32 else { throw MonkeyFailure.message("先在 Monkey Keyboard App 中配置主机地址与连接密钥。") }
        let task = URLSession.shared.webSocketTask(with: try Self.endpoint(address))
        let timeout = DispatchWorkItem { task.cancel(with: .goingAway, reason: nil) }
        DispatchQueue.global().asyncAfter(deadline: .now() + 85, execute: timeout)
        task.resume()
        defer { timeout.cancel(); task.cancel(with: .normalClosure, reason: nil) }
        return try await withTaskCancellationHandler {
            try await send(task, id: 1, method: "authenticate", params: ["token": token])
            _ = try await receive(task, id: 1)
            try Task.checkCancellation()
            try await send(task, id: 2, method: method, params: params)
            let result = try await receive(task, id: 2)
            return try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: result))
        } onCancel: { task.cancel(with: .goingAway, reason: nil) }
    }
    private func send(_ task: URLSessionWebSocketTask, id: Int, method: String, params: [String: Any]) async throws {
        let data = try JSONSerialization.data(withJSONObject: ["jsonrpc": "2.0", "id": id, "method": method, "params": params])
        try await task.send(.string(String(decoding: data, as: UTF8.self)))
    }
    private func receive(_ task: URLSessionWebSocketTask, id: Int) async throws -> [String: Any] {
        while true {
            let message = try await task.receive()
            let data: Data
            switch message { case .data(let d): data = d; case .string(let s): data = Data(s.utf8); @unknown default: continue }
            guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any], value["id"] as? Int == id else { continue }
            if let error = value["error"] as? [String: Any] { throw MonkeyFailure.message(error["message"] as? String ?? "主机请求失败") }
            guard let result = value["result"] as? [String: Any] else { throw MonkeyFailure.message("主机返回格式不正确") }; return result
        }
    }
}
