# Claude Client — 开发计划

## 语言 & 技术栈

| 项目 | 选择 | 理由 |
|------|------|------|
| 语言 | TypeScript | Anthropic 官方 SDK 最完善，类型安全 |
| 运行时 | Node.js 20+ | 成熟，文件系统 API 完备 |
| 终端 UI | 原生 readline + chalk | 保持简单，不引入重依赖 |
| 包管理 | pnpm | 快，磁盘占用小 |
| 测试 | vitest | 速度快 |

---

## Phase 1 — 能跑起来（目标：1 天）

**目标：** 在终端里和 Claude 对话，Claude 能读写文件和执行命令

### 任务清单

- [ ] 初始化项目（package.json, tsconfig.json）
- [ ] 安装依赖：`@anthropic-ai/sdk`, `chalk`, `readline`
- [ ] `config/index.ts`：读取 API Key（config.json 或 ANTHROPIC_API_KEY）
- [ ] `core/api.ts`：封装 Anthropic SDK，支持流式输出
- [ ] `tools/bash.ts`：执行 shell 命令，返回 stdout/stderr
- [ ] `tools/read.ts`：读取文件内容
- [ ] `tools/write.ts`：写入文件
- [ ] `tools/edit.ts`：精确字符串替换（old_string → new_string）
- [ ] `tools/glob.ts`：文件模式匹配
- [ ] `tools/grep.ts`：内容搜索
- [ ] `core/tools.ts`：注册所有工具，生成 Anthropic 格式的 tools 数组
- [ ] `core/repl.ts`：主循环（输入 → API → 工具执行 → 循环）
- [ ] 入口 `src/index.ts`：启动 REPL

**验收：**
```bash
npx ts-node src/index.ts
> 帮我在当前目录创建一个 hello.ts 文件
[Claude 调用 write 工具，文件被创建]
```

---

## Phase 2 — 权限系统（目标：半天）

**目标：** 执行危险操作前询问用户，不会误删文件

### 任务清单

- [ ] `core/permissions.ts`：规则引擎
  - 白名单（自动允许）：`git status`, `git diff`, `cat`, `ls`, `grep` 等只读命令
  - 黑名单（永远拒绝）：`rm -rf /`, `git push --force` 到 main 等
  - 灰名单（需确认）：写文件、删除、执行脚本
- [ ] 在 `core/repl.ts` 的工具执行前接入权限检查
- [ ] 终端 `[y/n/always]` 提示：`y`=本次允许，`n`=拒绝，`always`=会话内不再问
- [ ] 会话级记忆：用户选 `always` 后存在内存里，会话结束清除

**验收：**
```bash
> 删除 test.txt
权限请求：是否允许执行 rm test.txt？[y/n/always] n
Claude: 好的，已取消删除操作。
```

---

## Phase 3 — 记忆系统 ✓ 已完成

**目标：** 对话信息持久化，下次启动自动加载相关背景

### 文件结构
```
~/.monkey-cli/
  memory/
    {project-slug}/
      MEMORY.md           — 自动维护的索引
      *.md                — topic 文件（user/feedback/project/reference）
      sessions/
        2026-04-01.jsonl  — 当天对话记录
```

### 实现

- [x] `src/memory/slug.ts` — 从 git root 或 cwd 生成项目标识
- [x] `src/memory/store.ts` — 读写 memory 文件，自动更新 MEMORY.md 索引
- [x] `src/memory/context.ts` — 启动时加载 MEMORY.md，用 fast_model 选最相关 ≤5 个文件注入 system prompt
- [x] `src/tools/memory.ts` — `memory_write` 工具，AI 主动调用保存记忆
- [x] `core/repl.ts` — 每轮对话 append 到 sessions JSONL
- [x] system prompt 注入 memory 路径，AI 可用 read 工具直接读取

### 设计决策

- AI 通过 `memory_write` 工具主动写记忆，不靠关键词检测
- memory 路径明确注入 system prompt，AI 不需要猜路径
- Do NOT use bash 搜索 memory 文件，用 read 工具 + 已知路径
- topic 文件超过 5 个时，用 fast_model 选相关的，减少 token 消耗

---

## Phase 4 — Dream 后台整理（目标：1 天）

**目标：** 记忆自动整理，不需要手动管理

### 任务清单

- [ ] `memory/consolidation-prompt.ts`：4 阶段 prompt（直接参考 background/dream-flow.md）
- [ ] `memory/dream.ts`：
  - 锁机制（用文件 mtime 当时间戳，参考 dream-tech-highlights.md）
  - 触发条件检查（时间门 + 会话数门 + 锁门）
  - Fork 一个独立 API 调用跑 consolidation prompt
  - 崩溃回滚（priorMtime）
- [ ] 在 REPL 退出时触发 Dream 检查（异步，不阻塞退出）

**验收：**
```bash
# 跑了 5+ 次对话，且距上次整理 24h 后
[退出时后台静默触发 Dream，MEMORY.md 被自动更新]
```

---

## Phase 5 — 斜杠命令 ✓ 已完成

**目标：** 常用操作一键触发，有明确的工具权限边界

### 内置命令

| 命令 | 功能 | 工具白名单 |
|------|------|-----------|
| `/commit` | 生成 git commit | `bash` only |
| `/plan` | 进入计划模式，只读不写 | `read, glob, grep` only |
| `/memory` | 查看/管理当前记忆 | `read, memory_write` only |
| `/help` | 显示所有命令 | 无 |
| `/model` | 显示当前模型 | 无 |
| `/clear` | 清空当前对话历史 | 无 |
| `/wild` | 解锁危险命令 🐒 | 无 |
| `/tame` | 恢复安全模式 | 无 |

### 实现

- [x] `src/commands/` 目录，每个命令一个文件
- [x] `core/repl.ts` 中识别 `/` 开头并路由
- [x] 每个命令导出统一接口：`{ name, description, allowedTools, buildPrompt }`
- [x] 斜杠命令作为独立 one-shot 对话运行，不污染主 messages 历史
- [x] `streamResponse` 支持 `allowedTools` 参数过滤工具

---

## Phase 6 — 打磨体验（持续）

- [ ] 流式输出时显示 token 用量和当前费用
- [ ] 工具执行显示简洁的进度（正在读取 xx 文件...）
- [ ] `/history` 查看历史对话列表并可恢复
- [ ] 支持 `--project` 参数指定项目 slug，隔离不同项目的记忆
- [ ] 支持 CLAUDE.md（在当前目录自动读取，加入 system prompt）

---

## 开发顺序总结

```
Week 1
  Day 1：Phase 1（核心跑通）
  Day 2 上午：Phase 2（权限系统）
  Day 2 下午 + Day 3：Phase 3（记忆系统）
  Day 4：Phase 4（Dream）
  Day 5 上午：Phase 5（斜杠命令）
  Day 5 下午：整合测试，修 bug

Week 2+
  按需做 Phase 6 的各项优化
```

---

## 关键技术决策

### API Key 配置优先级
```
1. 命令行参数 --api-key
2. 环境变量 ANTHROPIC_API_KEY
3. ~/.claude-client/config.json 里的 api_key
```

### Prompt Cache 实现
```typescript
// system prompt 的固定部分加上这个标记
{
  type: 'text',
  text: SYSTEM_PROMPT,
  cache_control: { type: 'ephemeral' }
}
```
固定部分不要放任何动态内容（时间、路径等），否则每次都 cache miss。

### 工具执行超时
- Bash 命令默认 30s 超时，可在 config 里调
- 超时后发送 SIGTERM，3s 后 SIGKILL
- 超时信息返回给 Claude，让它决定下一步

### 错误处理原则
- 工具执行失败：把错误信息返回给 Claude，不要终止对话
- API 调用失败：重试 3 次，指数退避，最终报错给用户
- 权限拒绝：返回拒绝消息，Claude 自动调整策略
