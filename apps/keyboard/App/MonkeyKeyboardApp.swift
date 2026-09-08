import SwiftUI

@main struct MonkeyKeyboardApp: App {
    var body: some Scene { WindowGroup { KeyboardHome() } }
}
struct KeyboardHome: View {
    @State private var address = Shared.defaults.string(forKey: "address") ?? "http://127.0.0.1:8787"
    @State private var token = Shared.token()
    @State private var profile = KeyboardProfile()
    @State private var connected = false
    @State private var busy = false
    @State private var message = "先连接你的 Monkey 主机"
    @State private var context = Shared.defaults.string(forKey: "context") ?? ""
    @State private var platform = Shared.defaults.string(forKey: "platform") ?? "twitter"
    @State private var scenario = Shared.defaults.string(forKey: "scenario") ?? "reaction"
    @State private var instruction = Shared.defaults.string(forKey: "instruction") ?? ""
    @State private var reference = Shared.defaults.string(forKey: "reference") ?? ""
    @State private var result: ReplyResult?
    @State private var generationRevision = 0
    @State private var playground = ""
    @State private var showForget = false
    private let platforms = [("twitter", "Twitter / X"), ("discord", "Discord"), ("xiaohongshu", "小红书")]
    var body: some View {
        NavigationStack {
            TabView {
                Form {
                    Section {
                        Text("把想说的话，带到正在回复的地方。").font(.title2.bold())
                        Text("复制原文，在键盘里点击读取，再挑选回复。只会填入输入框，由你发送。").foregroundStyle(.secondary)
                    }
                    Section("主机连接") {
                        TextField("服务地址", text: $address).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("hostAddress")
                        SecureField("连接密钥（不是模型 API Key）", text: $token).textContentType(.oneTimeCode).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("connectionToken")
                        Button("连接并保存") { run {
                            let api = MonkeyAPI(address: address, token: token)
                            let loaded: ProfileResult = try await api.request("keyboard_profile_get")
                            try Shared.save(address: address, token: token)
                            profile = loaded.profile; connected = true; message = "已连接，键盘与 Monkey 共用模型和偏好"
                        } }.disabled(busy)
                        Button("断开并忘记", role: .destructive) { showForget = true }
                    }
                    Section("启用系统键盘") {
                        Text("设置 → 通用 → 键盘 → 键盘 → 添加新键盘 → Monkey；再开启「允许完全访问」以连接主机。")
                        Text("键盘不会自动读取整页或后台收集输入。只有你主动传入的原文和本次指令会发送给自己的主机及模型服务商。")
                            .font(.footnote).foregroundStyle(.secondary)
                        Button("打开设置") { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } }
                        Text("密码框及部分 App 禁用第三方键盘。真机需要签名安装；Expo Go 不能安装这个扩展。").font(.footnote).foregroundStyle(.secondary)
                    }
                    Section("键盘试用输入框") {
                        Text("点下面输入框，长按系统键盘地球按钮选择 Monkey。这里会接收候选；不会发送任何消息。").font(.footnote)
                        TextEditor(text: $playground).frame(minHeight: 100).accessibilityLabel("键盘试用输入框")
                    }
                    status
                }.tabItem { Label("连接", systemImage: "keyboard") }
                Form {
                    Section("回复工作台") {
                        Picker("平台", selection: $platform) { ForEach(platforms, id: \.0) { Text($0.1).tag($0.0) } }
                        Picker("场景", selection: $scenario) { Text("轻互动").tag("reaction"); Text("认真回复").tag("reply"); Text("查进度").tag("support") }
                        Text("原文 / 对话上下文").font(.caption)
                        TextEditor(text: $context).frame(minHeight: 120).accessibilityLabel("回复原文")
                        TextField("本次指令（可选）", text: $instruction, axis: .vertical)
                        TextField("Issue/PR 链接或 #编号", text: $reference).textInputAutocapitalization(.never).autocorrectionDisabled()
                        Button("准备到键盘") {
                            result = nil
                            Shared.prepare(context: context, platform: platform, scenario: scenario, instruction: instruction, reference: reference)
                            message = "上下文已准备。切到目标输入框，选择 Monkey 键盘后生成。"
                        }.disabled(context.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || context.count > 16000)
                        Button(result == nil ? "生成两条候选" : "重新生成") { run {
                            result = nil
                            let revision = generationRevision
                            let generated: ReplyResult = try await MonkeyAPI().request("keyboard_generate", params: ["platform": platform, "scenario": scenario, "context": context, "instruction": instruction, "reference": reference])
                            guard revision == generationRevision else { message = "原文或选项已改变，请重新生成。"; return }
                            result = generated
                            message = result?.notice ?? ""
                        } }.disabled(busy || !connected || context.isEmpty)
                    }
                    if let result { Section("候选 · 点选复制") {
                        ForEach(Array(result.candidates.enumerated()), id: \.offset) { item in
                            Button { UIPasteboard.general.string = item.element; message = "已复制候选" } label: { Text("\(item.offset + 1). \(item.element)").foregroundStyle(.primary) }
                        }
                        ForEach(result.evidence) { item in Link("来源：\(item.title)", destination: URL(string: item.url)!) }
                    } }
                    status
                }.tabItem { Label("工作台", systemImage: "text.bubble") }
                Form {
                    Section("关于你和项目") {
                        TextField("项目背景", text: $profile.background, axis: .vertical)
                        TextField("习惯语气", text: $profile.voice, axis: .vertical)
                        TextField("GitHub 仓库 owner/repo", text: $profile.repository).textInputAutocapitalization(.never).autocorrectionDisabled()
                        TextField("以前的回复示例", text: $profile.examples, axis: .vertical)
                        TextField("偏好记忆", text: $profile.notes, axis: .vertical)
                        Text("也可以在 Monkey 对话中说：记住键盘偏好：回复简洁，不用表情。").font(.footnote).foregroundStyle(.secondary)
                    }
                    Section("平台规则") {
                        ForEach(platforms, id: \.0) { item in
                            TextField(item.1, text: Binding(get: { profile.platforms[item.0] ?? "" }, set: { profile.platforms[item.0] = $0 }), axis: .vertical)
                        }
                    }
                    Section {
                        Button("保存偏好到 Monkey") { run {
                            let value = try JSONSerialization.jsonObject(with: JSONEncoder().encode(profile))
                            let saved: ProfileResult = try await MonkeyAPI().request("keyboard_profile_save", params: ["profile": value])
                            profile = saved.profile; message = "偏好已保存，下一次生成立即使用"
                        } }.disabled(busy || !connected)
                        Button("重新读取偏好") { run {
                            let loaded: ProfileResult = try await MonkeyAPI().request("keyboard_profile_get")
                            profile = loaded.profile; message = "已读取最新偏好"
                        } }.disabled(busy || !connected)
                    }
                    status
                }.tabItem { Label("偏好", systemImage: "slider.horizontal.3") }
            }
            .navigationTitle("Monkey Keyboard").navigationBarTitleDisplayMode(.inline)
            .tint(Color(red: 0.89, green: 0.40, blue: 0.18))
            .onChange(of: [context, platform, scenario, instruction, reference]) { _, _ in
                generationRevision += 1; result = nil
            }
            .onChange(of: [address, token]) { _, _ in connected = false }
            .confirmationDialog("忘记这台主机的连接和准备的上下文？", isPresented: $showForget) {
                Button("断开并忘记", role: .destructive) { Shared.forget(); token = ""; connected = false; result = nil; context = ""; instruction = ""; reference = ""; message = "已断开并清除本机连接" }
            }
        }
    }
    private var status: some View { Section { if busy { ProgressView("Monkey 正在处理…") }; Text(message).font(.footnote).accessibilityLabel("状态：\(message)") } }
    private func run(_ action: @escaping @MainActor () async throws -> Void) {
        busy = true
        Task { @MainActor in
            defer { busy = false }
            do { try await action() } catch { message = error.localizedDescription }
        }
    }
}
