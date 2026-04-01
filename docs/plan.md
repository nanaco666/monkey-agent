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

## Phase 3 — 记忆系统（目标：1 天）

**目标：** 对话信息持久化，下次启动自动加载相关背景

### 文件结构
```
~/.claude-client/
  memory/
    {project-slug}/
      MEMORY.md           — 索引
      user-role.md        — 用户背景
      project-xxx.md      — 项目信息
      feedback-xxx.md     — 偏好反馈
      sessions/
        2026-04-01.jsonl  — 当天对话记录
```

### 任务清单

- [ ] `memory/index.ts`：
  - 读取 `MEMORY.md` 作为基础上下文（每次都加载）
  - 读取所有 topic 文件的 frontmatter（name + description）
  - 用 API 调用小模型（sonnet）选出最相关的 ≤5 个文件
  - 把选中文件的内容拼入 system prompt 动态部分
- [ ] `memory/session.ts`：每轮对话 append 到当天的 JSONL 文件
- [ ] `core/repl.ts`：对话结束时检测到 AI 提到"记住"/"我注意到"等，触发写记忆

**验收：**
```bash
# 第一次
> 我不喜欢你在回答末尾总结
[Claude 把这个偏好写入 feedback-response-style.md]

# 重新启动后
> 帮我写代码
[Claude 不再在末尾总结，因为加载了偏好记忆]
```

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

## Phase 5 — 斜杠命令（目标：半天）

**目标：** 常用操作一键触发，有明确的工具权限边界

### 内置命令

| 命令 | 功能 | 工具白名单 |
|------|------|-----------|
| `/commit` | 生成 git commit | `bash(git *)` only |
| `/plan` | 进入计划模式，只读不写 | `read, glob, grep` only |
| `/memory` | 查看/编辑当前记忆 | 打开 MEMORY.md |
| `/help` | 显示所有命令 | 无 |
| `/model <name>` | 切换模型 | 无 |
| `/clear` | 清空当前对话历史 | 无 |

### 任务清单

- [ ] `commands/` 目录结构，每个命令一个文件
- [ ] `core/repl.ts` 中识别 `/` 开头的输入并路由
- [ ] 每个命令模块导出统一接口：`{ name, description, allowedTools, buildPrompt }`
- [ ] 支持用户在 `~/.claude-client/commands/` 放自定义命令脚本

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
