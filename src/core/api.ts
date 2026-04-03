import Anthropic from '@anthropic-ai/sdk'
import { homedir } from 'os'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import type { Config } from '../config/index.js'
import { toolDefs } from '../tools/index.js'
import { getProjectSlug } from '../memory/slug.js'

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
      if (content) sections.push(`### ${p}\n${content}`)
    } catch { /* skip */ }
  }

  return sections.length > 0 ? '\n\n## Project instructions (CLAUDE.md)\n' + sections.join('\n\n') : ''
}

export type Message = Anthropic.MessageParam

const SYSTEM_PROMPT_BASE = `You are Monkey, an AI coding assistant running in the terminal.
You help users with software engineering tasks: reading and writing code, running commands, searching files, debugging, and more.

## Rules
- Be concise. No filler words, no unnecessary preamble.
- Use tools to take action rather than just describing what to do.
- Prefer editing existing files over creating new ones.
- Always read a file before editing it.
- When running bash commands, prefer non-interactive ones. Avoid commands that require user input.
- Do not delete files unless explicitly asked.
- When you make a mistake, fix it directly.

## Memory
You have persistent memory across sessions via the memory_write tool.
- Use memory_write to save: user preferences, project context, feedback, and important facts.
- Save memories proactively when you learn something worth remembering.
- Keep memory entries concise and factual.
- Do NOT use bash to search for memory files. The memory path is given in the dynamic context below.`

export async function streamResponse(
  client: Anthropic,
  config: Config,
  messages: Message[],
  onText: (text: string) => void,
  onToolUse: (name: string, input: Record<string, unknown>) => void,
  memoryContext = '',
  allowedTools?: string[], // if set, only these tool names are available
): Promise<{ toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>; inputTokens: number }> {
  const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

  // Fixed part: cached. Dynamic part (cwd + memory): not cached.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const systemBlocks: any[] = [
    {
      type: 'text',
      text: SYSTEM_PROMPT_BASE,
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: `## Working directory\nCurrent directory: ${process.cwd()}\n\n## Memory path\n${join(homedir(), '.monkey-cli', 'memory', getProjectSlug())}${memoryContext}${loadClaudeMd()}`,
    },
  ]

  const stream = await client.messages.stream({
    model: config.model,
    max_tokens: 8096,
    system: systemBlocks,
    tools: (allowedTools
      ? toolDefs.filter(t => allowedTools.includes(t.name))
      : toolDefs) as Anthropic.Tool[],
    messages,
  })

  let currentToolId = ''
  let currentToolName = ''
  let currentInputJson = ''

  for await (const event of stream) {
    if (event.type === 'content_block_start') {
      if (event.content_block.type === 'text') {
        // text block starting
      } else if (event.content_block.type === 'tool_use') {
        currentToolId = event.content_block.id
        currentToolName = event.content_block.name
        currentInputJson = ''
        onToolUse(currentToolName, {})
      }
    } else if (event.type === 'content_block_delta') {
      if (event.delta.type === 'text_delta') {
        onText(event.delta.text)
      } else if (event.delta.type === 'input_json_delta') {
        currentInputJson += event.delta.partial_json
      }
    } else if (event.type === 'content_block_stop') {
      if (currentToolId) {
        try {
          const input = JSON.parse(currentInputJson || '{}')
          toolUses.push({ id: currentToolId, name: currentToolName, input })
        } catch {
          toolUses.push({ id: currentToolId, name: currentToolName, input: {} })
        }
        currentToolId = ''
        currentToolName = ''
        currentInputJson = ''
      }
    }
  }

  const finalMsg = await stream.finalMessage()
  return { toolUses, inputTokens: finalMsg.usage.input_tokens }
}

export function makeClient(config: Config): Anthropic {
  return new Anthropic({
    apiKey: config.api_key,
    ...(config.base_url ? {
      baseURL: config.base_url,
      // Custom endpoints (proxies, OpenRouter) use Bearer auth instead of x-api-key
      defaultHeaders: { 'Authorization': `Bearer ${config.api_key}` },
    } : {}),
  })
}
