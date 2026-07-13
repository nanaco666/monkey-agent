/**
 * Monkey App Protocol (MAP) -- JSON-RPC-over-stdio for GUI <-> CLI communication.
 *
 * The macOS app spawns `monkey app` as a long-lived child process.
 * They communicate via newline-delimited JSON on stdin/stdout.
 * stderr is left for debug logging.
 */

import { loadConfig, saveConfig, type Config } from '../config/index.js'
import { initProviders, streamResponse, type Message } from './api.js'
import { executeTool } from '../tools/index.js'
import { buildMemoryContext } from '../memory/context.js'
import { shouldCompact, compactMessages } from './compact.js'
import { cleanSessionsOnly } from '../memory/clean.js'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { ContentBlock } from '../providers/index.js'
import {
  createSession, loadSession, saveSession, deleteSession, listSessions,
  migrateAllSwiftSessions, type Session,
} from '../session/store.js'

type JsonDict = Record<string, unknown>

let config: ReturnType<typeof loadConfig>
let currentSession: Session | null = null
let memoryContext = ''
let wildMode = false
let requestId = 0
let activeAbortController: AbortController | null = null

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
      let text = ''
      let isTool = false
      for (const block of m.content as ContentBlock[]) {
        if (block.type === 'text') {
          text += block.text
        } else if (block.type === 'tool_use') {
          isTool = true
          const summary = String(block.input.command ?? block.input.path ?? block.input.pattern ?? '').slice(0, 60)
          result.push({ role: 'tool', content: summary || block.name, toolName: block.name, toolId: block.id })
        } else if (block.type === 'tool_result') {
          isTool = true
          result.push({ role: 'tool', content: block.content.slice(0, 300), toolId: block.tool_use_id })
        }
      }
      if (text) result.push({ role: m.role, content: text })
    }
  }
  return result
}

// -- JSON-RPC helpers --

function send(notification: JsonDict): void {
  process.stdout.write(JSON.stringify(notification) + '\n')
}

function sendResult(id: number, result: JsonDict): void {
  process.stdout.write(JSON.stringify({ id, result }) + '\n')
}

function sendError(id: number, code: number, message: string): void {
  process.stdout.write(JSON.stringify({ id, error: { code, message } }) + '\n')
}

// -- Read loop --

let inputBuffer = ''

// Ensure stdin is in flowing mode for pipe/pty usage
process.stdin.resume()

process.stdin.on('data', (chunk: Buffer) => {
  inputBuffer += chunk.toString()
  while (inputBuffer.includes('\n')) {
    const idx = inputBuffer.indexOf('\n')
    const line = inputBuffer.slice(0, idx).trim()
    inputBuffer = inputBuffer.slice(idx + 1)
    if (line) handleMessage(line)
  }
})

// -- Keep process alive --

// The app-protocol process needs to stay alive until explicitly shut down.
// stdin handlers alone don't guarantee this — if stdin is piped from a GUI
// that hasn't written yet, the event loop can exit.
const keepalive = setInterval(() => {}, 60000) // Wake up every minute

process.stdin.on('end', () => {
  // Don't exit immediately — the GUI process may have temporarily closed its write end.
  // The process will be terminated by the 'shutdown' method or SIGTERM.
})

async function handleMessage(line: string): Promise<void> {
  let msg: JsonDict
  try {
    msg = JSON.parse(line)
  } catch {
    sendError(0, -32700, 'Parse error')
    return
  }

  const id = msg.id as number | undefined
  const method = msg.method as string | undefined
  const params = (msg.params ?? {}) as JsonDict

  switch (method) {
    case 'initialize':
      config = loadConfig()
      if (!config) {
        sendError(id ?? 0, -32001, 'No config found. Run `monkey` in terminal first.')
        return
      }
      initProviders(config)

      try {
        memoryContext = await buildMemoryContext(config, '')
      } catch {}

      const sessionClean = cleanSessionsOnly()
      // One-time migration of Swift-format sessions
      const migrated = migrateAllSwiftSessions()
      if (migrated > 0) process.stderr.write(`[app-protocol] migrated ${migrated} Swift sessions\n`)

      // Load most recent session, or create one
      const sessions = listSessions()
      if (sessions.length > 0) {
        currentSession = loadSession(sessions[0].id)
      }
      if (!currentSession) {
        currentSession = createSession(config.model, false)
      }
      wildMode = currentSession.wildMode

      // Build available models list from config
      const models = buildModelList(config)

      sendResult(id ?? 0, {
        model: config.model,
        name: config.assistant_name || 'Monkey',
        version: getVersion(),
        wildMode,
        memoryLoaded: !!memoryContext,
        sessionsCleaned: sessionClean.removed,
        models,
        sessionId: currentSession.id,
        sessionTitle: currentSession.title,
        messageCount: currentSession.messages.length,
      })
      break

    case 'session_list': {
      const allSessions = listSessions()
      sendResult(id ?? 0, { sessions: allSessions })
      break
    }

    case 'session_new': {
      if (currentSession) {
        currentSession.wildMode = wildMode
        currentSession.model = config?.model ?? currentSession.model
        saveSession(currentSession)
      }
      currentSession = createSession(config?.model ?? 'unknown', wildMode)
      sendResult(id ?? 0, {
        sessionId: currentSession.id,
        sessionTitle: currentSession.title,
        messageCount: 0,
      })
      break
    }

    case 'session_switch': {
      const targetId = params.id as string
      if (!targetId) { sendError(id ?? 0, -32602, 'Missing session id'); return }
      if (currentSession) {
        currentSession.wildMode = wildMode
        currentSession.model = config?.model ?? currentSession.model
        saveSession(currentSession)
      }
      const loaded = loadSession(targetId)
      if (!loaded) { sendError(id ?? 0, -32603, 'Session not found'); return }
      currentSession = loaded
      wildMode = loaded.wildMode
      if (config && loaded.model) config.model = loaded.model
      sendResult(id ?? 0, {
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
      if (currentSession?.id === targetId) {
        const remaining = listSessions()
        if (remaining.length > 0) {
          const loaded = loadSession(remaining[0].id)
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
      sendResult(id ?? 0, {
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
      sendResult(id ?? 0, { saved: true })
      break
    }

    case 'chat': {
      if (!config) { sendError(id ?? 0, -32002, 'Not initialized'); return }
      if (!currentSession) currentSession = createSession(config.model, wildMode)
      const prompt = params.prompt as string
      if (!prompt) { sendError(id ?? 0, -32602, 'Missing prompt'); return }

      currentSession.messages.push({ role: 'user', content: prompt })

      const chatId = id ?? ++requestId
      handleChat(chatId, prompt).catch((err: unknown) => {
        sendError(chatId, -32603, String(err))
      })
      break
    }

    case 'abort': {
      if (activeAbortController) {
        activeAbortController.abort()
        activeAbortController = null
      }
      if (id) sendResult(id, { aborted: true })
      break
    }

    case 'slash': {
      if (!config) { sendError(id ?? 0, -32002, 'Not initialized'); return }
      const cmd = params.cmd as string
      handleSlash(id ?? ++requestId, cmd)
      break
    }

    case 'set_model': {
      if (config) {
        config.model = params.model as string
        if (currentSession) currentSession.model = config.model
        sendResult(id ?? 0, { model: config.model })
      }
      break
    }

    case 'set_wild': {
      wildMode = (params.wild as boolean) ?? true
      if (currentSession) currentSession.wildMode = wildMode
      sendResult(id ?? 0, { wildMode })
      break
    }

    case 'clear': {
      if (currentSession) currentSession.messages.length = 0
      sendResult(id ?? 0, { cleared: true })
      break
    }

    case 'shutdown': {
      if (currentSession) {
        currentSession.wildMode = wildMode
        currentSession.model = config?.model ?? currentSession.model
        saveSession(currentSession)
      }
      if (id) sendResult(id, { bye: true })
      clearInterval(keepalive)
      process.exit(0)
      break
    }

    default:
      sendError(id ?? 0, -32601, `Method not found: ${method}`)
  }
}

// -- Chat handling --

const DANGEROUS_PATTERNS = [
  /\brm\s/,
  /\brmdir\b/,
  /git\s+push\s+.*(-f|--force)\b/,
  /\bchmod\b.*\/(bin|etc|usr|sys|proc)\b/,
  /\b(kill|pkill)\b/,
  /\|\s*(bash|sh)\b/,
]

function isDangerous(command: string): boolean {
  return DANGEROUS_PATTERNS.some(p => p.test(command))
}

async function handleChat(id: number, _prompt: string): Promise<void> {
  if (!config) { sendError(id, -32002, 'Not initialized'); return }
  if (!currentSession) currentSession = createSession(config.model, wildMode)
  const msgs = currentSession.messages
  const abortController = new AbortController()
  activeAbortController = abortController

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheReadTokens = 0
  let requests = 0

  try {
    while (true) {
      let responseText = ''

      const streamResult = await streamResponse(
        config,
        msgs,
        (text: string) => {
          responseText += text
          send({ method: 'stream/text', params: { text } })
        },
        (_name: string, _input: Record<string, unknown>) => {},
        memoryContext,
        undefined,
        abortController.signal,
      )

      const { toolUses, inputTokens, outputTokens, cacheReadTokens } = streamResult
      totalInputTokens += inputTokens
      totalOutputTokens += outputTokens
      totalCacheReadTokens += cacheReadTokens
      requests++

      if (abortController.signal.aborted) break

      // Build assistant message
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assistantBlocks: any[] = []
      if (responseText) assistantBlocks.push({ type: 'text', text: responseText })
      for (const t of toolUses) assistantBlocks.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input })
      if (assistantBlocks.length > 0) {
        msgs.push({ role: 'assistant', content: assistantBlocks })
      }

      if (toolUses.length === 0) break

      // Execute tools
      const toolResults: ContentBlock[] = []
      for (const t of toolUses) {
        const inputSummary = t.input.command ?? t.input.path ?? t.input.pattern ?? ''
        const summary = String(inputSummary).slice(0, 60)

        send({ method: 'stream/tool_start', params: { id: t.id, name: t.name, input: t.input, summary } })

        // tame mode check
        if (!wildMode && t.name === 'bash' && isDangerous(String(t.input.command ?? ''))) {
          const blocked = 'Error: command blocked in tame mode. Switch to wild mode to allow.'
          send({ method: 'stream/tool_result', params: { name: t.name, result: blocked, error: true } })
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

      // Send usage update
      send({ method: 'stream/usage', params: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, cacheReadTokens: totalCacheReadTokens, requests } })
    }
  } catch (err: unknown) {
    const errMsg = (err as Error).message || String(err)
    sendError(id, -32603, errMsg)
    return
  }

  activeAbortController = null

  // Send final usage
  send({ method: 'stream/usage', params: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, cacheReadTokens: totalCacheReadTokens, requests } })

  // Auto-save session after chat
  if (currentSession) {
    currentSession.wildMode = wildMode
    currentSession.model = config.model
    saveSession(currentSession)
  }

  // Auto-compact
  let compacted = false
  if (shouldCompact(totalInputTokens)) {
    try {
      const result = await compactMessages(config, msgs)
      const removed = msgs.length - result.messages.length
      msgs.length = 0
      msgs.push(...result.messages)
      if (currentSession) saveSession(currentSession)
      compacted = true
      send({ method: 'stream/compacted', params: { removed, knowledgeSaved: result.knowledgeSaved } })
    } catch {}
  }

  sendResult(id, { done: true, compacted })
}

// -- Slash commands --

function handleSlash(id: number, cmd: string): void {
  if (!config) { sendError(id, -32002, 'Not initialized'); return }
  const lower = cmd.trim().toLowerCase()

  switch (lower) {
    case '/clear':
      if (currentSession) currentSession.messages.length = 0
      sendResult(id, { type: 'system', message: 'Conversation cleared.' })
      break
    case '/wild':
      wildMode = true
      sendResult(id, { type: 'system', message: 'Wild mode -- all commands allowed' })
      break
    case '/tame':
      wildMode = false
      sendResult(id, { type: 'system', message: 'Tame mode -- dangerous commands blocked' })
      break
    case '/model':
      sendResult(id, { type: 'system', message: `Current model: ${config?.model ?? 'unknown'}` })
      break
    case '/help':
      sendResult(id, { type: 'system', message: 'Commands: /clear /wild /tame /model /help' })
      break
    default:
      // Forward as chat
      if (config) {
        handleChat(id, cmd).catch((err: unknown) => sendError(id, -32603, String(err)))
      }
  }
}

// -- Utils --

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    // From dist/core/, package.json is at ../../package.json (in project root)
    const pkgPath = join(__dirname, '..', '..', 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** Build model list for the GUI, derived from config + known aliases */
function buildModelList(config: Config): Array<{ alias: string; id: string }> {
  type ModelEntry = { alias: string; id: string }
  const models: ModelEntry[] = []

  // Anthropic models (always available via main api_key)
  models.push(
    { alias: 'Opus 4', id: 'claude-opus-4-6' },
    { alias: 'Sonnet 4', id: 'claude-sonnet-4-6' },
    { alias: 'Haiku 4.5', id: 'claude-haiku-4-5-latest' },
  )

  // OpenAI models (if openai provider configured)
  if (config.providers?.openai) {
    models.push(
      { alias: 'GPT-4o', id: 'gpt-4o' },
      { alias: 'o3', id: 'o3' },
      { alias: 'o4-mini', id: 'o4-mini' },
    )
  }

  // Zhipu/GLM models (if zhipu provider configured)
  if (config.providers?.zhipu) {
    models.push(
      { alias: 'GLM-5.2', id: 'glm-5.2' },
      { alias: 'GLM-5.1', id: 'glm-5.1' },
      { alias: 'GLM-5', id: 'glm-5' },
      { alias: 'GLM-4.5', id: 'glm-4.5' },
    )
  }

  // Add any custom provider models
  for (const [key, prov] of Object.entries(config.providers ?? {})) {
    if (key === 'anthropic' || key === 'openai' || key === 'zhipu') continue
    // Add a generic entry for unknown providers
    models.push({ alias: key, id: key })
  }

  // Ensure the current model is in the list
  if (!models.some(m => m.id === config.model)) {
    models.unshift({ alias: config.model, id: config.model })
  }

  return models
}

// -- Signal handling --

process.on('SIGINT', () => {
  if (activeAbortController) activeAbortController.abort()
  process.exit(0)
})

process.on('SIGTERM', () => {
  if (activeAbortController) activeAbortController.abort()
  process.exit(0)
})
