import Anthropic from '@anthropic-ai/sdk'
import type { Config } from '../config/index.js'
import { toolDefs } from '../tools/index.js'

export type Message = Anthropic.MessageParam

const SYSTEM_PROMPT = `You are Monkey, an AI coding assistant running in the terminal.
You help users with software engineering tasks: reading and writing code, running commands, searching files, debugging, and more.

## Rules
- Be concise. No filler words, no unnecessary preamble.
- Use tools to take action rather than just describing what to do.
- Prefer editing existing files over creating new ones.
- Always read a file before editing it.
- When running bash commands, prefer non-interactive ones. Avoid commands that require user input.
- Do not delete files unless explicitly asked.
- When you make a mistake, fix it directly.

## Working directory
Current directory: ${process.cwd()}
`

export async function streamResponse(
  client: Anthropic,
  config: Config,
  messages: Message[],
  onText: (text: string) => void,
  onToolUse: (name: string, input: Record<string, unknown>) => void,
): Promise<{ toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> }> {
  const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

  const stream = await client.messages.stream({
    model: config.model,
    max_tokens: 8096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cache_control: { type: 'ephemeral' } as any,
      },
    ],
    tools: toolDefs as Anthropic.Tool[],
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

  return { toolUses }
}

export function makeClient(config: Config): Anthropic {
  return new Anthropic({
    apiKey: config.api_key,
    ...(config.base_url ? { baseURL: config.base_url } : {}),
  })
}
