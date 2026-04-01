# 配置与验证模式：防御性工程设计

## 核心思想

远程下发的配置由运维人员操作，容易出错。
坏配置比没有配置更危险——它会导致系统行为异常且难以排查。
所以验证必须严格，要么全量接受，要么全量拒绝。

---

## 亮点 1：PollConfig 的整体验证

**文件：** `bridge/pollConfig.ts`

Bridge 的轮询配置通过远程 Feature Flag 系统（GrowthBook）下发。
配置里有多个字段，而且字段之间有逻辑约束。

**两层验证：**

```
字段级：
  poll_interval_ms >= 100   ← 不能太小，否则 busy-loop
  heartbeat_interval_ms >= 100   ← 同上

对象级（整体一致性）：
  NOT (heartbeat = 0 AND poll_at_capacity = 0)
  ← 不能两个 liveness 机制同时禁用，否则连接静默断开
```

任何一条不满足 → 整个配置被拒绝 → 回退到默认配置

**为什么是整体验证而不是逐字段修复：**
- 部分有效的配置是最危险的——某些功能正常，某些功能异常，极难排查
- 全拒绝让问题立即暴露，运维人员会立刻发现并修复

---

## 亮点 2：GrowthBook 缓存的防御性读取

**文件：** `services/policyLimits/index.ts`

GrowthBook 是远程 Feature Flag 服务，返回的值可能因为网络问题是 stale（过期）的。

代码注释里写了：`CACHED_MAY_BE_STALE`

这是一个**命名约定作为文档**的例子：
```typescript
getFeatureValue_CACHED_MAY_BE_STALE('tengu_onyx_plover', null)
```

函数名本身就警告调用者：这个值可能是旧的。
不需要看文档，不需要注释，函数签名就告诉你了。

在关键决策路径上，看到这个函数名就知道要小心，不能做强一致性假设。

---

## 亮点 3：PolicyLimits 的双重缓存策略

**文件：** `services/policyLimits/index.ts`

企业策略配置的拉取流程：

```
启动时：同步拉取（阻塞，确保首次可用）
后台：每小时异步刷新（不阻塞主流程）
网络失败：用内存缓存
内存缓存也没有：用磁盘缓存
磁盘缓存也没有：fail open（普通策略）/ fail closed（安全策略）
```

HTTP 请求附带 ETag，服务端可以返回 304 Not Modified，减少带宽消耗。

四层降级（远程 → 内存缓存 → 磁盘缓存 → 默认值），每一层都有明确的处理逻辑。

---

## 亮点 4：消息转换层 — SDK 与内部格式解耦

**文件：** `utils/messages/mappers.ts`

内部系统的消息格式和对外 SDK 的格式会随时间出现差异。
如果每次内部格式变化都要求 SDK 同步更新，发布周期会很痛苦。

**解法：转换层**

例子：`local_command_output` 是内部消息类型，移动端 SDK 不认识。
转换层把它变成 `assistant` 消息（附带特殊标记），SDK 正常解析。

```
内部：{ type: 'local_command_output', content: '...' }
SDK：{ type: 'assistant', message: { model: 'synthetic', content: '...' } }
```

内部格式自由演化，SDK 只看转换后的结果，两者解耦。
新增内部类型只需在转换层加处理，不需要发布新版 SDK。
