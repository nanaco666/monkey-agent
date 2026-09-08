/** Single-user runtime shared by all authenticated mobile/web/desktop clients. */
import { randomUUID } from 'node:crypto'
import type { Config } from '../config/index.js'
import { streamResponse } from '../core/api.js'
import { shouldCompact, compactMessages } from '../core/compact.js'
import { executeTool } from '../tools/index.js'
import type { ContentBlock } from '../providers/types.js'
import { createSession, loadSession, saveSession, deleteSession, listSessions, type Session } from '../session/store.js'
import { findCommand } from '../commands/index.js'
import { KeyboardService } from '../keyboard/service.js'

export type Data = Record<string, any>
export class RpcError extends Error {
  constructor(public code: number, message: string) { super(message) }
}
export interface Row { role: string; content: string; toolId?: string; toolName?: string }
export function serialize(messages: Session['messages']): Row[] {
  return messages.flatMap(message => typeof message.content === 'string'
    ? [{ role: message.role, content: message.content }]
    : message.content.map((block): Row => {
      switch (block.type) {
        case 'text': return { role: message.role, content: block.text }
        case 'image': return { role: 'user', content: '[图片附件]' }
        case 'tool_use': return { role: 'tool', toolId: block.id, toolName: block.name, content: JSON.stringify(block.input) }
        case 'tool_result': return { role: 'tool', toolId: block.tool_use_id, content: block.content.slice(0, 2000) }
      }
    }))
}
interface Approval { id: string; name: string; input: Data; resolve: (allow: boolean) => void }
interface Run {
  id: string; initialLength: number; abort: AbortController; text: string; approval?: Approval;
  tools: Data[]; usage: Data; finished?: Promise<void>
}
const MUTATING = new Set(['bash', 'write', 'edit', 'notes', 'reminders'])
const MAX_TEXT = 200_000
function requiredString(value: unknown, name: string, max = MAX_TEXT): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new RpcError(-32602, `Invalid ${name}`)
  return value
}
function attachments(value: unknown): ContentBlock[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 4) throw new RpcError(-32602, '最多添加 4 个附件')
  return value.map((a): ContentBlock => {
    if (!a || typeof a !== 'object') throw new RpcError(-32602, 'Invalid attachment')
    const name = requiredString(a.name, 'filename', 200)
    if (a.isImage === true) {
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(a.mediaType)) throw new RpcError(-32602, '不支持的图片格式')
      const data = requiredString(a.data, 'image', 4_000_000)
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 !== 0) throw new RpcError(-32602, 'Invalid base64')
      return { type: 'image', source: { type: 'base64', media_type: a.mediaType, data } }
    }
    return { type: 'text', text: `[File: ${name}]\n${requiredString(a.content, 'file content')}` }
  })
}

export class MonkeyRuntime {
  private sessions = new Map<string, Session>()
  private runs = new Map<string, Run>()
  private listeners = new Set<(event: Data) => void>()
  private keyboard: KeyboardService
  constructor(private config: Config, private memory = '', private deps = { stream: streamResponse, tool: executeTool }) { this.keyboard = new KeyboardService(config) }
  subscribe(listener: (event: Data) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private emit(method: string, params: Data) { for (const listener of this.listeners) listener({ jsonrpc: '2.0', method, params }) }
  private session(id: unknown): Session {
    const key = requiredString(id, 'sessionId', 100)
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) throw new RpcError(-32602, 'Invalid sessionId')
    const session = this.sessions.get(key) ?? loadSession(key)
    if (!session) throw new RpcError(-32004, '会话已不存在')
    this.sessions.set(key, session)
    return session
  }
  private idle(session: Session) {
    if (this.runs.has(session.id)) throw new RpcError(-32009, '会话仍在运行，请先停止任务')
  }
  private changed(session?: Session) {
    if (session) { saveSession(session); this.emit('session/state', this.snapshot(session)) }
    this.emit('sessions/changed', {})
  }
  private snapshot(session: Session): Data {
    const run = this.runs.get(session.id)
    return {
      sessionId: session.id, sessionTitle: session.title, model: session.model, wildMode: session.wildMode,
      messages: serialize(run ? session.messages.slice(0, run.initialLength) : session.messages), busy: !!run,
      run: run ? { id: run.id, text: run.text, tools: run.tools, usage: run.usage } : null,
      approval: run?.approval ? { id: run.approval.id, name: run.approval.name, input: run.approval.input } : null,
    }
  }
  async request(method: string, params: Data = {}): Promise<Data> {
    if (!params || Array.isArray(params) || typeof params !== 'object') throw new RpcError(-32602, 'Invalid params')
    if (method === 'initialize') {
      return { name: this.config.assistant_name || 'Monkey', protocolVersion: 1, sessions: listSessions(),
        models: [...new Set([this.config.model, this.config.fast_model])].map(id => ({ id, alias: id })),
        capabilities: { attachments: true, approvals: true, concurrentSessions: true }, memoryLoaded: !!this.memory }
    }
    if (method === 'keyboard_profile_get') return { profile: this.keyboard.profile() }
    if (method === 'keyboard_profile_save') return { profile: this.keyboard.save(params.profile) }
    if (method === 'keyboard_remember') return { profile: this.keyboard.remember(params.note) }
    if (method === 'keyboard_generate') return this.keyboard.generate(params)
    if (method === 'session_list') return { sessions: listSessions() }
    if (method === 'session_new') {
      const session = createSession(this.config.model, false)
      this.sessions.set(session.id, session); this.changed()
      return this.snapshot(session)
    }
    const session = this.session(params.sessionId)
    if (method === 'session_get') return this.snapshot(session)
    if (method === 'abort') {
      const run = this.runs.get(session.id)
      run?.abort.abort(); run?.approval?.resolve(false)
      return { aborted: !!run }
    }
    if (method === 'approval_respond') {
      const approval = this.runs.get(session.id)?.approval
      if (!approval || approval.id !== params.approvalId || typeof params.allow !== 'boolean') throw new RpcError(-32602, '确认已失效')
      approval.resolve(params.allow)
      return { accepted: true }
    }
    this.idle(session)
    switch (method) {
      case 'session_rename':
        session.title = requiredString(params.title, 'title', 100).trim(); this.changed(session); return this.snapshot(session)
      case 'session_delete':
        deleteSession(session.id); this.sessions.delete(session.id); this.changed(); return { deleted: true }
      case 'clear':
        session.messages = []; this.changed(session); return this.snapshot(session)
      case 'set_model':
        session.model = requiredString(params.model, 'model', 200).trim(); this.changed(session); return this.snapshot(session)
      case 'set_wild':
        if (typeof params.wild !== 'boolean') throw new RpcError(-32602, 'Invalid wild mode')
        session.wildMode = params.wild; this.changed(session); return this.snapshot(session)
      case 'chat': {
        const blocks = attachments(params.attachments)
        let prompt = typeof params.prompt === 'string' ? params.prompt.trim() : ''
        if (prompt.length > MAX_TEXT || (!prompt && !blocks.length)) throw new RpcError(-32602, '请输入消息')
        const keyboardNote = /^(?:\/keyboard-note\s+|记住键盘偏好[：:]\s*)([\s\S]+)$/.exec(prompt)
        if (keyboardNote) {
          this.keyboard.remember(keyboardNote[1])
          session.messages.push({ role: 'user', content: prompt }, { role: 'assistant', content: '已保存到 Monkey Keyboard 偏好，之后生成候选会使用。可以在键盘 App 的偏好设置中查看和修改。' })
          this.changed(session)
          return { accepted: true, completed: true }
        }
        let allowedTools: string[] | undefined
        if (prompt.startsWith('/')) {
          const [name, ...rest] = prompt.slice(1).split(/\s+/)
          const command = findCommand(name)
          if (!command) throw new RpcError(-32602, '支持 /plan、/commit、/memory，其他操作请使用设置')
          prompt = command.buildPrompt(rest.join(' ')); allowedTools = command.allowedTools
        }
        if (prompt) blocks.unshift({ type: 'text', text: prompt })
        session.messages.push({ role: 'user', content: blocks })
        this.changed(session)
        const run: Run = { id: randomUUID(), initialLength: session.messages.length, abort: new AbortController(), text: '', tools: [], usage: {} }
        this.runs.set(session.id, run)
        this.emit('session/state', this.snapshot(session))
        run.finished = this.chat(session, run, allowedTools)
        return { accepted: true, runId: run.id }
      }
      default: throw new RpcError(-32601, `Unknown method: ${method}`)
    }
  }
  private async approve(session: Session, run: Run, name: string, input: Data): Promise<boolean> {
    if (session.wildMode || !MUTATING.has(name)) return true
    return new Promise(resolve => {
      let settled = false
      const finish = (allow: boolean) => {
        if (settled) return
        settled = true; clearTimeout(timeout); run.abort.signal.removeEventListener('abort', cancel)
        run.approval = undefined
        this.emit('approval/cleared', { sessionId: session.id })
        resolve(allow)
      }
      const cancel = () => finish(false)
      const timeout = setTimeout(cancel, 120_000)
      run.approval = { id: randomUUID(), name, input, resolve: finish }
      run.abort.signal.addEventListener('abort', cancel, { once: true })
      this.emit('approval/request', { sessionId: session.id, id: run.approval.id, name, input })
      if (run.abort.signal.aborted) cancel()
    })
  }
  private async chat(session: Session, run: Run, allowedTools?: string[]): Promise<void> {
    const config = { ...this.config, model: session.model }
    let partial = ''
    let error: string | undefined
    const notify = (method: string, params: Data) => this.emit(method, { ...params, sessionId: session.id, runId: run.id })
    try {
      for (let iteration = 0; iteration < 50; iteration++) {
        if (run.abort.signal.aborted) break
        partial = ''
        const response = await this.deps.stream(config, session.messages, text => {
          partial += text; run.text += text; notify('stream/text', { text })
        }, () => {}, this.memory, allowedTools, run.abort.signal)
        if (partial) session.messages.push({ role: 'assistant', content: partial })
        partial = ''
        for (const key of ['inputTokens', 'outputTokens', 'cacheReadTokens'] as const) run.usage[key] = (run.usage[key] || 0) + response[key]
        run.usage.requests = iteration + 1
        notify('stream/usage', run.usage)
        if (run.abort.signal.aborted || !response.toolUses.length) break
        const toolBlocks: ContentBlock[] = response.toolUses.map(tool => ({ type: 'tool_use', ...tool }))
        session.messages.push({ role: 'assistant', content: toolBlocks })
        const results: ContentBlock[] = []
        // Every tool_use receives a result, even when cancelled or rejected.
        for (const tool of response.toolUses) {
          const entry: Data = { id: tool.id, name: tool.name, summary: JSON.stringify(tool.input).slice(0, 500), status: 'running' }
          run.tools.push(entry); notify('stream/tool_start', entry)
          let result = 'Error: task cancelled'
          if (!run.abort.signal.aborted) {
            if (allowedTools && !allowedTools.includes(tool.name)) result = 'Error: tool not allowed for this command'
            else if (!await this.approve(session, run, tool.name, tool.input)) result = 'Error: permission denied or expired'
            else if (!run.abort.signal.aborted) {
              try { result = await this.deps.tool(tool.name, tool.input, run.abort.signal) }
              catch (err) { result = `Error: ${err instanceof Error ? err.message : String(err)}` }
            }
          }
          results.push({ type: 'tool_result', tool_use_id: tool.id, content: result })
          entry.status = result.startsWith('Error:') ? 'error' : 'done'; entry.result = result.slice(0, 2000)
          notify('stream/tool_result', entry)
        }
        session.messages.push({ role: 'user', content: results })
        this.changed(session)
        if (iteration === 49) error = '已达到本次任务的工具轮次上限，可以发送新消息继续。'
      }
    } catch (err) {
      if (partial) session.messages.push({ role: 'assistant', content: partial })
      if (!run.abort.signal.aborted) error = err instanceof Error ? err.message : String(err)
    } finally {
      if (!run.abort.signal.aborted && shouldCompact(run.usage.inputTokens || 0)) {
        try {
          const compacted = await compactMessages(config, session.messages)
          session.messages = compacted.messages
          notify('stream/compacted', { knowledgeSaved: compacted.knowledgeSaved })
        } catch { /* preserve complete history if compaction fails */ }
      }
      run.approval?.resolve(false)
      this.runs.delete(session.id)
      this.changed(session)
      notify('run/done', { aborted: run.abort.signal.aborted, error })
      this.emit('session/state', this.snapshot(session))
    }
  }
  async close() {
    const runs = [...this.runs.values()]
    for (const run of runs) { run.abort.abort(); run.approval?.resolve(false) }
    await Promise.allSettled(runs.map(run => run.finished))
  }
}
