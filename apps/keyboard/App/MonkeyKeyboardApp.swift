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
    @State private var threadRoot = Shared.defaults.string(forKey: "threadRoot") ?? ""
    @State private var threadTarget = Shared.defaults.string(forKey: "threadTarget") ?? ""
    @State private var threadTargetKind = Shared.defaults.string(forKey: "threadTargetKind") ?? "main"
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
                        Text("把主帖和正在回复的楼层带到输入框。").font(.title2.bold())
                        Text("默认按楼层上下文生成；已经写好的内容另有“优化当前输入”入口。只会填入输入框，由你发送。").foregroundStyle(.secondary)
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
                        Picker("回复对象", selection: $threadTargetKind) {
                            Text("主帖（原创首条评论）").tag("main")
                            Text("楼层回复（继续回复 A）").tag("reply")
                        }
                        Text("主帖内容").font(.caption)
                        TextEditor(text: $threadRoot).frame(minHeight: 100).accessibilityLabel("主帖内容")
                        Text("正在回复的楼层（可选）").font(.caption)
                        TextEditor(text: $threadTarget).frame(minHeight: 90).accessibilityLabel("正在回复的楼层")
                        TextField("本次指令（可选）", text: $instruction, axis: .vertical)
                        TextField("Issue/PR 链接或 #编号", text: $reference).textInputAutocapitalization(.never).autocorrectionDisabled()
                        Button("准备到键盘") { run {
                            result = nil
                            let root = threadRoot.trimmingCharacters(in: .whitespacesAndNewlines)
                            let target = threadTarget.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !root.isEmpty, root.count + target.count <= 16000 else { throw MonkeyFailure.message("请填写主帖，且主帖加楼层不超过 16000 字符。") }
                            guard threadTargetKind != "reply" || !target.isEmpty else { throw MonkeyFailure.message("选择楼层回复时，请填写正在回复的 A 楼层。") }
                            try Shared.prepareThread(root: root, target: target, targetKind: threadTargetKind, platform: platform, scenario: scenario, instruction: instruction, reference: reference)
                            context = ["主帖：\n\(root)", threadTargetKind == "reply" ? "正在回复的楼层：\n\(target)" : ""].filter { !$0.isEmpty }.joined(separator: "\n\n")
                            message = threadTargetKind == "reply" ? "楼层上下文已准备。键盘默认会基于主帖和 A 楼层生成。" : "主帖上下文已准备。键盘默认会生成你的首条评论。"
                        } }.disabled(threadRoot.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || threadRoot.count + threadTarget.count > 16000)
                        Button(result == nil ? "生成两条候选" : "重新生成") { run {
                            result = nil
                            let revision = generationRevision
                            let generated: ReplyResult = try await MonkeyAPI().request("keyboard_generate", params: ["platform": platform, "scenario": scenario, "context": context, "contextMode": "thread", "threadTargetKind": threadTargetKind, "instruction": instruction, "reference": reference])
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
            .task {
                do {
                    if try Shared.importConnection() {
                        address = Shared.defaults.string(forKey: "address") ?? address
                        token = Shared.token()
                        message = "电脑连接配置已导入，请点击连接并保存。"
                    }
                } catch { message = error.localizedDescription }
            }
            .onChange(of: [context, threadRoot, threadTarget, threadTargetKind, platform, scenario, instruction, reference]) { _, _ in
                generationRevision += 1; result = nil
            }
            .onChange(of: [address, token]) { _, _ in connected = false }
            .confirmationDialog("忘记这台主机的连接和准备的上下文？", isPresented: $showForget) {
                Button("断开并忘记", role: .destructive) { run { try Shared.forget(); token = ""; connected = false; result = nil; context = ""; threadRoot = ""; threadTarget = ""; instruction = ""; reference = ""; message = "已断开并清除本机连接" } }
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
