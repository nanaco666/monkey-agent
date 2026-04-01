# Claude Client — 架构设计

## 定位

一个运行在终端的 AI 编程助手，核心理念来自对 Claude Code 源码的逆向分析。
用 API Key 驱动，模型可配置，本地执行工具，云端负责思考。

---

## 设计原则

1. **本地工具 + 云端大脑**：所有文件操作、命令执行在本地，思考在 API
2. **默认安全**：危险操作（删除、执行脚本）必须用户确认
3. **记忆持久化**：对话结束后知识留下来，下次继续
4. **缓存友好**：system prompt 结构固定，最大化 prompt cache 命中率
5. **可扩展**：工具和斜杠命令可以独立添加，不改核心逻辑

---

## 总体架构

```
┌──────────────────────────────────────────────────────────┐
│                      用户（终端）                         │
└─────────────────────────┬────────────────────────────────┘
                          │ 输入
                          ▼
┌──────────────────────────────────────────────────────────┐
│                    REPL 主循环                            │
│                                                          │
│  1. 解析输入（斜杠命令 or 普通消息）                      │
│  2. 加载相关记忆文件                                      │
│  3. 构建 API 请求（system + messages + tools）           │
│  4. 发送请求，流式接收输出                                │
│  5. 解析 tool_use，执行工具                               │
│  6. 把工具结果放回 messages，继续循环                     │
└──────┬───────────────────────────────┬───────────────────┘
       │                               │
       ▼                               ▼
┌─────────────┐                 ┌─────────────────┐
│  斜杠命令    │                 │   Anthropic API  │
│  /commit    │                 │   (API Key)      │
│  /plan      │                 │   claude-opus-*  │
│  /memory    │                 │   claude-sonnet-*│
│  自定义...  │                 └─────────────────┘
└─────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│                      工具层 (Tools)                       │
│                                                          │
│  BashTool     — 执行 shell 命令（有权限控制）             │
│  ReadTool     — 读取文件                                  │
│  WriteTool    — 写入文件                                  │
│  EditTool     — 精确字符串替换                            │
│  GlobTool     — 文件模式匹配                              │
│  GrepTool     — 内容搜索                                  │
│  WebFetchTool — 抓取网页（可选）                          │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│                    权限系统 (Permissions)                  │
│                                                          │
│  AutoAllow  — git status / git diff / cat / ls 等        │
│  AskUser    — rm / 写文件 / 执行脚本 等                   │
│  AlwaysDeny — rm -rf / force push 等                     │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                    记忆系统 (Memory)                       │
│                                                          │
│  MEMORY.md         — 索引文件，每次对话都加载             │
│  topic files       — 按主题存储的知识（user/project/...）│
│  session JSONL     — 每次对话的原始记录                   │
│                                                          │
│  加载策略：                                               │
│    启动时：读 MEMORY.md 全文                              │
│    每轮：用 AI 从 topic files 里选最相关的 ≤5 个加载     │
│                                                          │
│  Dream（后台整理）：                                      │
│    触发条件：距上次 >= 24h AND 新增会话 >= 5              │
│    操作：grep 历史 JSONL → 整合更新 topic files → 修剪索引│
└──────────────────────────────────────────────────────────┘
```

---

## 模块划分

### 1. `core/repl.ts` — 主循环

```
职责：
  - 读取用户输入
  - 维护 messages 数组（对话历史）
  - 协调工具执行和 API 调用
  - 处理流式输出

关键设计：
  - messages 数组按 Anthropic API 格式维护
  - tool_use 和 tool_result 成对出现，不能断
  - 异常时安全退出，不丢失对话
```

### 2. `core/api.ts` — API 客户端

```
职责：
  - 封装 Anthropic SDK
  - 管理 API Key（从 config 或环境变量读取）
  - 构建标准请求（含 cache_control 标记）
  - 处理流式响应

Prompt Cache 策略：
  system prompt 加 cache_control: { type: 'ephemeral' }
  → 固定的 system prompt 被缓存，每次只算输入 token 的 10%
  → 每轮对话节省约 70-90% 的输入费用
```

### 3. `core/tools.ts` — 工具注册和执行

```
职责：
  - 维护工具列表（供 API 调用时传入）
  - 执行工具调用，返回结果
  - 路由到权限系统

工具格式（Anthropic tool_use）：
  {
    name: "bash",
    description: "...",
    input_schema: { type: "object", properties: { command: ... } }
  }
```

### 4. `core/permissions.ts` — 权限控制

```
职责：
  - 判断工具调用是否需要用户确认
  - 在终端展示"是否允许"提示
  - 记录用户的永久授权（"此次会话内不再询问"）

规则来源：
  - 内置白名单（git read-only 命令等）
  - 内置黑名单（rm -rf 等）
  - 用户在 config 里自定义的规则
```

### 5. `memory/` — 记忆系统

```
memory/
  index.ts         — 加载 MEMORY.md，选择相关 topic files
  dream.ts         — Dream 后台整理（触发、执行、锁）
  consolidation-prompt.ts  — Dream 的 4 阶段 prompt

存储位置：~/.claude-client/memory/{project-slug}/
```

### 6. `commands/` — 斜杠命令

```
每个命令是一个模块，导出：
  {
    name: 'commit',
    description: '创建 git commit',
    allowedTools: ['bash(git *)'],  // 工具白名单
    buildPrompt: (args) => string   // 生成发给 AI 的 prompt
  }

内置命令：/commit, /plan, /memory, /help
用户可在 ~/.claude-client/commands/ 里添加自定义命令
```

### 7. `config/` — 配置管理

```
配置文件：~/.claude-client/config.json

{
  "api_key": "sk-ant-...",        // 或从 ANTHROPIC_API_KEY 环境变量读
  "model": "claude-opus-4-6",     // 默认模型
  "fast_model": "claude-sonnet-4-6",  // 轻量任务用
  "memory_enabled": true,
  "dream_enabled": true,
  "dream_min_hours": 24,
  "dream_min_sessions": 5
}
```

---

## System Prompt 结构

为了最大化 prompt cache 命中，system prompt 必须稳定：

```
[固定部分 — 加 cache_control，强缓存]
  你是一个 AI 编程助手...
  工具使用规则...
  安全规则...

[半固定部分 — 项目级 CLAUDE.md，加 cache_control]
  项目背景...
  约定...

[动态部分 — 每轮可能变化，不缓存]
  当前日期：...
  当前目录：...
  相关记忆：...（由 memory/index.ts 动态选择）
```

固定部分变了就 cache miss，所以绝对不能把当前时间放进去。

---

## 数据流：一次工具调用的完整流程

```
用户："帮我写一个 hello world"
  ↓
REPL 构建请求
  messages: [{ role: 'user', content: '帮我写一个 hello world' }]
  tools: [bash, read, write, edit, glob, grep]
  ↓
API 返回 tool_use
  { type: 'tool_use', name: 'write', input: { path: 'hello.js', content: '...' } }
  ↓
permissions.check('write', { path: 'hello.js' })
  → 需要确认（写文件）
  → 终端显示："是否允许写入 hello.js？[y/n]"
  ↓
用户输入 y
  ↓
工具执行：writeFile('hello.js', '...')
  ↓
REPL 把结果加回 messages
  { role: 'tool', tool_use_id: '...', content: '文件已写入' }
  ↓
继续下一轮 API 调用
  ↓
API 返回最终文本回答
  ↓
终端显示
```

---

## 目录结构

```
claude-client/
  src/
    core/
      repl.ts           — 主循环
      api.ts            — Anthropic SDK 封装
      tools.ts          — 工具注册
      permissions.ts    — 权限系统
    tools/
      bash.ts
      read.ts
      write.ts
      edit.ts
      glob.ts
      grep.ts
    memory/
      index.ts          — 记忆加载
      dream.ts          — 后台整理
      consolidation-prompt.ts
    commands/
      commit.ts
      plan.ts
      memory.ts
      help.ts
    config/
      index.ts          — 配置读写
  docs/
    background/         — Claude Code 源码分析笔记
    architecture.md     — 本文件
    plan.md             — 开发计划
  package.json
  tsconfig.json
```
