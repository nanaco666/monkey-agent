/**
 * Session Store — persistent conversation sessions.
 *
 * Sessions are stored as JSON files in ~/.monkey-cli/sessions/.
 * Each session has: id, title, messages, model, wildMode, timestamps.
 * This is the single source of truth shared by CLI, daemon, and macOS app.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { randomUUID } from 'crypto'
import type { Message } from '../core/api.js'

export interface SessionMeta {
  id: string
  title: string
  model: string
  wildMode: boolean
  createdAt: string
  updatedAt: string
  messageCount: number
}

export interface Session extends SessionMeta {
  messages: Message[]
}

const SESSIONS_DIR = join(homedir(), '.monkey-cli', 'sessions')

function ensureDir(): void {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true })
}

function sessionPath(id: string): string {
  return join(SESSIONS_DIR, `${id}.json`)
}

/** Auto-generate a short title from the first user message */
function autoTitle(messages: Message[]): string {
  for (const m of messages) {
    if (m.role !== 'user') continue
    let text: string
    if (typeof m.content === 'string') {
      text = m.content
    } else {
      text = m.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join(' ')
    }
    text = text.trim()
    if (text) return text.length > 40 ? text.slice(0, 40) + '…' : text
  }
  return 'New Chat'
}

/** Create a new session and persist it */
export function createSession(model: string, wildMode: boolean = false): Session {
  ensureDir()
  const now = new Date().toISOString()
  const session: Session = {
    id: randomUUID(),
    title: 'New Chat',
    messages: [],
    model,
    wildMode,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  }
  writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2), 'utf-8')
  return session
}

/** Load a session by ID */
export function loadSession(id: string): Session | null {
  const p = sessionPath(id)
  if (!existsSync(p)) return null
  try {
    const data = JSON.parse(readFileSync(p, 'utf-8')) as Session
    return data
  } catch {
    return null
  }
}

/** Save (upsert) a session */
export function saveSession(session: Session): void {
  ensureDir()
  const s = { ...session }
  s.messageCount = s.messages.length
  if (s.title === 'New Chat' && s.messages.length > 0) {
    s.title = autoTitle(s.messages)
  }
  s.updatedAt = new Date().toISOString()
  writeFileSync(sessionPath(s.id), JSON.stringify(s, null, 2), 'utf-8')
}

/** Delete a session */
export function deleteSession(id: string): void {
  const p = sessionPath(id)
  if (existsSync(p)) unlinkSync(p)
}

/** List all sessions as metadata (no messages) */
export function listSessions(): SessionMeta[] {
  ensureDir()
  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'))
  const sessions: SessionMeta[] = []
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(SESSIONS_DIR, f), 'utf-8')) as Session
      sessions.push({
        id: data.id,
        title: data.title || 'Untitled',
        model: data.model || '',
        wildMode: !!data.wildMode,
        createdAt: data.createdAt || '',
        updatedAt: data.updatedAt || '',
        messageCount: data.messages?.length || 0,
      })
    } catch { /* skip corrupt files */ }
  }
  return sessions.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
}

/**
 * Migrate a Swift SessionStore JSON file to the unified format.
 * Swift files use UUID strings as filenames and store messages in a slightly
 * different shape. This normalizes them.
 */
export function migrateSwiftSession(filePath: string): Session | null {
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
    // Swift ChatMessage: { id, role, content, toolName, toolSummary, toolId, timestamp, attachments }
    // Our Message: { role, content: string | ContentBlock[] }
    const messages: Message[] = (raw.messages || []).map((m: Record<string, unknown>) => {
      const role = m.role as 'user' | 'assistant'
      const content = m.content as string
      return { role, content } as Message
    })
    const session: Session = {
      id: raw.id || randomUUID(),
      title: raw.title || autoTitle(messages),
      messages,
      model: raw.model || '',
      wildMode: !!raw.wildMode,
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString(),
      messageCount: messages.length,
    }
    return session
  } catch {
    return null
  }
}

/** One-time migration of existing Swift-format sessions */
export function migrateAllSwiftSessions(): number {
  ensureDir()
  let migrated = 0
  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'))
  for (const f of files) {
    const full = join(SESSIONS_DIR, f)
    try {
      const raw = JSON.parse(readFileSync(full, 'utf-8'))
      // Detect Swift format: has "messages" array with objects containing "role" as string enum + "content" as string
      // and lacks "messageCount"
      if (raw.messages && Array.isArray(raw.messages) && raw.messageCount === undefined) {
        const session = migrateSwiftSession(full)
        if (session) {
          writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2), 'utf-8')
          // Remove old file if filename differs
          if (f !== `${session.id}.json`) {
            unlinkSync(full)
          }
          migrated++
        }
      }
    } catch { /* skip */ }
  }
  return migrated
}
