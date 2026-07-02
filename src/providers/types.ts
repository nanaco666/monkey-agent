// Unified provider interface for multi-model support

export interface ToolDef {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface StreamEvent {
  type: 'text' | 'tool_start' | 'tool_delta' | 'tool_end' | 'done'
  text?: string
  toolId?: string
  toolName?: string
  inputJson?: string
}

export interface StreamResult {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

export interface Provider {
  name: string

  /** Streaming chat with tool use support */
  stream(opts: {
    model: string
    system: string | SystemBlock[]
    messages: ChatMessage[]
    tools: ToolDef[]
    maxTokens: number
    signal?: AbortSignal
  }): AsyncGenerator<StreamEvent, StreamResult>

  /** Simple non-streaming completion (for compact/context) */
  chat(opts: {
    model: string
    system?: string
    messages: ChatMessage[]
    maxTokens: number
    signal?: AbortSignal
  }): Promise<{ text: string; inputTokens: number; outputTokens: number }>
}

export interface SystemBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export interface ProviderConfig {
  type: 'anthropic' | 'openai-compatible'
  api_key: string
  base_url?: string
  name?: string // display name like "OpenAI", "智谱"
}
