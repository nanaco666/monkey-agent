import type { Config } from '../config/index.js'
import { simpleChat } from '../core/api.js'
import { readMemoryIndex, listTopicFiles, type MemoryFile } from './store.js'

// Always load user/feedback files — they contain behavioral rules.
// Only project/reference files need relevance filtering.
// Total context budget for memory (approx chars, ~4 tokens/char for CJK)
const CONTEXT_BUDGET_CHARS = 6000

const MAX_LLM_SELECT = 3

function totalChars(files: MemoryFile[]): number {
  return files.reduce((sum, f) => sum + f.body.length, 0)
}

// Use fast model to pick relevant project/reference files
async function selectRelevantProjectFiles(
  config: Config,
  files: MemoryFile[],
  recentMessages: string,
): Promise<MemoryFile[]> {
  if (files.length <= MAX_LLM_SELECT) return files

  const list = files.map((f, i) => `${i + 1}. [${f.type}] ${f.name} — ${f.description}`).join('\n')

  const model = config.fast_model ?? config.model
  const res = await simpleChat(
    config,
    model,
    '',
    [{
      role: 'user',
      content: `Given this conversation context:\n${recentMessages}\n\nWhich of these memory files are most relevant? Reply with comma-separated numbers only (max ${MAX_LLM_SELECT}):\n${list}`,
    }],
    100,
  )

  const indices = res.text.match(/\d+/g)?.map(n => parseInt(n) - 1).filter(i => i >= 0 && i < files.length) ?? []
  return indices.length > 0 ? indices.map(i => files[i]) : files.slice(0, MAX_LLM_SELECT)
}

export async function buildMemoryContext(
  config: Config,
  recentMessages: string,
): Promise<string> {
  const index = readMemoryIndex()
  const files = listTopicFiles()

  if (!index && files.length === 0) return ''

  // Always include user/feedback files (behavioral rules, must always be active)
  const alwaysFiles = files.filter(f => f.type === 'user' || f.type === 'feedback')
  const projectFiles = files.filter(f => f.type === 'project' || f.type === 'reference')

  // Select relevant project files via LLM (only if there are too many)
  let selectedProject: MemoryFile[] = []
  if (projectFiles.length > 0) {
    // Check if all project files fit within budget first — skip LLM call if so
    const alwaysChars = totalChars(alwaysFiles)
    const projectChars = totalChars(projectFiles)
    if (alwaysChars + projectChars <= CONTEXT_BUDGET_CHARS) {
      selectedProject = projectFiles
    } else {
      selectedProject = await selectRelevantProjectFiles(config, projectFiles, recentMessages)
    }
  }

  const selected = [...alwaysFiles, ...selectedProject]

  // Trim to budget: keep always files, trim project files from the end
  const parts: string[] = []
  if (index) parts.push(`## Memory Index\n${index}`)

  let usedChars = index.length
  for (const f of selected) {
    if (usedChars + f.body.length > CONTEXT_BUDGET_CHARS && (f.type === 'project' || f.type === 'reference')) {
      break // only trim project/reference, never trim user/feedback
    }
    parts.push(`## ${f.name} (${f.type})\n${f.body}`)
    usedChars += f.body.length
  }

  return parts.length > 0 ? `\n\n## Persistent Memory\n${parts.join('\n\n')}` : ''
}
