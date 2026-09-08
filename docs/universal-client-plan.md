# Monkey 多端客户端改造与交付计划

## 目标与技术决策

以 Expo / React Native 统一 iOS、Android、平板、Web 的客户端界面；macOS、Windows、Linux 可使用同一 Web 界面或新的 Electron 入口。Node.js 继续承担模型调用、命令/文件工具、持久记忆和历史保存。手机连接用户自己的主机，不能在 iOS/Android 内直接运行现有 Node/bash/macOS AppleScript 工具。

官方参考：
- https://docs.expo.dev/versions/latest/ （本次锁定 SDK 57、RN 0.86.3、React 19.2.3；客户端 Node >= 22.13）
- https://docs.expo.dev/develop/development-builds/introduction/
- https://docs.expo.dev/versions/latest/sdk/securestore/
- https://docs.expo.dev/build/setup/

## 仓库审查结果

| 原模块 | 当前状态 | 处理 |
| --- | --- | --- |
| `src/core/api.ts`、providers、tools、memory | 已有真实 Agent 能力 | 直接复用 |
| `MonkeyApp` | Swift/macOS 客户端，依赖 Unix socket | 保留作为旧客户端和回退路径 |
| `MonkeyElectron` | Electron/Windows 客户端，依赖 stdio | 保留作为旧客户端和回退路径 |
| `src/core/daemon.ts` | 全局当前会话、仅一个 activeSocket、连接相互替换 | 新网络运行时采用按会话隔离的任务和多客户端广播 |
| `src/session/store.ts` | 共享 JSON 历史 | 原子保存、校验 ID、同步更新内存标题/时间 |
| 移动端 | 无 Expo 工程/网络入口 | 新增 `apps/universal` 与 `monkey serve` |

## 实施顺序

1. **协议与服务**：认证 WebSocket，复用 Agent 核心；按 sessionId 路由；流式通知、快照恢复、并发保护、工具确认。
2. **统一客户端**：移动端导航与宽屏侧栏；会话新建/切换/重命名/删除/清空；Markdown/代码复制；模型切换；图片与 UTF-8 文本附件；设置和错误反馈。
3. **平台适配**：SecureStore；安全区、键盘避让；回到前台重连；Android APK、iOS 真机/模拟器 EAS 配置；桌面入口。
4. **验证与交付**：运行时/传输集成测试、三端资源导出、Web 视觉核查、原生工程生成；提交 draft PR。真机、签名和真实模型验收后再转 ready。

## 首版功能与边界

| 能力 | iOS / Android | Web / 新桌面入口 |
| --- | --- | --- |
| 实时对话、历史与多会话 | 支持 | 支持 |
| 同主机的多设备同步 | 支持 | 支持 |
| 断网后任务继续、重连恢复 | 支持；不自动重发消息 | 支持；不自动重发消息 |
| Markdown、代码、复制回复 | 支持 | 支持 |
| 图片、文本/JSON 附件 | 最多 4 个；单图约 3 MB；文本 200 KB | 同左 |
| PDF / Word 解析、语音、分享扩展 | 后续单独实施 | 后续单独实施 |
| 工具确认 | 命令/文件修改/备忘录/提醒逐次允许或拒绝 | 同左 |
| 模型 API Key | 仅存主机，不下发客户端 | 同左 |
| 连接密钥 | 系统 SecureStore | 仅当前进程内存；刷新需重新输入 |
| 命令与文件实际执行位置 | 连接的主机 | 连接的主机 |
| Apple Notes / Reminders | 仅当服务主机是 macOS | 同左 |
| 手机离线运行 Agent | 不支持 | 不适用 |
| 移动推送通知 | 尚未实现；前台/重连查看进度 | 不适用 |

新网络服务是**单用户、多设备**模式：持有同一连接密钥的客户端可见全部会话。不是多租户托管产品。每台主机只运行一个新的网络服务；迁移期间请停止旧 GUI/daemon 对同一历史目录的写入，避免多进程覆盖。旧客户端无需删除。

## 安装和启动

在仓库根目录：

```bash
npm ci
npm run build
npm ci --prefix apps/universal
npm run export:web --prefix apps/universal
# 首次使用先运行 monkey 完成主机模型配置；或 npm start
npm start
# 完成配置后退出交互 CLI，再启动网络服务
npm run serve
```

默认在 `http://127.0.0.1:8787` 服务 Web 页面和 `/rpc` WebSocket；连接密钥自动创建于 `~/.monkey-cli/server-token`（600 文件权限）。在本机读取该文件，在客户端“设置”粘贴连接密钥。不要把模型 API Key 当作连接密钥。

```bash
cat ~/.monkey-cli/server-token
```

变量：

| 变量 | 默认 | 用途 |
| --- | --- | --- |
| `MONKEY_HOST` | `127.0.0.1` | 监听地址 |
| `MONKEY_PORT` | `8787` | 服务端口 |
| `MONKEY_SERVER_TOKEN` | 自动生成并读取 server-token | 自定义至少 32 字符的随机连接密钥 |
| `MONKEY_WEB_ROOT` | 仓库 apps/universal/dist | Web 导出目录；npm 全局安装时需显式指定 |
| `MONKEY_ALLOWED_ORIGINS` | 同源 | 开发服务器额外 Origin，逗号分隔；不使用 `*` |
| `MONKEY_DATA_DIR` | ~/.monkey-cli | 新网络服务 token 和 session 存储根；主要用于测试隔离，不改变旧配置/记忆目录 |

### 手机连接

正式使用应在主机前配置 HTTPS 反向代理，同时转发 `/rpc` 的 WebSocket Upgrade。手机填写可访问的 HTTPS 地址。示例 Caddy 配置（域名需要你实际控制并指向主机）：

```caddyfile
monkey.example.com {
  reverse_proxy 127.0.0.1:8787
}
```

手机里的 `localhost` 指手机自身，不能填电脑的 localhost。仅调试可信局域网时，将主机设置为 `MONKEY_HOST=0.0.0.0`，使用电脑的内网 IP；Android 调试构建需 `MONKEY_ALLOW_LAN_HTTP=1`，该变量通过 Expo Build Properties 写入原生工程。生产构建默认禁止 Android 明文 HTTP。

```bash
# 主机终端：仅用于局域网调试
MONKEY_HOST=0.0.0.0 npm run serve
# 客户端终端
cd apps/universal
MONKEY_ALLOW_LAN_HTTP=1 npx expo run:android
```

开发 Web：在主机启动时设置 `MONKEY_ALLOWED_ORIGINS=http://localhost:8081`，再 `npm run web --prefix apps/universal`。准确填写实际显示的 Origin。导出的 Web 由 Monkey 服务同源提供，无需额外 Origin。

### 原生安装包

```bash
cd apps/universal
npx expo run:ios       # macOS + Xcode
npx expo run:android   # Android SDK/JDK
# 或在 Expo 账户中配置 EAS 项目后
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform ios --profile simulator
npx eas-cli build --platform ios --profile preview
```

Android preview 输出 APK。iOS simulator 不可装在 iPhone；iPhone internal distribution 需要 Apple 开发者签名和注册设备，TestFlight 需要 App Store Connect。`com.monkey.agent` 为本次默认包名，首次创建商店应用前需核对最终归属和可用性。尚未创建 Expo 云项目或上传商店。

### 桌面

启动主机服务后：

```bash
npm run desktop --prefix apps/universal
# 可通过 MONKEY_DESKTOP_URL 指向另一个已部署的 HTTPS Monkey 主机
npm run desktop:build --prefix apps/universal
```

新桌面入口展示服务端导出的统一界面，应用本身不内置 Node Agent，也不会启动主机。打包默认按当前操作系统生成；macOS 签名/公证和 Windows 签名需要对应凭据。原有 `MonkeyApp` 与 `MonkeyElectron` 的旧路径仍可使用。

## 协议与数据行为

- `/rpc` 首条请求必须 `authenticate`，密钥在消息体中；5 秒未认证关闭；不在 URL 或日志中输出密钥。
- `initialize` 返回能力、配置模型、历史元数据；会话请求显式携带 `sessionId`。
- `session_get` 返回历史、当前流式文本、工具状态、待确认请求；重连以此为准。
- `chat` 返回 accepted，最终结果经 `run/done` 和 `session/state` 广播。不能把 accepted 当作完成。
- 同会话运行时拒绝 chat/删除/清空/模型和 Wild 修改；不同会话可独立运行。
- 断网不取消服务端任务；取消按钮发送 abort。取消及拒绝补齐 tool_result，避免后续模型请求报协议错误。
- 超过 2 分钟的确认自动拒绝。Wild 必须由用户在设置中主动开启。
- 自动压缩复用已有 compactMessages；压缩失败保留历史。
- 未发送草稿重连时保留；主动切换会话当前版本清空草稿及待发附件。
- 连接密钥轮换：停止服务，安全替换 token 文件或环境变量后重启，再重新连接设备。

## 发布验收

自动验证：`npm test`、客户端 `npm run typecheck`、`npm run export`。CI 运行同样检查并保留三端资源。

以下必须在获得设备/账户后完成，不能以 JS 导出代替：

- iPhone/Android 真机：冷启动、安全存储恢复、键盘/返回手势、照片和文件选择、复制、长文本滚动。
- 两台真实设备同连主机：同时不同会话、拒绝确认、取消后继续、后台切回/网络切换。
- 使用真实服务商模型完成工具任务，确认主机权限/网络可达性。
- Android APK 安装；iPhone 内部分发或 TestFlight；macOS/Windows 桌面启动和签名流程。

后续优先级：P1 推送通知和后台任务完成提醒；P1 会话草稿持久化；P2 文件浏览/产物下载；P2 分享扩展与语音；公开托管服务另行设计账户、租户隔离和设备权限。

## 本次实际验证记录

- 服务端 TypeScript 编译、客户端 TypeScript 检查通过。
- 7 项运行时和网络集成测试通过（使用隔离目录和模拟模型，不消耗用户 API 配额）。
- Expo SDK 57 的 iOS / Android / Web 生产资源导出通过，包括 iOS / Android Hermes 字节码。
- 浏览器打开本地预览被当前环境阻止（ERR_BLOCKED_BY_CLIENT），未完成视觉/点击验收。
- 未执行真实模型请求；未完成原生编译、真机安装、桌面操作系统测试或商店签名。
- Expo prebuild 已成功生成 iOS / Android 原生工程（不提交生成目录）；不能将 prebuild / 资源导出视为已生成安装包。
