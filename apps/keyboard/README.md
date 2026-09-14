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

模拟器应用包包含 `KeyboardExtension.appex`。这不是可分发的真机 IPA。真机需要选定开发 Team 并配置 Keychain Sharing。当前已移除 App Groups 依赖，2026-09-14 使用免费 Personal Team 在 iPhone 17 Pro Max（iOS 26.6.2）完成签名、安装、启动和主机连接。免费签名有效期通常为 7 天，到期需重新安装。Expo Go 无法加载该扩展。

2026-09-14 真机崩溃报告明确定位到 `viewDidLoad()` 过早读取 `documentIdentifier`：UIKit 返回 nil，而 Swift 的非空 UUID 桥接触发 SIGTRAP。已移除初始化期间读取，并用可空的公开 Objective-C getter 处理宿主尚未就绪的情况。此前将 SIGTRAP 直接归因于缺少付费签名的判断不成立；是否修复须以实际切换、生成与插入验证为准。

## 使用

1. 仓库根目录 `npm run build && npm run serve`。容器 App 填主机地址和 `~/.monkey-cli/server-token`，点「连接并保存」。模型配置继续在主机 `~/.monkey-cli/config.json`。
2. 系统设置 → 通用 → 键盘 → 键盘 → 添加新键盘 → Monkey，再开启「允许完全访问」用于联网。App 与键盘用共享 Keychain 保存连接密钥和最近一次楼层上下文。
3. 在工作台分别填写主帖和“正在回复的楼层”，选择“主帖（原创首条评论）”或“楼层回复（继续回复 A）”，点「准备到键盘」。切回目标 App 后，键盘默认直接使用这份上下文，不会把当前输入框草稿当作帖子。
4. 点候选只插入文本；检查后手动发送。键盘不会自动向 Twitter、Discord、小红书发消息。
5. 查进度需要明确 GitHub Issue/PR 链接，或在偏好中保存仓库后填写 #编号。主机需要安装并登录 `gh`。无法核实时不会宣称完成或创建 PR；当前以事实模板输出，其他场景使用模型生成并遵循偏好。
6. 在偏好页维护项目背景、语气、各平台规则、示例。在 Monkey 对话发送 `/keyboard-note 回复时不要表情` 或 `记住键盘偏好：回复时不要表情`，下一次生成即可使用。

键盘不能读取宿主 App 整页、帖子线程或自动识别当前是在回复主帖还是 A 楼层；这是 iOS 第三方键盘的系统边界。当前版本通过工作台保存主帖/楼层，并在键盘启动时自动加载最近上下文。后续可增加系统分享扩展，让 Twitter/Discord 把当前帖子或楼层显式分享给 Monkey。没有持续剪贴板监听，不后台收集输入。设置中的清除按钮会清除准备的上下文。

网络：本机模拟器可用 `http://127.0.0.1:8787`；真机需可达的 HTTPS 主机或可信局域网调试地址。电脑窗口与后端是独立的，关闭窗口不必关闭服务，关闭后端则键盘无法生成。

## USB 安装时导入连接

原生 App 支持将 `monkey-connection.json` 放入自身沙盒的 Documents 目录，格式为 `{"address":"http://局域网IP:8787","token":"Monkey连接密钥"}`。启动时验证后写入 Keychain，并删除临时文件。Monkey 主应用也支持相同方式。文件只能通过本地安装流程传入，不应放进源码、应用包或 Git。导入不会包含模型 API Key。

电脑后端默认只监听 127.0.0.1。手机连接需要同一网络上的可达接口（例如显式设置 `MONKEY_HOST` 或本地转发），且电脑不能休眠；手机里的 127.0.0.1 指向手机本身。
