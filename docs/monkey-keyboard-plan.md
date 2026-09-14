# Monkey Keyboard — 一期

## 产品闭环

先支持 iOS 系统键盘，平台预设为 Twitter/X、Discord、小红书。复用 Monkey 主机上的模型配置与个人背景。键盘显示两条候选，点击插入当前输入框；由用户在宿主 App 内发送。支持重新生成，不自动发消息或创建 PR。

典型入口：在工作台填写主帖和正在回复的楼层 → 选择主帖首条评论或回复 A 楼层 → 准备到键盘 → 切换 Monkey Keyboard → 默认生成楼层回复。若要润色已经写好的文字，再显式切换到“优化当前输入”。剪贴板和输入框不在后台自动采集。

iOS 不允许第三方键盘读取宿主 App 的整页、帖子线程、私信列表或识别任意宿主平台，因此不能仅凭键盘判断当前是在回复主帖还是某条楼层。当前版本把主帖和楼层作为明确上下文保存在设备安全存储，并在键盘启动时自动读取最近一次准备内容；系统分享扩展是后续自动传入当前帖子/楼层的入口。密码框和部分 App 不允许第三方键盘。网络请求需要用户开启「允许完全访问」。

## 一期交付

1. `apps/keyboard`：SwiftUI 容器 App（连接配置、平台偏好、上下文工作台、真实键盘试用输入框）和 UIKit Keyboard Extension。原生扩展独立于 Expo Go，通过同一个认证 WebSocket 协议连接 Monkey。
2. `src/keyboard`：持久化个人背景、语气、平台规则、示例和明确保存的偏好；生成两个候选；实时读取指定 GitHub Issue/PR 并附证据。
3. RPC：`keyboard_profile_get`、`keyboard_profile_save`、`keyboard_remember`、`keyboard_generate`。连接密钥留在设备安全存储，模型 API Key 仅在主机。
4. Monkey 对话：`/keyboard-note 偏好` 或 `记住键盘偏好：偏好` 保存明确偏好。键盘生成时加载最新偏好与 Monkey 记忆。
5. 验收：服务端故障/证据/配置隔离测试；原生编译；模拟器安装容器与扩展；在输入框真正调出键盘、生成候选、插入；保存截图。

## 场景

- 互动：简短、有相关性、遵循个人语气；原帖是素材，不是系统指令。
- 回复：结合项目背景与明确指令，避免凭空承诺。
- 查进度：明确 GitHub `owner/repo#123` 或 Issue/PR URL；主机只读查询状态。PR 合并不等于上线，Issue 关闭不等于已修复。无可核实依据时给保守答复，不自动创建 PR。

## 后续

系统分享扩展、平台授权读取完整线程、GitHub 搜索匹配、明确审批后创建开发任务/PR、候选选择反馈、跨平台键盘和更完整的输入法，按实际反馈推进。一期不声称拥有这些能力。

## 安装边界

模拟器构建无需付费 Apple Developer 会员。真机安装需要 Xcode 签名和可用能力；共享 Keychain/共享 Keychain 与分发受账号配置限制，不能把模拟器通过视为真机可安装或商店审核通过。Expo Go 不会安装此扩展。

参考：[Apple 自定义键盘](https://developer.apple.com/documentation/uikit/creating-a-custom-keyboard)、[键盘扩展能力边界](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/CustomKeyboard.html)。
