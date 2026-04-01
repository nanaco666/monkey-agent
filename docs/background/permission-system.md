# 权限系统：多 Agent 协调的精妙设计

## 核心问题

多个 Agent 同时跑，其中某个需要用户授权（比如删文件）。
谁负责弹窗问用户？怎么保证只弹一次？用户回答后怎么通知正确的 Agent？

---

## 亮点 1：ResolveOnce — 竞态安全的一次性决议

**文件：** `hooks/toolPermission/PermissionContext.ts`

一个权限请求可能同时有多个"结束路径"：
- 用户同意了
- 用户拒绝了
- 用户中止了整个会话
- 超时了

如果两个路径同时触发，会调用两次 `resolve()`，导致状态混乱。

**解法：**
```
claim() — 原子性地"抢旗"

if (!claim()) return  ← 抢不到就直接退出

// 只有抢到旗的那一路才能执行
resolve(result)
```

`claim` 和 `resolve` 分开是有意为之：
- `claim()` 在 await 之前就执行（关闭时间窗口）
- `resolve()` 在异步操作完成后执行

这是并发编程里的经典"检查-标记"模式，但用在权限流里非常干净。

---

## 亮点 2：Swarm 权限同步 — 用目录做状态机

**文件：** `utils/swarm/permissionSync.ts`

多个 Worker Agent 可能同时需要权限，而主 Agent（Leader）负责弹窗问用户。

**没用消息队列，没用数据库，用的是文件夹：**

```
~/.claude/teams/
  ├── pending/        ← Worker 把权限请求写到这里
  └── resolved/       ← Leader 把决定写到这里，Worker 来取
```

Worker 写请求 → Leader 读取 → Leader 写决定 → Worker 轮询取结果

**为什么聪明：**
1. 目录结构本身就是可见的状态，随时可以 `ls` 查看有哪些 pending 请求
2. 文件操作在 Unix 上是原子的，天然防止竞态
3. 零依赖：不需要 Redis、RabbitMQ 之类的基础设施

Leader 处理请求前用文件锁（`lockfile.lock`）保证原子写入，防止多个 Worker 同时写导致内容损坏。

---

## 亮点 3：SwarmWorkerHandler — 三路竞争的权限握手

**文件：** `hooks/toolPermission/handlers/swarmWorkerHandler.ts`

Worker 发出权限请求后，可能发生三件事之一：
1. Leader 说"允许"
2. Leader 说"拒绝"
3. 用户中止了整个会话

**关键细节：先注册回调，再发请求。**

```
注册 onAllow 回调   ← 先注册
注册 onReject 回调  ← 先注册
注册 abort 监听器   ← 先注册

发出权限请求        ← 后发送
```

顺序反了就有 bug：如果先发请求，Leader 极速响应，回调还没注册，响应就丢了。

三路竞争都用 `claim()` 保护，确保只有第一个到达的路径生效。

---

## 亮点 4：政策限制的 Fail-Open 策略

**文件：** `services/policyLimits/index.ts`

企业客户（HIPAA 等）有管理员配置的策略，从远程服务器拉取。
如果网络抖动，拉取失败了，怎么办？

**两种思路的取舍：**
- Fail-Closed（拒绝一切）→ 安全，但网络问题直接让工具瘫痪
- Fail-Open（允许一切）→ 体验好，但可能违反安全策略

**他们的解法：分情况：**
```
普通策略：   网络失败 → 用缓存 → 没缓存 → 允许（fail open）
安全敏感策略：网络失败 → 用缓存 → 没缓存 → 拒绝（fail closed）
```

ESSENTIAL_TRAFFIC_DENY_ON_MISS 这个集合里的策略（如 HIPAA 下禁用产品反馈）
即使缓存不存在也会拒绝，其他策略则 fail open。

细节：用 ETag 做 HTTP 缓存，后台每小时轮询一次，不阻塞主流程。
