import Anthropic from '@anthropic-ai/sdk'
import type { Provider, StreamEvent, StreamResult, ChatMessage, ToolDef, SystemBlock } from './types.js'

export function createAnthropicProvider(apiKey: string, baseUrl?: string): Provider {
  const client = new Anthropic({
    apiKey,
    ...(baseUrl ? {
      baseURL: baseUrl,
      defaultHeaders: { 'Authorization': `Bearer ${apiKey}` },
    } : {}),
  })

  return {
    name: 'Anthropic',

    async *stream(opts): AsyncGenerator<StreamEvent, StreamResult> {
      const systemBlocks = typeof opts.system === 'string'
        ? [{ type: 'text' as const, text: opts.system }]
        : opts.system

      const stream = await client.messages.stream({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: systemBlocks as Anthropic.TextBlockParam[],
        tools: opts.tools as Anthropic.Tool[],
        messages: opts.messages as Anthropic.MessageParam[],
      })

      let currentToolId = ''
      let currentToolName = ''

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'text') {
            // text block starting
          } else if (event.content_block.type === 'tool_use') {
            currentToolId = event.content_block.id
            currentToolName = event.content_block.name
            yield { type: 'tool_start', toolId: currentToolId, toolName: currentToolName }
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text }
          } else if (event.delta.type === 'input_json_delta') {
            yield { type: 'tool_delta', toolId: currentToolId, inputJson: event.delta.partial_json }
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolId) {
            yield { type: 'tool_end', toolId: currentToolId, toolName: currentToolName }
            currentToolId = ''
            currentToolName = ''
          }
        }
      }

      const finalMsg = await stream.finalMessage()
      const usage = finalMsg.usage as unknown as Record<string, number>
      return {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
      }
    },

    async chat(opts) {
      const response = await client.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        ...(opts.system ? { system: opts.system } : {}),
        messages: opts.messages as Anthropic.MessageParam[],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      return {
        text,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }
    },
  }
}
