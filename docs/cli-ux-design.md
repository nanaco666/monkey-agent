# Monkey CLI UX Design

## Design Principles

1. **每个阶段有明确边界** — 分隔线 + 阶段标题，用户知道在哪一步
2. **过程可见** — 有加载就有动效，不能让用户盯着空白
3. **Monkey 有个性** — 不是冷冰冰的工具，是一只有情绪的猴子
4. **失败友好** — 出错时猴子也要有反应，不只是红字

---

## 颜色 & 符号

| 元素 | 样式 |
|------|------|
| 步骤标题 | orange bold |
| 分隔线 | gray `─────` |
| 成功 | green `✓` |
| 错误 | red `✗` |
| 加载 | gray spinner + 文字 |
| 猴子 kaomoji | yellow |

---

## Spinner

帧序列（每 80ms 切换）：

```
⠋  ⠙  ⠹  ⠸  ⠼  ⠴  ⠦  ⠧  ⠇  ⠏
```

格式：`  {spinner} {message}`

Monkey 主题 message 示例：

| 场景 | 文字 |
|------|------|
| 拉取模型列表 | `checking what models are around...` |
| AI 思考中 | `thinking...` |
| 执行工具 | `on it...` |
| 写文件 | `scribbling...` |
| 运行命令 | `running...` |

---

## Setup 向导

### 整体结构

```
  ████ MONKEY ████   ← banner（仅在 setup 开始时展示）

  Welcome. Let's get you set up.   ← cream，一次性欢迎语


  ── Provider ──────────────────────  ← 阶段分隔线

    ❯ Anthropic
      OpenRouter
      Custom endpoint


  ── API Key ───────────────────────

  Get your key: https://console.anthropic.com/

  API key: ▌


  ── Models ────────────────────────

  ⠹ checking what models are around...   ← spinner

    ❯ claude-opus-4-5        — most capable
      claude-sonnet-4-5      — balanced
      claude-haiku-4-5       — fastest, cheapest


  ── Fast Model ────────────────────

    ❯ claude-haiku-4-5       — recommended
      claude-sonnet-4-5      — balanced


  ✓ Ready. ⊂((・⊥・))⊃               ← 成功 + 随机 kaomoji
```

### 阶段分隔线格式

```
  ── {阶段名} {─ 补齐到固定宽度}
```

固定宽度 40 字符，gray，中间阶段名 cream bold。

---

## REPL 状态

### 空闲（等待输入）

```
❯ ▌
```

### AI 思考中（流式输出前）

spinner 在光标位置，收到第一个 token 后消失，直接接文字输出。

### 工具调用

```
  ◆ bash: npm install          ← gray
  ⠹ running...                 ← spinner，执行期间
  → done                       ← 执行完毕，结果摘要
```

写操作（write/edit）用 green：

```
  ◆ write: src/index.ts        ← green
  → saved                      ← green
```

错误：

```
  ◆ bash: rm -rf /             ← gray
  ✗ permission denied          ← red
```

### Ctrl+C

```
  (Ctrl+C again to exit)  ⊂((￣⊥￣))⊃
```

### 退出

```
  bye ⊂((≧⊥≦))⊃
```

---

## Kaomoji 使用规则

| 场景 | kaomoji |
|------|---------|
| 退出 | 随机 |
| setup 完成 | 随机 |
| Ctrl+C 警告 | `⊂((￣⊥￣))⊃`（不满） |
| 错误 | `⊂((≧⊥≦))⊃`（崩溃） |
| banner | 随机 |

库：`⊂((￣⊥￣))⊃` `⊂((・⊥・))⊃` `⊂((≧⊥≦))⊃` `⊂((*＞⊥σ))⊃` `⊂((。・o・))⊃`

---

## 实现拆分

| 模块 | 文件 |
|------|------|
| Spinner 组件 | `src/ui/spinner.ts` |
| 分隔线 / 状态行 | `src/ui/layout.ts` |
| selectList | `src/ui/select.ts` |
| askRaw | `src/ui/input.ts` |
| kaomoji | `src/ui/kaomoji.ts`（或并入 banner.ts） |

setup.ts 和 repl.ts 只调用 ui/ 里的组件，不直接写 ANSI 码。
