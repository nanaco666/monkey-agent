# Prompt Cache 工程：省钱的系统性设计

## 背景

调用 AI API 的成本 = 输入 token 数 × 单价。
一次对话可能有很长的 system prompt + 历史消息，每次调用都全量发送，成本极高。

Anthropic 提供"提示缓存"：如果请求的前缀和上次完全一致（byte-identical），
直接复用，输入成本降到约 1/10。

**关键词：byte-identical。差一个字节都不行。**

---

## 亮点 1：CacheSafeParams — 缓存共享的全局插槽

**文件：** `utils/forkedAgent.ts`

后台会派生很多子 Agent（Dream、记忆提取、推测执行等），
它们都想复用主对话的 prompt cache。

**问题：** 每个子 Agent 都要手动传入"需要缓存的参数"，API 变得很复杂，而且容易漏传。

**解法：**
```
主 Agent 跑完一轮后，把参数保存到全局插槽：
  saveCacheSafeParams(params)

任何后台 Agent 需要时，直接取：
  getLastCacheSafeParams()
```

这是"线程本地变量"的思路，但没有线程，用全局 + 生命周期钩子实现。
子 Agent 不需要知道参数从哪来，只要取就行。

---

## 亮点 2：克隆 contentReplacementState 而非共享

**文件：** `utils/forkedAgent.ts`

消息里的 tool_use_id（工具调用 ID）在发送给 API 前可能被替换/脱敏处理。
这个处理逻辑记录在 `contentReplacementState` 里。

**如果子 Agent 共享父 Agent 的 state：**
```
父：处理了 id_001 → 记录到 state
子：看到 state 里已有 id_001 → 认为"我也处理过了" → 跳过
→ 子 Agent 的 API 请求和父不一致 → 缓存失效
```

**所以要克隆：**
```
子 Agent 拿到一份 state 的副本
从头开始处理，做出和父一样的决策
→ 两者 API 请求 byte-identical → 缓存命中
```

看似多此一举，实则是缓存命中率的关键保障。

---

## 亮点 3：记忆提取用 Fork 而非新会话

**文件：** `services/extractMemories/extractMemories.ts`

每次对话结束后，需要从这次对话里提取值得永久保存的知识。
这本身又是一次 AI 调用。

**如果开一个全新会话：**
- system prompt 重新发一遍 → 全量 token 计费
- 历史消息重新发一遍 → 全量 token 计费

**如果 Fork 当前会话：**
- system prompt 和父一样 → 缓存命中，只计 1/10 费用
- 消息前缀和父一样 → 缓存命中
- 只有新增的"提取任务指令"需要计费

一次 Fork = 极低成本完成后台智能任务。

---

## 亮点 4：FindRelevantMemories — 用 AI 选 AI 的记忆

**文件：** `memdir/findRelevantMemories.ts`

用户发一条消息，系统要决定把哪些记忆文件加载到上下文里。
记忆文件可能有几十个，全加载进去 token 爆炸。

**普通做法：** 关键词匹配，或者向量相似度搜索（需要 embedding 模型）。

**他们的做法：** 用 Sonnet 来选。
```
给 AI 一个清单：
  - user-role.md：用户是数据科学家
  - feedback-testing.md：不要 mock 数据库
  - project-filo.md：主要项目是 filo-chat
  ...（只是文件名 + 一句话描述）

问 AI：这个问题最相关的是哪几个？
AI 返回：project-filo.md, feedback-testing.md

只加载这两个文件
```

**为什么比向量搜索好：**
- 不需要额外的 embedding 基础设施
- AI 能理解语义上的关联，不依赖关键词重合
- 消耗的 token 很少（只是文件名清单，不是文件内容）

还有一个细节：`alreadySurfaced` 过滤器，本次对话已经加载过的记忆不再重复加载，
避免把 5 个 slot 都浪费在同一批文件上。
