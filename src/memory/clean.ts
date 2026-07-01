/**
 * Self-cleaning: automatically prune stale session logs and redundant memory.
 */
import { readdirSync, unlinkSync, statSync, existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import type { Config } from '../config/index.js'
import { simpleChat } from '../core/api.js'
import { getMemoryDir, getSessionDir, listTopicFiles, writeMemoryFile, readMemoryIndex, type MemoryFile } from './store.js'

// Session logs older than this are deleted
const SESSION_MAX_AGE_DAYS = 30

/** Allow deletion ONLY under ~/.monkey-cli/ — hard guard against accidental outside deletion */
const ALLOWED_ROOT = resolve(join(homedir(), '.monkey-cli'))

function isSafePath(p: string): boolean {
  return resolve(p).startsWith(ALLOWED_ROOT)
}

function safeUnlink(p: string): void {
  if (!isSafePath(p)) {
    console.error(`[clean] blocked unsafe delete: ${p} (outside ${ALLOWED_ROOT})`)
    return
  }
  unlinkSync(p)
}

export interface CleanReport {
  sessionsRemoved: number
  sessionsFreedKB: number
  memoryMerged: number
  memoryRemoved: number
  knowledgeRescued: number
}

/**
 * Before deleting memory files, extract any still-valuable knowledge
 * that isn't covered by remaining files. This prevents accidental loss
 * of useful info when cleaning up "stale" or "duplicate" entries.
 */
async function rescueKnowledge(config: Config, doomedFiles: MemoryFile[]): Promise<number> {
  if (doomedFiles.length === 0) return 0

  const remainingFiles = listTopicFiles().filter(
    f => !doomedFiles.some(d => d.filename === f.filename)
  )

  const doomedContent = doomedFiles.map(f =>
    `--- ${f.filename} (${f.name}) ---\n${f.body}`
  ).join('\n\n')

  const remainingSummary = remainingFiles.length > 0
    ? remainingFiles.map(f => `- ${f.name}: ${f.description}`).join('\n')
    : '(none)'

  const model = config.fast_model ?? config.model
  const res = await simpleChat(
    config,
    model,
    `You are a knowledge rescue assistant. Files are about to be DELETED. Extract any knowledge from them that is STILL VALUABLE and NOT already covered by the remaining files.

Remaining files (these will survive):
${remainingSummary}

Files about to be deleted:
${doomedContent}

For each piece of valuable knowledge NOT covered by remaining files, output:
SAVE | <type> | <name> | <description> | <content>

Where type is one of: user, feedback, project, reference
name is a short snake_case identifier (e.g. "project_auth_pattern")
description is a one-line summary
content is the full knowledge in markdown

If everything in the doomed files is already covered or truly stale, output: NONE`,
    [{ role: 'user', content: 'Extract knowledge before deletion.' }],
    1024,
  )

  const lines = res.text.trim().split('\n').filter(l => l.startsWith('SAVE |'))
  if (lines.length === 0) return 0

  let saved = 0
  for (const line of lines) {
    const parts = line.split(' | ')
    if (parts.length < 5) continue

    const type = parts[1].trim()
    const name = parts[2].trim()
    const description = parts[3].trim()
    const content = parts.slice(4).join(' | ').trim()

    if (!name || !content) continue
    if (!['user', 'feedback', 'project', 'reference'].includes(type)) continue

    const filename = `${name.endsWith('.md') ? name : name + '.md'}`
    const file = `---\nname: ${name}\ndescription: ${description}\ntype: ${type}\n---\n\n${content}\n`
    try {
      writeMemoryFile(filename, file)
      saved++
    } catch { /* skip if write fails */ }
  }

  return saved
}

/** Delete session logs older than SESSION_MAX_AGE_DAYS */
function cleanOldSessions(): { removed: number; freedKB: number } {
  const dir = getSessionDir()
  if (!existsSync(dir)) return { removed: 0, freedKB: 0 }

  const now = Date.now()
  const maxAge = SESSION_MAX_AGE_DAYS * 86_400_000
  let removed = 0
  let freedBytes = 0

  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.jsonl')) continue
    const full = join(dir, f)
    try {
      const st = statSync(full)
      if (now - st.mtimeMs > maxAge) {
        freedBytes += st.size
        safeUnlink(full)
        removed++
      }
    } catch { /* skip */ }
  }

  return { removed, freedKB: Math.round(freedBytes / 1024) }
}

/**
 * Use fast model to review memory files and suggest merges/deletions.
 * Returns number of files merged and removed.
 */
async function cleanMemory(config: Config): Promise<{ merged: number; removed: number; knowledgeRescued: number }> {
  const files = listTopicFiles()
  if (files.length <= 3) return { merged: 0, removed: 0, knowledgeRescued: 0 } // too few to bother

  const fileList = files.map((f, i) =>
    `${i + 1}. [${f.type}] ${f.name} (${f.filename}) — ${f.description}\n   Preview: ${f.body.slice(0, 100)}...`
  ).join('\n')

  const model = config.fast_model ?? config.model
  const res = await simpleChat(
    config,
    model,
    `You are a memory cleanup assistant. Review these memory files and identify:
1. Files that are DUPLICATES or heavily overlapping (should be merged)
2. Files that are STALE or NO LONGER RELEVANT (should be deleted)

Reply in this exact format (one action per line):
MERGE <number1> + <number2> → <new_name> | <new_description>
DELETE <number> | <reason>

If nothing needs cleaning, reply: CLEAN

Files:
${fileList}`,
    [{ role: 'user', content: 'Review these memory files for cleanup.' }],
    512,
  )

  const lines = res.text.trim().split('\n').filter(l => l.trim())
  if (lines.length === 1 && lines[0].trim() === 'CLEAN') return { merged: 0, removed: 0, knowledgeRescued: 0 }

  let merged = 0
  let removed = 0
  const toDelete = new Set<string>()

  for (const line of lines) {
    if (line.startsWith('DELETE')) {
      const numMatch = line.match(/DELETE\s+(\d+)/)
      if (numMatch) {
        const idx = parseInt(numMatch[1]) - 1
        if (idx >= 0 && idx < files.length) {
          toDelete.add(files[idx].filename)
          removed++
        }
      }
    }
  }

  // Before deleting, extract any still-valuable knowledge from files about to be removed
  let knowledgeRescued = 0
  if (toDelete.size > 0) {
    knowledgeRescued = await rescueKnowledge(config, files.filter(f => toDelete.has(f.filename)))
  }

  // Actually delete marked files
  const dir = getMemoryDir()
  for (const filename of toDelete) {
    try {
      safeUnlink(join(dir, filename))
    } catch { /* skip */ }
  }

  return { merged, removed, knowledgeRescued }
}

/** Run full self-clean cycle */
export async function selfClean(config: Config): Promise<CleanReport> {
  const sessionResult = cleanOldSessions()
  const { merged, removed, knowledgeRescued } = await cleanMemory(config)
  return {
    sessionsRemoved: sessionResult.removed,
    sessionsFreedKB: sessionResult.freedKB,
    memoryMerged: merged,
    memoryRemoved: removed,
    knowledgeRescued,
  }
}

/** Quick session-only clean (no LLM call, fast) */
export function cleanSessionsOnly(): { removed: number; freedKB: number } {
  return cleanOldSessions()
}
