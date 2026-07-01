/**
 * Telegram Bot mode for Monkey.
 * Uses long polling + native fetch, no external deps.
 */
import { execSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Config } from '../config/index.js'
import type { Message } from './api.js'
import { streamResponse, initProviders } from './api.js'
import { executeTool } from '../tools/index.js'
import { buildMemoryContext } from '../memory/context.js'
import { shouldCompact, compactMessages } from './compact.js'
import { cleanSessionsOnly, selfClean } from '../memory/clean.js'
import type { ContentBlock } from '../providers/index.js'

const TELEGRAM_API = 'https://api.telegram.org/bot'

// Path to compiled OCR binary
const __dirname = dirname(fileURLToPath(import.meta.url))
const OCR_BIN = join(__dirname, '..', 'scripts', 'ocr')

interface TgUpdate {
  update_id: number
  message?: {
    message_id: number
    from?: { id: number; first_name?: string; username?: string }
    chat: { id: number; type: string }
    text?: string
    photo?: Array<{ file_id: string }>
    caption?: string
  }
}

interface TgSession {
  messages: Message[]
  memoryContext: string
  lastActive: number
}

export class TelegramBot {
  private token: string
  private config: Config
  private allowedUsers: Set<number>
  private sessions: Map<number, TgSession> = new Map()
  private offset = 0
  private running = false
  private wildMode = false

  constructor(config: Config, token: string, allowedUsers: number[] = []) {
    this.config = config
    this.token = token
    this.allowedUsers = new Set(allowedUsers)
  }

  private api(method: string, body?: Record<string, unknown>): Promise<any> {
    return fetch(`${TELEGRAM_API}${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json())
  }

  private async sendMessage(chatId: number, text: string, replyTo?: number): Promise<any> {
    // Telegram has 4096 char limit, split if needed
    const chunks = splitMessage(text, 4000)
    let lastMsg: any
    for (const chunk of chunks) {
      lastMsg = await this.api('sendMessage', {
        chat_id: chatId,
        text: chunk,
        reply_to_message_id: replyTo,
        parse_mode: 'Markdown',
      }).catch(() =>
        // Fallback without markdown if parse fails
        this.api('sendMessage', {
          chat_id: chatId,
          text: chunk,
          reply_to_message_id: replyTo,
        })
      )
    }
    return lastMsg
  }

  private async editMessage(chatId: number, messageId: number, text: string): Promise<void> {
    await this.api('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: text.slice(0, 4000),
    }).catch(() => {})
  }

  private async sendTyping(chatId: number): Promise<void> {
    await this.api('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {})
  }

  /** Download a Telegram file by file_id, run OCR, return text */
  private async ocrFromFileId(fileId: string): Promise<string> {
    // Get file path from Telegram
    const fileInfo = await this.api('getFile', { file_id: fileId })
    if (!fileInfo?.ok || !fileInfo.result?.file_path) {
      return '[Error: could not get file from Telegram]'
    }
    const fileUrl = `https://api.telegram.org/file/bot${this.token}/${fileInfo.result.file_path}`

    // Download to temp file
    const tmpPath = `/tmp/monkey_ocr_${Date.now()}.jpg`
    try {
      const resp = await fetch(fileUrl)
      if (!resp.ok) return '[Error: could not download image]'
      const buf = Buffer.from(await resp.arrayBuffer())
      writeFileSync(tmpPath, buf)

      // Run OCR
      const text = execSync(`"${OCR_BIN}" "${tmpPath}"`, {
        encoding: 'utf8',
        timeout: 15000,
      }).trim()

      return text || '[No text recognized in image]'
    } catch (err: unknown) {
      return `[OCR Error: ${(err as Error).message}]`
    } finally {
      try { unlinkSync(tmpPath) } catch {}
    }
  }

  private getSession(chatId: number): TgSession {
    if (!this.sessions.has(chatId)) {
      this.sessions.set(chatId, {
        messages: [],
        memoryContext: '',
        lastActive: Date.now(),
      })
    }
    const s = this.sessions.get(chatId)!
    s.lastActive = Date.now()
    return s
  }

  private async handlePhoto(chatId: number, fileId: string, caption: string, fromId: number, messageId: number): Promise<void> {
    if (this.allowedUsers.size > 0 && !this.allowedUsers.has(fromId)) {
      await this.sendMessage(chatId, '⛔ Unauthorized.')
      return
    }

    await this.sendTyping(chatId)
    const ocrText = await this.ocrFromFileId(fileId)

    // Build user message combining OCR result and caption
    let userText = `[Image OCR result]:\n${ocrText}`
    if (caption) {
      userText = `${caption}\n\n${userText}`
    }

    // Delegate to normal message handling
    await this.handleMessage(chatId, userText, fromId, messageId)
  }

  private async handleMessage(chatId: number, text: string, fromId: number, messageId: number): Promise<void> {
    // Access control
    if (this.allowedUsers.size > 0 && !this.allowedUsers.has(fromId)) {
      await this.sendMessage(chatId, '⛔ Unauthorized.')
      return
    }

    // Commands
    if (text === '/start') {
      await this.sendMessage(chatId, `🐒 ${this.config.assistant_name || 'Monkey'} ready. 发消息就行，我对世界充满好奇！`)
      return
    }
    if (text === '/clear') {
      const session = this.getSession(chatId)
      session.messages.length = 0
      await this.sendMessage(chatId, '✦ 对话已清空。')
      return
    }
    if (text === '/model') {
      await this.sendMessage(chatId, `当前模型: ${this.config.model}`)
      return
    }
    if (text.startsWith('/model ')) {
      const newModel = text.slice(7).trim()
      this.config.model = newModel
      await this.sendMessage(chatId, `✦ 已切换到 ${newModel}`)
      return
    }
    if (text === '/usage') {
      const session = this.getSession(chatId)
      // Rough estimate from message count
      const msgCount = session.messages.length
      await this.sendMessage(chatId, `对话消息数: ${msgCount}\n当前模型: ${this.config.model}`)
      return
    }
    if (text === '/wild') {
      this.wildMode = true
      await this.sendMessage(chatId, '🐒 wild mode — 所有命令都允许')
      return
    }
    if (text === '/tame') {
      this.wildMode = false
      await this.sendMessage(chatId, '✦ tame mode — 危险命令已屏蔽')
      return
    }
    if (text === '/help') {
      await this.sendMessage(chatId, [
        `🐒 ${this.config.assistant_name || 'Monkey'} Commands:`,
        '',
        '/start - 打招呼',
        '/clear - 清空对话',
        '/model - 查看当前模型',
        '/model <name> - 切换模型',
        '/usage - 查看用量',
        '/update - 拉最新代码并重启',
        '/clean - 自清洁：清理过期会话和记忆',
        '/wild - 解锁危险命令 🐒',
        '/tame - 恢复安全模式',
        '/help - 查看帮助',
        '',
        '直接发消息就是聊天，发图片会自动 OCR 识别文字。',
      ].join('\n'))
      return
    }
    if (text === '/clean') {
      try {
        const report = await selfClean(this.config)
        const parts: string[] = []
        if (report.sessionsRemoved > 0) parts.push(`${report.sessionsRemoved} old sessions removed (${report.sessionsFreedKB}KB)`)
        else parts.push('no stale sessions')
        if (report.memoryRemoved > 0) parts.push(`${report.memoryRemoved} stale memory entries removed`)
        else parts.push('no stale memory')
        if (report.knowledgeRescued > 0) parts.push(`${report.knowledgeRescued} knowledge entries rescued before deletion`)
        await this.sendMessage(chatId, `✦ ${parts.join(', ')}`)
      } catch {
        await this.sendMessage(chatId, '✗ clean failed')
      }
      return
    }
    if (text === '/update') {
      const { execSync: exec } = await import('child_process')
      const { join } = await import('path')
      const { homedir } = await import('os')
      const { existsSync } = await import('fs')
      const PROJECT_DIR = join(homedir(), 'monkey-cli')
      const PLIST = join(homedir(), 'Library', 'LaunchAgents', 'com.monkey-cli.telegram-bot.plist')
      try {
        const pullOutput = execSync('git pull', { cwd: PROJECT_DIR, encoding: 'utf8', timeout: 30000 }).trim()
        let msg = ''
        if (pullOutput.includes('Already up to date.')) {
          msg = 'already up to date'
        } else {
          msg = 'pulled: ' + pullOutput.split('\n')[0]
        }
        execSync('npm run build', { cwd: PROJECT_DIR, encoding: 'utf8', timeout: 60000 })
        msg += '\nbuild ✓'

        if (existsSync(PLIST)) {
          const listOutput = execSync('launchctl list', { encoding: 'utf8' })
          if (listOutput.includes('com.monkey-cli.telegram-bot')) {
            execSync(`launchctl unload "${PLIST}"`, { timeout: 10000 })
            execSync(`launchctl load "${PLIST}"`, { timeout: 10000 })
            msg += '\ntelegram bot restarted ✓'
          }
        }

        // Send result before this process dies from launchctl restart
        await this.sendMessage(chatId, `✦ ${msg}`)
        // This process will be killed by launchctl, new one takes over
      } catch (err: unknown) {
        await this.sendMessage(chatId, `✗ ${(err as Error).message?.split('\n')[0]}`)
      }
      return
    }

    const session = this.getSession(chatId)

    // Load memory context if empty
    if (!session.memoryContext) {
      try {
        session.memoryContext = await buildMemoryContext(this.config, '')
      } catch {}
    }

    // Send typing indicator
    await this.sendTyping(chatId)

    session.messages.push({ role: 'user', content: text })

    // Send placeholder
    const placeholderResp = await this.api('sendMessage', {
      chat_id: chatId,
      text: '...',
      reply_to_message_id: messageId,
    })
    const replyMsgId = placeholderResp?.result?.message_id

    let fullResponse = ''
    let lastEditTime = 0
    const EDIT_INTERVAL = 1500 // min ms between edits for streaming effect

    try {
      let iterations = 0
      const MAX_ITERATIONS = 20

      while (iterations++ < MAX_ITERATIONS) {
        let responseText = ''

        const streamResult = await streamResponse(
          this.config,
          session.messages,
          (text) => {
            responseText += text
            fullResponse += text
            // Periodically update message for streaming feel
            const now = Date.now()
            if (replyMsgId && now - lastEditTime > EDIT_INTERVAL && fullResponse.trim()) {
              lastEditTime = now
              this.editMessage(chatId, replyMsgId, fullResponse + ' ▍').catch(() => {})
            }
          },
          () => {},
          session.memoryContext,
        )

        const { toolUses } = streamResult

        // Build assistant message blocks
        const assistantBlocks: any[] = []
        if (responseText) assistantBlocks.push({ type: 'text', text: responseText })
        for (const t of toolUses) {
          assistantBlocks.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input })
        }
        if (assistantBlocks.length > 0) {
          session.messages.push({ role: 'assistant', content: assistantBlocks })
        }

        if (toolUses.length === 0) break

        // Execute tools
        const toolResults: ContentBlock[] = []
        for (const t of toolUses) {
          const result = await executeTool(t.name, t.input)
          toolResults.push({ type: 'tool_result', tool_use_id: t.id, content: result })

          // Update message with tool status
          const toolHint = `🔧 ${t.name}`
          if (replyMsgId) {
            this.editMessage(chatId, replyMsgId, (fullResponse || '') + `\n\n_${toolHint}_`).catch(() => {})
          }
        }

        session.messages.push({ role: 'user', content: toolResults })
        await this.sendTyping(chatId)
      }
    } catch (err: unknown) {
      const errMsg = (err as Error).message || String(err)
      fullResponse += `\n\n❌ Error: ${errMsg}`
    }

    // Final edit with complete response
    if (replyMsgId && fullResponse.trim()) {
      await this.editMessage(chatId, replyMsgId, fullResponse)
    } else if (replyMsgId && !fullResponse.trim()) {
      await this.editMessage(chatId, replyMsgId, '(no response)')
    }

    // Auto-compact
    if (shouldCompact(session.messages.length * 1000)) {
      try {
        const result = await compactMessages(this.config, session.messages)
        session.messages.length = 0
        session.messages.push(...result.messages)
        if (result.knowledgeSaved > 0) {
          console.log(`   Auto-learned ${result.knowledgeSaved} new things from compacted conversation`)
        }
      } catch {}
    }
  }

  async start(): Promise<void> {
    this.running = true
    console.log(`🐒 Telegram bot starting... (model: ${this.config.model}, name: ${this.config.assistant_name || 'Monkey'})`)

    // Auto-clean stale session logs on startup
    const sessionClean = cleanSessionsOnly()
    if (sessionClean.removed > 0) {
      console.log(`   Cleaned ${sessionClean.removed} old sessions (${sessionClean.freedKB}KB)`)
    }

    // Get bot info
    const me = await this.api('getMe')
    if (me?.ok) {
      console.log(`   Bot: @${me.result.username} (${me.result.first_name})`)
    } else {
      console.error('Failed to connect to Telegram:', me)
      process.exit(1)
    }

    console.log(`   Allowed users: ${this.allowedUsers.size > 0 ? [...this.allowedUsers].join(', ') : 'all'}`)
    console.log(`   Polling for updates...`)

    while (this.running) {
      try {
        const resp = await fetch(`${TELEGRAM_API}${this.token}/getUpdates?offset=${this.offset}&timeout=30`, {
          signal: AbortSignal.timeout(35000),
        }).then(r => r.json()) as any

        if (!resp?.ok || !resp.result?.length) continue

        for (const update of resp.result as TgUpdate[]) {
          this.offset = update.update_id + 1
          const msg = update.message
          if (!msg) continue

          const { chat, from, message_id } = msg

          if (msg.text) {
            this.handleMessage(chat.id, msg.text, from?.id ?? 0, message_id).catch(err => {
              console.error(`Error handling message from ${from?.id}:`, err)
            })
          } else if (msg.photo && msg.photo.length > 0) {
            // Handle photo: OCR + optional caption
            const fileId = msg.photo[msg.photo.length - 1].file_id // largest size
            this.handlePhoto(chat.id, fileId, msg.caption || '', from?.id ?? 0, message_id).catch(err => {
              console.error(`Error handling photo from ${from?.id}:`, err)
            })
          }
        }
      } catch (err: unknown) {
        const msg = (err as Error).message || ''
        if (!msg.includes('abort')) {
          console.error('Polling error:', msg)
          await sleep(3000)
        }
      }
    }
  }

  stop(): void {
    this.running = false
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > maxLen) {
    // Try to split at newline
    let splitIdx = remaining.lastIndexOf('\n', maxLen)
    if (splitIdx < maxLen * 0.5) splitIdx = maxLen
    chunks.push(remaining.slice(0, splitIdx))
    remaining = remaining.slice(splitIdx)
  }
  if (remaining) chunks.push(remaining)
  return chunks
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
