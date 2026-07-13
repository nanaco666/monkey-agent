/**
 * Monkey Daemon — Unix socket server for GUI <-> CLI communication.
 *
 * Run with: monkey daemon
 * Listens on ~/.monkey-cli/monkey.sock
 * Persists session state (conversation, wildMode) across GUI reconnects.
 */

import * as net from 'net'
import * as fs from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import { loadConfig, type Config } from '../config/index.js'
import type { ProviderConfig } from '../providers/types.js'
import { initProviders, streamResponse, type Message } from './api.js'
import { executeTool } from '../tools/index.js'
import { buildMemoryContext } from '../memory/context.js'
import { shouldCompact, compactMessages } from './compact.js'
import { cleanSessionsOnly } from '../memory/clean.js'
import type { ContentBlock } from '../providers/index.js'
import {
  createSession, loadSession, saveSession, deleteSession, listSessions,
  migrateAllSwiftSessions, type Session, type SessionMeta,
} from '../session/store.js'

export const SOCKET_PATH = join(homedir(), '.monkey-cli', 'monkey.sock')

type JsonDict = Record<string, unknown>

// ── Global session state (persists across GUI reconnects) ──────────────────

let config: ReturnType<typeof loadConfig> | null = null
let currentSession: Session | null = null
let memoryContext = ''
let wildMode = false
let requestId = 0
let activeAbortController: AbortController | null = null
let initialized = false

/** Shorthand for the current session's messages */
function messages(): Message[] {
  if (!currentSession) return []
  return currentSession.messages
}

/** Serialize messages for GUI: extract text content + tool info into a flat list */
function serializeMessages(msgs: Message[]): JsonDict[] {
  const result: JsonDict[] = []
  for (const m of msgs) {
    if (typeof m.content === 'string') {
      result.push({ role: m.role, content: m.content })
    } else {
      // ContentBlock[] — extract text and tool_use/tool_result
      let text = ''
      let toolName: string | undefined
      let toolId: string | undefined
      let isTool = false
      for (const block of m.content as ContentBlock[]) {
        if (block.type === 'text') {
          text += block.text
        } else if (block.type === 'tool_use') {
          isTool = true
          toolName = block.name
          toolId = block.id
          const summary = String(block.input.command ?? block.input.path ?? block.input.pattern ?? '').slice(0, 60)
          result.push({ role: 'tool', content: summary || toolName, toolName, toolId })
        } else if (block.type === 'tool_result') {
          // tool_result is in a user message — extract as tool message for display
          isTool = true
          result.push({ role: 'tool', content: block.content.slice(0, 300), toolId: block.tool_use_id })
        }
      }
      if (text) result.push({ role: m.role, content: text })
      else if (!isTool && m.role === 'assistant') {
        // assistant with no text? skip
      }
    }
  }
  return result
}

const MAX_ITERATIONS = 50

// ── Active socket (one GUI connection at a time) ───────────────────────────

let activeSocket: net.Socket | null = null

function send(obj: JsonDict): void {
  if (activeSocket?.writable) {
    try { activeSocket.write(JSON.stringify(obj) + '\n') } catch { /* socket may have closed */ }
  }
}

function sendResult(id: number, result: JsonDict): void {
  send({ jsonrpc: '2.0', id, result })
}

function sendError(id: number, code: number, message: string): void {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

// ── Message dispatcher ────────────────────────────────────────────────────

async function handleMessage(line: string): Promise<void> {
  let msg: JsonDict
  try { msg = JSON.parse(line) } catch { sendError(0, -32700, 'Parse error'); return }

  const id = msg.id as number | undefined
  const method = msg.method as string | undefined
  const params = (msg.params ?? {}) as JsonDict

  switch (method) {
    case 'initialize': {
      if (!initialized) {
        config = loadConfig()
        if (!config) { sendError(id ?? 0, -32001, 'No config. Run `monkey` in terminal first.'); return }
        initProviders(config)
        try { memoryContext = await buildMemoryContext(config, '') } catch { /* ok */ }
        const cleaned = cleanSessionsOnly()
        // One-time migration of Swift-format sessions
        const migrated = migrateAllSwiftSessions()
        if (migrated > 0) process.stderr.write(`[daemon] migrated ${migrated} Swift sessions\n`)
        initialized = true
        process.stderr.write(`[daemon] initialized, model=${config.model}, sessions cleaned=${cleaned.removed}\n`)
      }
      // Load most recent session, or create one
      const sessions = listSessions()
      if (sessions.length > 0) {
        currentSession = loadSession(sessions[0].id)
      }
      if (!currentSession) {
        currentSession = createSession(config!.model, false)
      }
      wildMode = currentSession.wildMode
      sendResult(id ?? 0, {
        model: config!.model,
        name: config!.assistant_name || 'Monkey',
        version: getVersion(),
        wildMode,
        memoryLoaded: !!memoryContext,
        resumed: messages().length > 0,
        messageCount: messages().length,
        sessionId: currentSession.id,
        sessionTitle: currentSession.title,
        models: getAvailableModels(config!),
      })
      break
    }

    case 'session_list': {
      const sessions = listSessions()
      if (id) sendResult(id, { sessions })
      break
    }

    case 'session_new': {
      // Save current session before switching
      if (currentSession) {
        currentSession.wildMode = wildMode
        currentSession.model = config?.model ?? currentSession.model
        saveSession(currentSession)
      }
      currentSession = createSession(config?.model ?? 'unknown', wildMode)
      if (id) sendResult(id, {
        sessionId: currentSession.id,
        sessionTitle: currentSession.title,
        messageCount: 0,
      })
      break
    }

    case 'session_switch': {
      const targetId = params.id as string
      if (!targetId) { sendError(id ?? 0, -32602, 'Missing session id'); return }
      // Save current session first
      if (currentSession) {
        currentSession.wildMode = wildMode
        currentSession.model = config?.model ?? currentSession.model
        saveSession(currentSession)
      }
      const loaded = loadSession(targetId)
      if (!loaded) { sendError(id ?? 0, -32603, 'Session not found'); return }
      currentSession = loaded
      wildMode = loaded.wildMode
      // Update model from session if it differs
      if (config && loaded.model) config.model = loaded.model
      if (id) sendResult(id, {
        sessionId: currentSession.id,
        sessionTitle: currentSession.title,
        messageCount: currentSession.messages.length,
        model: config?.model,
        wildMode,
        messages: serializeMessages(currentSession.messages),
      })
      break
    }

    case 'session_delete': {
      const targetId = params.id as string
      if (!targetId) { sendError(id ?? 0, -32602, 'Missing session id'); return }
      deleteSession(targetId)
      // If we deleted the current session, switch to the most recent remaining
      if (currentSession?.id === targetId) {
        const sessions = listSessions()
        if (sessions.length > 0) {
          const loaded = loadSession(sessions[0].id)
          if (loaded) {
            currentSession = loaded
            wildMode = loaded.wildMode
            if (config && loaded.model) config.model = loaded.model
          }
        } else {
          currentSession = createSession(config?.model ?? 'unknown', false)
          wildMode = false
        }
      }
      if (id) sendResult(id, {
        deleted: true,
        sessionId: currentSession?.id,
        sessionTitle: currentSession?.title,
        messageCount: currentSession?.messages.length ?? 0,
        messages: serializeMessages(currentSession?.messages ?? []),
      })
      break
    }

    case 'session_save': {
      if (currentSession) {
        currentSession.wildMode = wildMode
        currentSession.model = config?.model ?? currentSession.model
        saveSession(currentSession)
      }
      if (id) sendResult(id, { saved: true })
      break
    }

    case 'chat': {
      if (!config) { sendError(id ?? 0, -32002, 'Not initialized'); return }
      if (!currentSession) currentSession = createSession(config.model, wildMode)
      const prompt = params.prompt as string
      if (!prompt) { sendError(id ?? 0, -32602, 'Missing prompt'); return }
      currentSession.messages.push({ role: 'user', content: prompt })
      handleChat(id ?? ++requestId).catch((err: unknown) => {
        sendError(id ?? 0, -32603, String(err))
      })
      break
    }

    case 'abort': {
      activeAbortController?.abort()
      activeAbortController = null
      if (id) sendResult(id, { aborted: true })
      break
    }

    case 'set_model': {
      if (config) config.model = params.model as string
      if (currentSession) currentSession.model = config?.model ?? ''
      if (id) sendResult(id, { model: config?.model })
      break
    }

    case 'set_wild': {
      wildMode = (params.wild as boolean) ?? true
      if (currentSession) currentSession.wildMode = wildMode
      if (id) sendResult(id, { wildMode })
      break
    }

    case 'clear': {
      if (currentSession) currentSession.messages.length = 0
      if (id) sendResult(id, { cleared: true })
      break
    }

    case 'shutdown': {
      // Save current session before shutting down
      if (currentSession) {
        currentSession.wildMode = wildMode
        currentSession.model = config?.model ?? currentSession.model
        saveSession(currentSession)
      }
      if (id) sendResult(id, { bye: true })
      // Don't exit — just acknowledge. Daemon keeps running.
      break
    }

    default:
      sendError(id ?? 0, -32601, `Method not found: ${method}`)
  }
}

// ── Chat loop ─────────────────────────────────────────────────────────────

const DANGEROUS = [
  /\brm\s/, /\brmdir\b/,
  /git\s+push\s+.*(-f|--force)\b/,
  /\b(kill|pkill)\b/,
  /\|\s*(bash|sh)\b/,
]
const isDangerous = (cmd: string) => DANGEROUS.some(p => p.test(cmd))

async function handleChat(id: number): Promise<void> {
  if (!config) { sendError(id, -32002, 'Not initialized'); return }
  if (!currentSession) currentSession = createSession(config.model, wildMode)
  const msgs = currentSession.messages

  const abortController = new AbortController()
  activeAbortController = abortController

  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, requests = 0
  let iterations = 0
  let lastToolSig = ''

  try {
    while (true) {
      if (iterations++ >= MAX_ITERATIONS) {
        send({ method: 'stream/text', params: { text: '\n\n[stopped: reached max iterations]\n' } })
        break
      }

      let responseText = ''
      const streamResult = await streamResponse(
        config, msgs,
        (text) => {
          responseText += text
          send({ method: 'stream/text', params: { text } })
        },
        () => {},
        memoryContext, undefined, abortController.signal,
      )

      const { toolUses, inputTokens, outputTokens, cacheReadTokens } = streamResult
      totalInput += inputTokens; totalOutput += outputTokens; totalCacheRead += cacheReadTokens; requests++

      if (abortController.signal.aborted) break

      const assistantBlocks: JsonDict[] = []
      if (responseText) assistantBlocks.push({ type: 'text', text: responseText })
      for (const t of toolUses) assistantBlocks.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input })
      if (assistantBlocks.length > 0) msgs.push({ role: 'assistant', content: assistantBlocks as never })

      if (toolUses.length === 0) break

      // Repeated call detection
      const toolSig = toolUses.map(t => `${t.name}:${JSON.stringify(t.input)}`).join('|')
      if (toolSig === lastToolSig) {
        send({ method: 'stream/text', params: { text: '\n\n[stopped: repeated identical tool call]\n' } })
        break
      }
      lastToolSig = toolSig

      const toolResults: ContentBlock[] = []
      for (const t of toolUses) {
        const inputSummary = String(t.input.command ?? t.input.path ?? t.input.pattern ?? '').slice(0, 60)
        send({ method: 'stream/tool_start', params: { id: t.id, name: t.name, summary: inputSummary } })

        if (!wildMode && t.name === 'bash' && isDangerous(String(t.input.command ?? ''))) {
          const blocked = 'Error: command blocked in tame mode.'
          send({ method: 'stream/tool_result', params: { id: t.id, name: t.name, result: blocked, error: true } })
          toolResults.push({ type: 'tool_result', tool_use_id: t.id, content: blocked })
          continue
        }

        const result = await executeTool(t.name, t.input, abortController.signal)
        if (abortController.signal.aborted) break

        const isError = result.startsWith('Error:')
        send({ method: 'stream/tool_result', params: { id: t.id, name: t.name, result: result.slice(0, 500), error: isError } })
        toolResults.push({ type: 'tool_result', tool_use_id: t.id, content: result })
      }

      if (abortController.signal.aborted) break
      msgs.push({ role: 'user', content: toolResults })
      send({ method: 'stream/usage', params: { inputTokens: totalInput, outputTokens: totalOutput, cacheReadTokens: totalCacheRead, requests } })
    }
  } catch (err: unknown) {
    sendError(id, -32603, (err as Error).message || String(err))
    return
  }

  activeAbortController = null
  send({ method: 'stream/usage', params: { inputTokens: totalInput, outputTokens: totalOutput, cacheReadTokens: totalCacheRead, requests } })

  // Auto-save session after chat completes
  if (currentSession) {
    currentSession.wildMode = wildMode
    currentSession.model = config.model
    saveSession(currentSession)
  }

  if (shouldCompact(totalInput)) {
    try {
      const result = await compactMessages(config, msgs)
      const removed = msgs.length - result.messages.length
      msgs.length = 0; msgs.push(...result.messages)
      // Re-save compacted session
      if (currentSession) saveSession(currentSession)
      send({ method: 'stream/compacted', params: { removed, knowledgeSaved: result.knowledgeSaved } })
    } catch { /* ok */ }
  }

  sendResult(id, { done: true })
}

// ── Server ────────────────────────────────────────────────────────────────

function getAvailableModels(config: Config): { alias: string; id: string }[] {
  const models: { alias: string; id: string }[] = []

  // Models from the main proxy (anthropic-compatible)
  // We know the common ones; the proxy may have more
  const mainModels = [
    { alias: 'Sonnet 4', id: 'claude-sonnet-4-6' },
    { alias: 'Sonnet 5', id: 'claude-sonnet-5' },
    { alias: 'Opus 4', id: 'claude-opus-4-6' },
    { alias: 'Opus 4.7', id: 'claude-opus-4-7' },
    { alias: 'Opus 4.8', id: 'claude-opus-4-8' },
    { alias: 'Haiku 4.5', id: 'claude-haiku-4-5' },
    { alias: 'GPT-5.4', id: 'gpt-5.4' },
    { alias: 'GPT-5.5', id: 'gpt-5.5' },
    { alias: 'Gemini 3.5 Flash', id: 'gemini-3.5-flash' },
    { alias: 'Gemini 3.1 Pro', id: 'gemini-3.1-pro-preview' },
    { alias: 'DeepSeek V4 Pro', id: 'deepseek/deepseek-v4-pro' },
    { alias: 'Kimi K2.6', id: 'moonshotai/kimi-k2.6' },
    { alias: 'Qwen 3.7 Max', id: 'qwen/qwen3.7-max' },
  ]

  // Always include main proxy models if we have an api_key
  if (config.api_key) {
    models.push(...mainModels)
  }

  // For each custom provider, query /models or use known lists
  if (config.providers) {
    for (const [key, providerConfig] of Object.entries(config.providers)) {
      if (key === 'anthropic') continue // already covered above
      const providerModels = getProviderModels(key, providerConfig)
      models.push(...providerModels)
    }
  }

  // Remove duplicates by id
  const seen = new Set<string>()
  return models.filter(m => {
    if (seen.has(m.id)) return false
    seen.add(m.id)
    return true
  })
}

function getProviderModels(key: string, config: ProviderConfig): { alias: string; id: string }[] {
  // Known model lists per provider key prefix
  const KNOWN: Record<string, { alias: string; id: string }[]> = {
    zhipu: [
      { alias: 'GLM-5.2', id: 'glm-5.2' },
      { alias: 'GLM-5.1', id: 'glm-5.1' },
      { alias: 'GLM-5', id: 'glm-5' },
      { alias: 'GLM-4.7', id: 'glm-4.7' },
      { alias: 'GLM-4.6', id: 'glm-4.6' },
      { alias: 'GLM-4.5', id: 'glm-4.5' },
    ],
  }

  if (KNOWN[key]) return KNOWN[key]

  // Fallback: try to hit the provider's /models endpoint synchronously
  // (skip if too complex — just return empty)
  return []
}

function getVersion(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(readFileSync(join(dir, '..', '..', 'package.json'), 'utf8'))
    return pkg.version ?? '0.0.0'
  } catch { return '0.0.0' }
}

export function startDaemon(): void {
  // If socket exists, check whether an existing daemon is already listening.
  // If so, exit this instance — avoids killing a healthy daemon on each app launch.
  if (fs.existsSync(SOCKET_PATH)) {
    const probe = net.createConnection(SOCKET_PATH)
    probe.on('connect', () => {
      probe.destroy()
      process.stderr.write('[daemon] already running, exiting\n')
      process.exit(0)
    })
    probe.on('error', () => {
      // Stale socket — remove it and start fresh
      try { fs.unlinkSync(SOCKET_PATH) } catch { /* ok */ }
      boot()
    })
    return
  }
  boot()
}

function boot(): void {
  const server = net.createServer((socket) => {
    // Accept new GUI connection, drop previous
    if (activeSocket) {
      try { activeSocket.destroy() } catch { /* ok */ }
    }
    activeSocket = socket
    process.stderr.write(`[daemon] GUI connected\n`)

    let buffer = ''
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      let idx: number
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (line) handleMessage(line).catch((e) => process.stderr.write(`[daemon] error: ${e}\n`))
      }
    })

    socket.on('close', () => {
      if (activeSocket === socket) activeSocket = null
      process.stderr.write(`[daemon] GUI disconnected\n`)
    })

    socket.on('error', (err) => {
      process.stderr.write(`[daemon] socket error: ${err.message}\n`)
      if (activeSocket === socket) activeSocket = null
    })
  })

  server.listen(SOCKET_PATH, () => {
    // Restrict socket permissions to owner only
    try { fs.chmodSync(SOCKET_PATH, 0o600) } catch { /* ok */ }
    process.stderr.write(`[daemon] listening on ${SOCKET_PATH}\n`)
  })

  server.on('error', (err) => {
    process.stderr.write(`[daemon] server error: ${err.message}\n`)
    process.exit(1)
  })

  const cleanup = () => {
    server.close()
    try { fs.unlinkSync(SOCKET_PATH) } catch { /* ok */ }
    process.exit(0)
  }
  process.on('SIGTERM', cleanup)
  process.on('SIGINT', cleanup)
}
