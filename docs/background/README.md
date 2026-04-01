# Claude Code 源码分析笔记

来源：sorrycc 用 extract-sourcemap 工具从线上 bundle 还原的 Claude Code 前端源码。

## 文件索引

| 文件 | 内容 |
|------|------|
| [dream-flow.md](dream-flow.md) | Dream 记忆整理的完整流程：触发条件、4 个阶段、配置参数 |
| [dream-tech-highlights.md](dream-tech-highlights.md) | Dream 的 6 个技术亮点：mtime 复用、崩溃恢复、PID 复用保护等 |
| [permission-system.md](permission-system.md) | 权限系统：ResolveOnce 竞态保护、目录状态机、Fail-Open 策略 |
| [prompt-cache-engineering.md](prompt-cache-engineering.md) | Prompt 缓存工程：CacheSafeParams、Fork 复用缓存、AI 选记忆 |
| [agent-forking-system.md](agent-forking-system.md) | Agent 分叉：隔离 vs 共享的 opt-in 设计、FlushGate、颜色管理 |
| [config-validation-patterns.md](config-validation-patterns.md) | 配置验证：整体验证、双重缓存、消息转换层解耦 |

## 核心设计主题

1. **原子性而非锁**：ResolveOnce、文件目录状态机
2. **默认隔离、显式共享**：SubagentContextOverrides 的 opt-in 设计
3. **Fail-Open with 例外**：普通策略宽松，安全策略严格
4. **缓存作为一等公民**：系统性地让所有后台 Agent 复用 prompt cache
5. **用文件系统做 IPC**：不引入 MQ，用目录结构表达状态
6. **整体验证或全拒绝**：不接受部分有效的配置
7. **命名即文档**：`_CACHED_MAY_BE_STALE` 这类命名约定
