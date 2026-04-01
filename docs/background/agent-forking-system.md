# Agent 分叉系统：子 Agent 的隔离与通信

## 核心设计问题

派生一个子 Agent 时，有两个相反的需求：
- **隔离**：子 Agent 不能误改父 Agent 的状态（UI、权限上下文、中止信号）
- **共享**：某些情况下需要联动（比如用户按 Ctrl+C，所有子 Agent 都要停）

---

## 亮点 1：SubagentContextOverrides — 显式 opt-in 共享

**文件：** `utils/forkedAgent.ts`

默认：子 Agent 完全隔离，所有状态克隆一份。
需要共享时：显式传入 flag。

```
shareAbortController?: boolean   ← 要不要让 Ctrl+C 同时停掉子 Agent？
shareSetAppState?: boolean        ← 要不要让子 Agent 能更新 UI？
shareSetResponseLength?: boolean  ← 要不要共享响应长度计数？
```

**为什么这样设计：**
- 默认隔离 = 默认安全，不会意外污染
- 显式 opt-in = 调用方必须主动思考"我需要共享什么"
- 新增场景只需加 flag，不需要改核心逻辑

---

## 亮点 2：In-Process Runner — AsyncLocalStorage 隔离

**文件：** `utils/swarm/inProcessRunner.ts`

Swarm 中的 Teammate Agent 可以在同一个进程内运行（快），也可以在远程运行（可扩展）。

同进程内运行的挑战：Node.js 没有线程本地变量，不同 Agent 的状态可能互相污染。

**解法：AsyncLocalStorage**
```
每个 Teammate 创建一个 AsyncLocalStorage 上下文
所有异步操作都在这个上下文里跑
不同 Teammate 的上下文互不可见
```

类比：Java 的 ThreadLocal，但用在异步环境里。
用文件系统（Mailbox）做跨上下文通信，而不是共享内存。

---

## 亮点 3：FlushGate — 有状态的消息队列门控

**文件：** `bridge/flushGate.ts`

Bridge 启动时，要把历史消息作为一个原子请求发送出去。
在这段时间里，新消息必须排队等待，不能插进去乱序。

普通做法：加一个 `isReady` flag，新消息来了先检查再决定是否入队。

**他们的做法：FlushGate**
```
enqueue()   ← active 时直接入队，inactive 时返回 false
deactivate() ← 关闭输入但保留已有的 pending 消息
flush()      ← 把 pending 全部取走
drop()       ← 清空 pending（放弃）
```

`deactivate()` 和 `drop()` 的区别是关键：
- `drop()` = 丢弃，什么都不要了
- `deactivate()` = 停止接收新的，但保留已有的，等新传输接管后再 flush

这使得传输层可以在不丢消息的情况下被替换（断线重连场景）。

---

## 亮点 4：Agent 颜色管理

**文件：** `tools/AgentTool/agentColorManager.ts`

多个 Agent 并行跑，UI 上需要区分谁是谁。

**不是随机分配颜色，而是：**
- 维护一个已使用颜色的集合
- 新 Agent 选择视觉差异最大的颜色
- Agent 结束后，颜色回收可以复用

用户看到的效果：即使有 10 个 Agent 并行，颜色之间也尽量好区分，
不会出现两个相邻的 Agent 都是蓝色。

这是个小细节，但体现了"从用户体验出发"的思维——颜色不是技术问题，是可用性问题。

---

## 亮点 5：agentMemory — Agent 间的知识传递

**文件：** `tools/AgentTool/agentMemory.ts`

父 Agent 派生子 Agent 时，可以选择把哪些记忆传给子 Agent。

```
父 Agent 的记忆：
  - 用户偏好 A
  - 项目背景 B
  - 当前任务 C

子 Agent 需要什么？
  → 只传任务相关的 B 和 C
  → 不传 A（子 Agent 不需要知道用户偏好）
```

子 Agent 独立运行，但继承了足够的上下文，不需要从头探索。
同时，不相关的记忆不传，节省 token，也防止子 Agent 被无关信息干扰。
