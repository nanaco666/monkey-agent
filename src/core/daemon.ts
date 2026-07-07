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
import { loadConfig } from '../config/index.js'
import { initProviders, streamResponse, type Message } from './api.js'
import { executeTool } from '../tools/index.js'
import { buildMemoryContext } from '../memory/context.js'
import { shouldCompact, compactMessages } from './compact.js'
import { cleanSessionsOnly } from '../memory/clean.js'
import type { ContentBlock } from '../providers/index.js'

export const SOCKET_PATH = join(homedir(), '.monkey-cli', 'monkey.sock')

type JsonDict = Record<string, unknown>

// ── Global session state (persists across GUI reconnects) ──────────────────

let config: ReturnType<typeof loadConfig> | null = null
let messages: Message[] = []
let memoryContext = ''
let wildMode = false
let requestId = 0
let activeAbortController: AbortController | null = null
let initialized = false

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
        initialized = true
        process.stderr.write(`[daemon] initialized, model=${config.model}, sessions cleaned=${cleaned.removed}\n`)
      }
      sendResult(id ?? 0, {
        model: config!.model,
        name: config!.assistant_name || 'Monkey',
        version: getVersion(),
        wildMode,
        memoryLoaded: !!memoryContext,
        resumed: messages.length > 0,
        messageCount: messages.length,
      })
      break
    }

    case 'chat': {
      if (!config) { sendError(id ?? 0, -32002, 'Not initialized'); return }
      const prompt = params.prompt as string
      if (!prompt) { sendError(id ?? 0, -32602, 'Missing prompt'); return }
      messages.push({ role: 'user', content: prompt })
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
      if (id) sendResult(id, { model: config?.model })
      break
    }

    case 'set_wild': {
      wildMode = (params.wild as boolean) ?? true
      if (id) sendResult(id, { wildMode })
      break
    }

    case 'clear': {
      messages.length = 0
      if (id) sendResult(id, { cleared: true })
      break
    }

    case 'shutdown': {
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
        config, messages,
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
      if (assistantBlocks.length > 0) messages.push({ role: 'assistant', content: assistantBlocks as never })

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
      messages.push({ role: 'user', content: toolResults })
      send({ method: 'stream/usage', params: { inputTokens: totalInput, outputTokens: totalOutput, cacheReadTokens: totalCacheRead, requests } })
    }
  } catch (err: unknown) {
    sendError(id, -32603, (err as Error).message || String(err))
    return
  }

  activeAbortController = null
  send({ method: 'stream/usage', params: { inputTokens: totalInput, outputTokens: totalOutput, cacheReadTokens: totalCacheRead, requests } })

  if (shouldCompact(totalInput)) {
    try {
      const result = await compactMessages(config, messages)
      const removed = messages.length - result.messages.length
      messages.length = 0; messages.push(...result.messages)
      send({ method: 'stream/compacted', params: { removed, knowledgeSaved: result.knowledgeSaved } })
    } catch { /* ok */ }
  }

  sendResult(id, { done: true })
}

// ── Server ────────────────────────────────────────────────────────────────

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
