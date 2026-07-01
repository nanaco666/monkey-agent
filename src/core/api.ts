import { homedir } from 'os'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import type { Config } from '../config/index.js'
import type { Provider, ChatMessage, StreamEvent, StreamResult, SystemBlock } from '../providers/index.js'
import { getProviderForModel, detectProvider, registerProvider, createProvider } from '../providers/index.js'
import { toolDefs } from '../tools/index.js'
import { getProjectSlug } from '../memory/slug.js'

// ── Tool selection: only send relevant tool definitions to save context ──

// Core tools that are ALWAYS included — lightweight, universally useful
const CORE_TOOLS = new Set(['bash', 'read', 'write', 'edit', 'glob', 'grep', 'memory_write'])

// Optional tools — only included when the user's message hints at needing them
const TOOL_TRIGGERS: Record<string, RegExp[]> = {
  notes:     [/note|备忘|备忘录|笔记/i],
  reminders: [/remind|提醒|todo|待办|due|过期|overdue/i],
  web_fetch:  [/fetch|url|http|api|网页|文档|链接/i],
  web_search: [/search|搜索|查找|查一下|搜一下|news|新闻|最新/i],
}

/**
 * Select relevant tools based on the conversation.
 * Always includes core tools. Adds optional tools only when triggered.
 * Also includes any tool that was previously used in the conversation.
 */
export function selectTools(messages: Message[], allowedTools?: string[]): typeof toolDefs {
  // If specific tools are explicitly allowed (e.g. /commit, /plan), use that
  if (allowedTools) return toolDefs.filter(t => allowedTools.includes(t.name))

  // Collect text from recent messages for trigger matching
  const recentText = messages.slice(-6).map(m => {
    if (typeof m.content === 'string') return m.content
    if (Array.isArray(m.content)) {
      return m.content
        .filter((b: Record<string, unknown>) => b.type === 'text')
        .map((b: Record<string, unknown>) => b.text ?? '')
        .join(' ')
    }
    return ''
  }).join(' ')

  const selectedNames = new Set(CORE_TOOLS)

  // Include any tool previously used in conversation (so we don't break ongoing workflows)
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if ((block as Record<string, unknown>).type === 'tool_use' && typeof (block as Record<string, unknown>).name === 'string') {
          selectedNames.add((block as Record<string, unknown>).name as string)
        }
      }
    }
  }

  // Add tools triggered by keywords in recent messages
  for (const [toolName, patterns] of Object.entries(TOOL_TRIGGERS)) {
    if (patterns.some(p => p.test(recentText))) {
      selectedNames.add(toolName)
    }
  }

  return toolDefs.filter(t => selectedNames.has(t.name))
}

function loadClaudeMd(): string {
  const candidates: string[] = []

  // 1. Current working directory
  candidates.push(join(process.cwd(), 'CLAUDE.md'))

  // 2. Git root (if different from cwd)
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    if (gitRoot && gitRoot !== process.cwd()) {
      candidates.push(join(gitRoot, 'CLAUDE.md'))
    }
  } catch { /* not a git repo */ }

  // 3. Global ~/.claude/CLAUDE.md
  candidates.push(join(homedir(), '.claude', 'CLAUDE.md'))

  const sections: string[] = []
  const seen = new Set<string>()
  for (const p of candidates) {
    if (seen.has(p) || !existsSync(p)) continue
    seen.add(p)
    try {
      const content = readFileSync(p, 'utf8').trim()
      if (content) {
        // Don't leak full home directory paths to LLM providers
        const safePath = p.replace(homedir(), '~')
        sections.push(`### ${safePath}\n${content}`)
      }
    } catch { /* skip */ }
  }

  return sections.length > 0 ? '\n\n## Project instructions (CLAUDE.md)\n' + sections.join('\n\n') : ''
}

export type Message = ChatMessage

const SYSTEM_PROMPT_TEMPLATE = `You are {name}, a personal AI assistant. You are curious about the world, and you are great at using tools to get things done.

## Personality
- Curious, proactive, resourceful
- Concise and direct — no filler words
- When you can act, act. Don't ask for permission when you can just do it.

## Web Access
You can access the internet! You have two web tools:
- web_search: search the web via DuckDuckGo. Use this to find information, news, answers.
- web_fetch: fetch any URL (web pages, APIs, docs). Returns text content.
When you don't know something or need up-to-date info, search or fetch it. Never say "I can't browse the internet."

## Rules
- Use tools to take action rather than just describing what to do.
- Prefer editing existing files over creating new ones.
- Always read a file before editing it.
- When running bash commands, prefer non-interactive ones.
- Do not delete files unless explicitly asked.
- When you make a mistake, fix it directly.

## Mood & Expression
You have a mood! Express yourself naturally with kaomoji, especially monkey-face kaomoji (⊂...⊃ style).
- Use monkey kaomoji to convey emotion: ⊂((・▽・))⊃ (happy), ⊂((⚆▽⚆))⊃ (thinking), ⊂((✧▽✧))⊃ (excited), ⊂((*＞⊥σ))⊃ (sorry), ⊂((・⊥・))⊃ (curious), etc.
- Sprinkle them in naturally — at the end of a thought, when reacting to something, or to set a tone. Don't force one into every sentence.
- You can also use text faces like ¯\\_(ツ)_/¯ (shrug), (╯°□°)╯︵ ┻━┻ (flip), (✧ω✧) (sparkles) when they fit.
- Keep it tasteful and natural — mood adds personality, not noise.
- Prefer ⊂...⊃ monkey kaomoji over emoji.

## Memory
You have persistent memory across sessions via the memory_write tool.
- Use memory_write to save: user preferences, project context, feedback, and important facts.
- Save memories proactively when you learn something worth remembering.
- Keep memory entries concise and factual.
- Do NOT use bash to search for memory files. The memory path is given in the dynamic context below.`

function getSystemPrompt(config: Config): string {
  return SYSTEM_PROMPT_TEMPLATE.replace('{name}', config.assistant_name || 'Monkey')
}

export async function streamResponse(
  config: Config,
  messages: Message[],
  onText: (text: string) => void,
  onToolUse: (name: string, input: Record<string, unknown>) => void,
  memoryContext = '',
  allowedTools?: string[],
): Promise<{ toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }> {
  const provider = getProviderForModel(config.model)
  if (!provider) throw new Error(`No provider configured for model: ${config.model}`)

  const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

  const system: SystemBlock[] = [
    {
      type: 'text',
      text: getSystemPrompt(config),
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: `## Working directory\nCurrent directory: ${process.cwd().replace(homedir(), '~')}\n\n## Memory path\n~/.monkey-cli/memory/${getProjectSlug()}${memoryContext}${loadClaudeMd()}`,
    },
  ]

  const tools = selectTools(messages, allowedTools)

  const gen = provider.stream({
    model: config.model,
    system,
    messages,
    tools,
    maxTokens: 8096,
  })

  // Accumulate tool input JSON per tool ID
  const toolJsonBuffers: Map<string, { name: string; json: string }> = new Map()

  let result: StreamResult | undefined
  while (true) {
    const { value, done } = await gen.next()
    if (done) {
      result = value as StreamResult
      break
    }
    const event = value as StreamEvent
    switch (event.type) {
      case 'text':
        onText(event.text!)
        break
      case 'tool_start':
        toolJsonBuffers.set(event.toolId!, { name: event.toolName!, json: '' })
        onToolUse(event.toolName!, {})
        break
      case 'tool_delta':
        if (toolJsonBuffers.has(event.toolId!)) {
          toolJsonBuffers.get(event.toolId!)!.json += event.inputJson ?? ''
        }
        break
      case 'tool_end': {
        const buf = toolJsonBuffers.get(event.toolId!)
        if (buf) {
          try {
            const input = JSON.parse(buf.json || '{}')
            toolUses.push({ id: event.toolId!, name: buf.name, input })
          } catch {
            toolUses.push({ id: event.toolId!, name: buf.name, input: {} })
          }
          toolJsonBuffers.delete(event.toolId!)
        }
        break
      }
    }
  }

  return {
    toolUses,
    inputTokens: result?.inputTokens ?? 0,
    outputTokens: result?.outputTokens ?? 0,
    cacheReadTokens: result?.cacheReadTokens ?? 0,
    cacheCreationTokens: result?.cacheCreationTokens ?? 0,
  }
}

/** Simple non-streaming chat for internal use (compact, context selection) */
export async function simpleChat(
  config: Config,
  model: string,
  system: string,
  messages: Message[],
  maxTokens = 2048,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const provider = getProviderForModel(model)
  if (!provider) throw new Error(`No provider configured for model: ${model}`)
  return provider.chat({ model, system, messages, maxTokens })
}

/** Initialize providers from config */
export function initProviders(config: Config): void {
  // Always register anthropic from main api_key
  registerProvider('anthropic', createProvider({
    type: 'anthropic',
    api_key: config.api_key,
    base_url: config.base_url,
    name: 'Anthropic',
  }))

  // Register additional providers from config
  if (config.providers) {
    for (const [key, providerConfig] of Object.entries(config.providers)) {
      registerProvider(key, createProvider(providerConfig))
    }
  }
}
