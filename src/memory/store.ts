import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { getProjectSlug } from './slug.js'

const BASE = join(homedir(), '.monkey-cli', 'memory')

export function getMemoryDir(): string {
  const dir = join(BASE, getProjectSlug())
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function getSessionDir(): string {
  const dir = join(getMemoryDir(), 'sessions')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export interface MemoryFile {
  filename: string
  name: string
  description: string
  type: 'user' | 'feedback' | 'project' | 'reference'
  body: string
}

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':')
    if (key && rest.length) meta[key.trim()] = rest.join(':').trim()
  }
  return { meta, body: match[2].trim() }
}

export function readMemoryIndex(): string {
  const path = join(getMemoryDir(), 'MEMORY.md')
  if (!existsSync(path)) return ''
  return readFileSync(path, 'utf-8')
}

export function listTopicFiles(): MemoryFile[] {
  const dir = getMemoryDir()
  return readdirSync(dir)
    .filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
    .map(f => {
      const content = readFileSync(join(dir, f), 'utf-8')
      const { meta, body } = parseFrontmatter(content)
      return {
        filename: f,
        name: meta.name ?? f,
        description: meta.description ?? '',
        type: (meta.type ?? 'project') as MemoryFile['type'],
        body,
      }
    })
}

export function writeMemoryFile(filename: string, content: string): void {
  const dir = getMemoryDir()
  writeFileSync(join(dir, filename), content, 'utf-8')
  updateIndex()
}

export function appendSession(entry: object): void {
  const date = new Date().toISOString().slice(0, 10)
  const path = join(getSessionDir(), `${date}.jsonl`)
  writeFileSync(path, JSON.stringify(entry) + '\n', { flag: 'a' })
}

function updateIndex(): void {
  const files = listTopicFiles()
  if (files.length === 0) return
  const lines = files.map(f => `- [${f.name}](${f.filename}) — ${f.description}`)
  const content = `# Memory Index\n\n${lines.join('\n')}\n`
  writeFileSync(join(getMemoryDir(), 'MEMORY.md'), content, 'utf-8')
}
