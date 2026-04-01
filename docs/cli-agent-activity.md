# Monkey Agent Activity Display Design

## 设计目标

用户不需要读懂每一步，但要能：
1. 感知 monkey 在忙什么（不是黑盒）
2. 快速扫描执行历史
3. 在出错时定位到哪一步出了问题

---

## Tool 调用视觉层次

```
  ◆ {tool}  {摘要}          ← 调用开始，gray（写操作用 green）
  ⠹ {动作描述}...           ← 执行中 spinner（仅耗时操作显示）
    → {结果摘要}             ← 完成，内缩一级
```

### 各 Tool 图标 & 摘要规则

| Tool | 颜色 | 图标 | 摘要内容 |
|------|------|------|----------|
| `read` | gray | `◆ read` | 文件路径 |
| `glob` | gray | `◆ glob` | pattern |
| `grep` | gray | `◆ grep` | pattern in path |
| `bash` | gray | `◆ bash` | 命令前 40 字符 |
| `write` | green | `◆ write` | 文件路径 |
| `edit` | green | `◆ edit` | 文件路径 |

### 结果摘要规则

- 成功：第一行，截断到 60 字符
- 错误：红色 `✗` + 错误信息第一行
- 写操作成功：`→ saved` / `→ updated`（不显示内容）

```
  ◆ read  src/index.ts
    → 21 lines

  ◆ bash  npm install
  ⠹ running...
    → added 57 packages

  ◆ write  src/setup.ts
    → saved

  ◆ bash  rm -rf /
    ✗ permission denied: Operation not permitted
```

---

## 多步骤执行

多个 tool 连续调用时，不加空行，紧凑显示：

```
  ◆ glob  src/**/*.ts
    → 8 files

  ◆ read  src/index.ts
    → 21 lines

  ◆ edit  src/index.ts
    → updated
```

AI 文字响应在 tool 链结束后输出，前后各一空行。

---

## Memory 操作

Memory 是 monkey 在"学习"，需要特殊视觉标识。

```
  ◆ memory  saving "prefer raw stdin over readline"
    → remembered
```

读取 memory：

```
  ◆ memory  loading context...
    → 3 entries
```

颜色：yellow（区别于普通 tool，代表 monkey 在动脑）

---

## 思考阶段（AI 处理中）

流式输出开始前，显示 spinner：

```
  ⠹ thinking...
```

收到第一个 token，spinner 消失，文字直接从同一行开始输出。

---

## 错误状态

```
  ◆ bash  curl https://example.com
    ✗ connection timeout

  ⊂((≧⊥≦))⊃  something went wrong
```

API 错误（401/429 等）：

```
  ✗ 401 Unauthorized — check your API key
     monkey config set api_key <new-key>
```

---

## 长输出截断

bash/read 返回内容过长时：

```
  ◆ bash  cat package.json
    → {前 3 行}
      ... (42 more lines)
```

用户可以用 `/last` 查看上一个完整输出（待实现）。

---

## 完整对话示例

```
❯ 帮我把 index.ts 里的 console.log 都删掉

  ⠹ thinking...

  好的，我来读一下文件。

  ◆ read  src/index.ts
    → 45 lines

  ◆ edit  src/index.ts
    → updated

  删掉了 3 处 console.log，分别在第 12、28、40 行。

❯
```

---

## 状态汇总

| 状态 | 视觉 |
|------|------|
| 等待用户输入 | `❯ ▌` |
| AI 思考中 | `⠹ thinking...` |
| 工具执行中（快） | 直接显示结果，不加 spinner |
| 工具执行中（慢，>300ms） | spinner |
| 工具成功 | `→ 摘要` gray / green |
| 工具失败 | `✗ 原因` red |
| Memory 操作 | yellow `◆ memory` |
| 整体出错 | red + kaomoji |
| 退出 | `bye ⊂((≧⊥≦))⊃` |

---

## 待实现功能

- `spinner` 仅在操作 >300ms 时出现，避免闪烁
- `/last` 查看上一个完整输出
- Memory 模块实现后接入 yellow 标识
