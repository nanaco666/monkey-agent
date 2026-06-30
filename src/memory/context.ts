import type { Config } from '../config/index.js'
import { simpleChat } from '../core/api.js'
import { readMemoryIndex, listTopicFiles, type MemoryFile } from './store.js'

const MAX_FILES = 5

// Use fast model to pick relevant topic files for current conversation
async function selectRelevantFiles(
  config: Config,
  files: MemoryFile[],
  recentMessages: string,
): Promise<MemoryFile[]> {
  if (files.length <= MAX_FILES) return files

  const list = files.map((f, i) => `${i + 1}. [${f.type}] ${f.name} — ${f.description}`).join('\n')

  const model = config.fast_model ?? config.model
  const res = await simpleChat(
    config,
    model,
    '',
    [{
      role: 'user',
      content: `Given this conversation context:\n${recentMessages}\n\nWhich of these memory files are most relevant? Reply with comma-separated numbers only (max ${MAX_FILES}):\n${list}`,
    }],
    100,
  )

  const indices = res.text.match(/\d+/g)?.map(n => parseInt(n) - 1).filter(i => i >= 0 && i < files.length) ?? []
  return indices.length > 0 ? indices.map(i => files[i]) : files.slice(0, MAX_FILES)
}

export async function buildMemoryContext(
  config: Config,
  recentMessages: string,
): Promise<string> {
  const index = readMemoryIndex()
  const files = listTopicFiles()

  if (!index && files.length === 0) return ''

  const selected = files.length > 0
    ? await selectRelevantFiles(config, files, recentMessages)
    : []

  const parts: string[] = []
  if (index) parts.push(`## Memory Index\n${index}`)
  for (const f of selected) {
    parts.push(`## ${f.name} (${f.type})\n${f.body}`)
  }

  return parts.length > 0 ? `\n\n## Persistent Memory\n${parts.join('\n\n')}` : ''
}
