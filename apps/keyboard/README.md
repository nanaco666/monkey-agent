# Monkey Keyboard (iOS)

Monkey 的系统键盘形态：Twitter/X、Discord、小红书场景，两条候选、重新生成、点选填入。主机使用现有 `monkey serve` 和模型配置，不把模型 API Key 放入键盘。

## 构建与模拟器安装

需要 Xcode 及 iOS 17+ Simulator。项目由 [XcodeGen](https://github.com/yonaskolb/XcodeGen) 生成；安装官方 XcodeGen 后：

```sh
cd apps/keyboard
xcodegen generate
xcodebuild -project MonkeyKeyboard.xcodeproj -scheme MonkeyKeyboard \
  -sdk iphonesimulator -configuration Release -derivedDataPath build \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- build
xcrun simctl install booted build/Build/Products/Release-iphonesimulator/MonkeyKeyboard.app
xcrun simctl launch booted com.monkey.keyboard
```

模拟器应用包包含 `KeyboardExtension.appex`。这不是可分发的真机 IPA。真机需要选定开发 Team，并正确配置 App Groups 与 Keychain Sharing；免费个人账户可能不支持所需能力。Expo Go 无法加载该扩展。

模拟器可以编译并安装容器 App；但没有 Apple Developer 签名时，iOS 26.5 可能在切换到第三方键盘时因 XPC/RunningBoard 权限检查终止扩展进程。容器 App 能运行不代表键盘扩展已通过验收，也不能替代真机签名测试。需要验证扩展画面和插入行为时，使用可用的 Team、Provisioning Profile 和 App Groups/Keychain Sharing 配置。

## 使用

1. 仓库根目录 `npm run build && npm run serve`。容器 App 填主机地址和 `~/.monkey-cli/server-token`，点「连接并保存」。模型配置继续在主机 `~/.monkey-cli/config.json`。
2. 系统设置 → 通用 → 键盘 → 键盘 → 添加新键盘 → Monkey，再开启「允许完全访问」用于联网。App 与键盘用共享 Keychain 保存连接密钥，用 App Group 传递明确准备的上下文。
3. 复制原文，在任意支持第三方键盘的输入框长按地球选择 Monkey，点「读取剪贴板」，选平台与场景，生成两条候选。也可在工作台准备上下文和本次指令后返回目标 App。
4. 点候选只插入文本；检查后手动发送。键盘不会自动向 Twitter、Discord、小红书发消息。
5. 查进度需要明确 GitHub Issue/PR 链接，或在偏好中保存仓库后填写 #编号。主机需要安装并登录 `gh`。无法核实时不会宣称完成或创建 PR；当前以事实模板输出，其他场景使用模型生成并遵循偏好。
6. 在偏好页维护项目背景、语气、各平台规则、示例。在 Monkey 对话发送 `/keyboard-note 回复时不要表情` 或 `记住键盘偏好：回复时不要表情`，下一次生成即可使用。

键盘不能读取宿主 App 整页或自动识别平台。当前输入框可能只提供部分文本；请核对原文。没有持续剪贴板监听，不后台收集输入。设置中的清除按钮会清除准备的上下文。

网络：本机模拟器可用 `http://127.0.0.1:8787`；真机需可达的 HTTPS 主机或可信局域网调试地址。电脑窗口与后端是独立的，关闭窗口不必关闭服务，关闭后端则键盘无法生成。
