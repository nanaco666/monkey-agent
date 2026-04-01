# Monkey CLI — 界面设计文档

## 品牌感

名字来自猴子：聪明、群居、进化。
界面风格：**克制、信息密度高、不花哨**。
不用 emoji 堆砌，用结构和颜色传递信息。

---

## 颜色系统

```
主色    #F5A623  暖橙色  ← 猴子/活泼，用于 prompt 符号、高亮
成功    #4CAF50  绿色    ← 工具执行成功、文件写入完成
警告    #FF9800  橙色    ← 需要用户确认的权限请求
错误    #F44336  红色    ← 执行失败、API 错误
AI 输出  白色            ← 主输出，清晰优先
工具调用 #888888  灰色   ← 降噪，不抢 AI 回答的视觉焦点
信息    #64B5F6  蓝色   ← 系统提示、状态信息
```

---

## 启动界面

```
  🐒 monkey  v0.1.0
  model: claude-opus-4-6  |  project: filo-chat  |  memory: 12 entries

  Type a message or /help for commands.
  ──────────────────────────────────────
  ❯
```

说明：
- 顶部一行展示版本、当前模型、项目名、记忆条数
- 分割线之后是输入区
- `❯` 是输入符号，用主色（橙色）

---

## 对话界面

### 基本结构

```
  ❯ 帮我看看 src/index.ts 有没有问题

  ◆ Reading src/index.ts...                          [灰色，工具调用]
  ◆ Found 3 issues:                                  [AI 开始回答，白色]

  1. 第 12 行：...
  2. 第 34 行：...
  3. 第 67 行：...

  要修复吗？

  ❯
```

### 工具调用的显示

```
  ◆ bash: git status                                 [灰色]
  ◆ read: src/auth/login.ts (234 lines)              [灰色]
  ◆ glob: src/**/*.ts → 42 files                     [灰色]
  ◆ edit: src/auth/login.ts                          [绿色，写操作醒目]
  ◆ bash: npm test → ✓ 23 passed                     [绿色]
  ◆ bash: npm test → ✗ 2 failed                      [红色]
```

规则：
- 只读操作（read/glob/grep/bash 只读命令）：灰色，一行
- 写操作（edit/write/bash 写命令）：绿色，一行
- 失败：红色，一行
- 不展开工具的输入/输出内容，AI 会在回答里说重要的部分

---

## 权限确认

```
  ┌─ 权限请求 ──────────────────────────────────────┐
  │  bash: rm test/fixtures/old-data.json            │
  │                                                  │
  │  [y] 允许   [n] 拒绝   [a] 本次会话不再询问      │
  └──────────────────────────────────────────────────┘
  ❯
```

规则：
- 用边框突出，和普通输出区分开
- 三个选项都是单键，不需要回车
- 选 `n` 后 Claude 会收到"用户拒绝"的消息，自动调整

---

## 斜杠命令

输入 `/` 后自动提示可用命令：

```
  ❯ /

  /commit      生成 git commit 信息并提交
  /plan        进入计划模式（只读，不执行操作）
  /memory      查看当前加载的记忆
  /model       切换模型
  /clear       清空本次对话历史
  /help        显示所有命令
```

输入时实时过滤：

```
  ❯ /co

  /commit      生成 git commit 信息并提交
```

---

## 状态栏（底部，可选）

长任务运行时底部显示进度：

```
  ──────────────────────────────────────────────────
  ⠸ Thinking...   tokens: 1,234 in / 456 out   $0.003
```

完成后清除，不占用对话空间。

---

## 多 Agent（未来阶段）

多个 Agent 并行时，每个 Agent 用不同颜色前缀：

```
  [A1 蓝] ◆ read: src/components/Button.tsx
  [A2 紫] ◆ grep: "useState" → 34 matches
  [A3 青] ◆ bash: npm test → ✓ 18 passed

  ◆ 三个 Agent 都完成了，汇总如下：
  ...
```

Agent 颜色由系统分配，视觉差异最大化（参考 agentColorManager 设计）。

---

## Dream 状态提示

Dream 后台整理时，底部短暂显示：

```
  ✦ Consolidating memory from 6 sessions...   [蓝色，不打断对话]
```

完成后：

```
  ✦ Memory updated. 3 files changed.           [蓝色，2 秒后消失]
```

---

## 错误状态

### API 错误

```
  ✗ API Error: rate_limit_exceeded
    Retrying in 5s... (attempt 2/3)
```

### 工具执行失败

```
  ◆ bash: npm run build → ✗ exit code 1        [红色]
    error TS2345: Argument of type...
    (Claude 会看到完整错误，自动决定下一步)
```

### 连接断开

```
  ✗ Connection lost. Reconnecting...
  ✓ Reconnected.
```

---

## 交互规则

| 快捷键 | 行为 |
|--------|------|
| `Enter` | 发送消息 |
| `Shift+Enter` | 消息内换行 |
| `↑` / `↓` | 历史消息导航 |
| `Ctrl+C` | 中断当前 AI 响应 |
| `Ctrl+C` × 2 | 退出 |
| `Ctrl+L` | 清屏（保留对话历史） |
| `Tab` | 斜杠命令补全 |

---

## 信息密度原则

- 工具调用：**一行一条**，不展开详情
- AI 回答：完整输出，不截断
- 系统信息：灰色或蓝色，视觉降噪
- 错误：红色，简洁，附上 Claude 会处理的说明

目标是：用户注意力集中在 AI 的回答上，工具调用是背景噪音，不是前景信息。
