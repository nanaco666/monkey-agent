import UIKit

final class KeyboardViewController: UIInputViewController {
    private let orange = UIColor(red: 0.89, green: 0.40, blue: 0.18, alpha: 1)
    private let stack = UIStackView()
    private let platformControl = UISegmentedControl(items: ["Twitter / X", "Discord", "小红书"])
    private let sceneControl = UISegmentedControl(items: ["轻互动", "认真回复", "查进度"])
    private let contextLabel = UILabel()
    private let statusLabel = UILabel()
    private let candidates = UIStackView()
    private var generateButton = UIButton(type: .system)
    private var work: Task<Void, Never>?
    private var revision = 0
    private var documentID: UUID?
    private var context = ""
    private var reference = ""
    private var instruction = ""
    private var preparedAt: Double = 0
    private let platforms = ["twitter", "discord", "xiaohongshu"]
    private let scenarios = ["reaction", "reply", "support"]

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.97, green: 0.96, blue: 0.94, alpha: 1)
        view.heightAnchor.constraint(equalToConstant: 390).isActive = true
        stack.axis = .vertical; stack.spacing = 8; stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: view.topAnchor, constant: 10),
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8),
        ])
        let heading = UILabel(); heading.text = "Monkey"; heading.font = .boldSystemFont(ofSize: 18)
        let globe = UIButton(type: .system); globe.setTitle("换键盘", for: .normal); globe.tintColor = orange
        globe.setImage(UIImage(systemName: "globe"), for: .normal)
        globe.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
        let hide = button("收起", #selector(hideKeyboard))
        let header = row([heading, globe, hide]); heading.setContentHuggingPriority(.defaultLow, for: .horizontal)
        stack.addArrangedSubview(header)
        platformControl.selectedSegmentIndex = 0; sceneControl.selectedSegmentIndex = 0
        platformControl.addTarget(self, action: #selector(selectionChanged), for: .valueChanged)
        sceneControl.addTarget(self, action: #selector(selectionChanged), for: .valueChanged)
        stack.addArrangedSubview(platformControl); stack.addArrangedSubview(sceneControl)
        contextLabel.font = .systemFont(ofSize: 12); contextLabel.numberOfLines = 2; contextLabel.textColor = .secondaryLabel
        contextLabel.accessibilityIdentifier = "keyboardContext"
        contextLabel.setContentCompressionResistancePriority(.required, for: .vertical)
        stack.addArrangedSubview(contextLabel)
        let actions = row([button("读取剪贴板", #selector(readClipboard)), button("用输入框内容", #selector(readInput)), button("清除", #selector(clearContext))])
        actions.distribution = .fillEqually; stack.addArrangedSubview(actions)
        let scroll = UIScrollView(); scroll.translatesAutoresizingMaskIntoConstraints = false
        candidates.axis = .vertical; candidates.spacing = 8; candidates.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(candidates)
        NSLayoutConstraint.activate([
            candidates.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            candidates.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            candidates.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            candidates.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            candidates.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
        ])
        stack.addArrangedSubview(scroll)
        generateButton = button("生成两条回复", #selector(generate))
        generateButton.backgroundColor = orange; generateButton.tintColor = .white
        generateButton.layer.cornerRadius = 10
        stack.addArrangedSubview(row([generateButton, button("空格", #selector(space)), button("⌫", #selector(backspace))]))
        statusLabel.font = .systemFont(ofSize: 11); statusLabel.numberOfLines = 2; statusLabel.textColor = .secondaryLabel
        statusLabel.accessibilityIdentifier = "keyboardStatus"
        statusLabel.setContentCompressionResistancePriority(.required, for: .vertical)
        stack.addArrangedSubview(statusLabel)
        documentID = textDocumentProxy.documentIdentifier
        loadPreparedContext()
    }
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        loadPreparedContext()
        if !hasFullAccess { statusLabel.text = "先在系统键盘设置中为 Monkey 开启「允许完全访问」，才能连接主机。" }
    }
    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated); invalidate()
    }
    override func textDidChange(_ textInput: UITextInput?) {
        super.textDidChange(textInput)
        if let documentID, documentID != textDocumentProxy.documentIdentifier { invalidate(); statusLabel.text = "输入框已切换，请核对原文后重新生成。" }
        documentID = textDocumentProxy.documentIdentifier
    }
    private func loadPreparedContext() {
        let date = Shared.defaults.double(forKey: "contextDate")
        if date > preparedAt {
            invalidate(); preparedAt = date
            context = Shared.defaults.string(forKey: "context") ?? ""
            instruction = Shared.defaults.string(forKey: "instruction") ?? ""
            reference = Shared.defaults.string(forKey: "reference") ?? ""
            platformControl.selectedSegmentIndex = platforms.firstIndex(of: Shared.defaults.string(forKey: "platform") ?? "twitter") ?? 0
            sceneControl.selectedSegmentIndex = scenarios.firstIndex(of: Shared.defaults.string(forKey: "scenario") ?? "reaction") ?? 0
            let formatter = DateFormatter(); formatter.dateFormat = "MM-dd HH:mm"
            statusLabel.text = "工作台准备于 \(formatter.string(from: Date(timeIntervalSince1970: date)))；请核对仍是这条原文。"
        }
        updateContext()
    }
    private func updateContext() {
        contextLabel.text = context.isEmpty ? "先传入原文 · 键盘不能自动读取帖子或聊天整页" : "原文：\(context.prefix(140))"
        generateButton.isEnabled = !context.isEmpty
        generateButton.alpha = context.isEmpty ? 0.45 : 1
    }
    private func invalidate() {
        revision += 1; work?.cancel(); work = nil
        for child in candidates.arrangedSubviews { candidates.removeArrangedSubview(child); child.removeFromSuperview() }
        generateButton.setTitle("生成两条回复", for: .normal); generateButton.isEnabled = !context.isEmpty
    }
    @objc private func readClipboard() {
        guard hasFullAccess else { statusLabel.text = "读取剪贴板与联网需要在系统键盘设置开启「允许完全访问」。"; return }
        guard let text = UIPasteboard.general.string, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { statusLabel.text = "剪贴板没有文本。请先复制需要回复的原文。"; return }
        setContext(text, source: "已读取你复制的文本；请核对后生成。")
    }
    @objc private func readInput() {
        let text = textDocumentProxy.selectedText ?? ((textDocumentProxy.documentContextBeforeInput ?? "") + (textDocumentProxy.documentContextAfterInput ?? ""))
        guard !text.isEmpty else { statusLabel.text = "当前输入框为空；请先复制原文，或在工作台准备上下文。"; return }
        setContext(text, source: "只取得输入框可见的文本片段，未取得整条帖子。")
    }
    private func setContext(_ text: String, source: String) {
        guard text.count <= 16000 else { statusLabel.text = "原文过长，请在工作台精简到 16000 字符以内。"; return }
        invalidate(); context = text; instruction = ""; reference = ""
        // Pick only an explicit GitHub link, not an inferred project or issue.
        if let range = text.range(of: #"https://github\.com/[\w.-]+/[\w.-]+/(issues|pull)/[1-9]\d*"#, options: .regularExpression) { reference = String(text[range]) }
        statusLabel.text = source; updateContext()
    }
    @objc private func clearContext() {
        invalidate(); context = ""; instruction = ""; reference = ""
        Shared.clearContext()
        statusLabel.text = "原文和候选已清除"; updateContext()
    }
    @objc private func selectionChanged() { invalidate(); statusLabel.text = "平台或场景已更新；请重新生成。" }
    @objc private func generate() {
        guard hasFullAccess else { statusLabel.text = "请先为 Monkey 键盘开启「允许完全访问」。"; return }
        guard !context.isEmpty else { return }
        invalidate()
        let version = revision, target = textDocumentProxy.documentIdentifier
        let params: [String: Any] = ["platform": platforms[platformControl.selectedSegmentIndex], "scenario": scenarios[sceneControl.selectedSegmentIndex], "context": context, "instruction": instruction, "reference": reference]
        generateButton.isEnabled = false; generateButton.setTitle("正在生成…", for: .normal)
        statusLabel.text = "只发送当前原文与指令；你可以随时切回其他键盘。"
        work = Task { @MainActor [weak self] in
            do {
                let result: ReplyResult = try await MonkeyAPI().request("keyboard_generate", params: params)
                guard let self, !Task.isCancelled, self.revision == version, self.textDocumentProxy.documentIdentifier == target else { return }
                for (index, text) in result.candidates.enumerated() {
                    var config = UIButton.Configuration.filled()
                    config.baseBackgroundColor = .white; config.baseForegroundColor = .label
                    config.title = "\(index + 1)  \(text)"; config.titleAlignment = .leading
                    config.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 12)
                    let candidate = UIButton(configuration: config)
                    candidate.titleLabel?.font = .systemFont(ofSize: 14); candidate.titleLabel?.numberOfLines = 0
                    candidate.accessibilityLabel = "填入候选 \(index + 1)：\(text)"
                    candidate.addAction(UIAction { [weak self] _ in
                        guard let self, self.textDocumentProxy.documentIdentifier == target else { return }
                        self.textDocumentProxy.insertText(text)
                        self.invalidate(); self.statusLabel.text = "已填入，请在 App 中检查后发送。"
                    }, for: .touchUpInside)
                    self.candidates.addArrangedSubview(candidate)
                }
                self.statusLabel.text = result.notice
                self.generateButton.isEnabled = true; self.generateButton.setTitle("重新生成", for: .normal)
            } catch {
                guard let self, !Task.isCancelled, self.revision == version else { return }
                self.statusLabel.text = error.localizedDescription
                self.generateButton.isEnabled = true; self.generateButton.setTitle("重试生成", for: .normal)
            }
        }
    }
    @objc private func hideKeyboard() { dismissKeyboard() }
    @objc private func space() { textDocumentProxy.insertText(" ") }
    @objc private func backspace() { textDocumentProxy.deleteBackward() }
    private func button(_ title: String, _ action: Selector) -> UIButton {
        let button = UIButton(type: .system); button.setTitle(title, for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold); button.tintColor = orange
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 36).isActive = true
        button.addTarget(self, action: action, for: .touchUpInside); return button
    }
    private func row(_ children: [UIView]) -> UIStackView {
        let row = UIStackView(arrangedSubviews: children); row.axis = .horizontal; row.spacing = 8; row.alignment = .fill
        return row
    }
}
