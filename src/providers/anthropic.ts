import Anthropic from '@anthropic-ai/sdk'
import type { Provider, StreamEvent, StreamResult, ChatMessage, ToolDef, SystemBlock, ContentBlock } from './types.js'

// Convert our internal message format to Anthropic format
function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages.map(msg => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content } as Anthropic.MessageParam
    }
    // Convert content blocks
    const blocks: Anthropic.ContentBlockParam[] = []
    for (const block of msg.content) {
      if (block.type === 'text') {
        blocks.push({ type: 'text', text: block.text })
      } else if (block.type === 'image') {
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: block.source.media_type as Anthropic.Base64ImageSource['media_type'],
            data: block.source.data,
          },
        })
      } else if (block.type === 'tool_use') {
        blocks.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input as Record<string, unknown> })
      } else if (block.type === 'tool_result') {
        blocks.push({ type: 'tool_result', tool_use_id: block.tool_use_id, content: block.content })
      }
    }
    return { role: msg.role, content: blocks } as Anthropic.MessageParam
  })
}

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

      const stream = client.messages.stream({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: systemBlocks as Anthropic.TextBlockParam[],
        tools: opts.tools as Anthropic.Tool[],
        messages: toAnthropicMessages(opts.messages),
      }, { signal: opts.signal })

      let currentToolId = ''
      let currentToolName = ''

      try {
        for await (const event of stream) {
          // 检查中止信号
          if (opts.signal?.aborted) break

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
      } catch (err: unknown) {
        // AbortError 是正常的中止，不要抛出
        if (opts.signal?.aborted) return {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        }
        throw err
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
        messages: toAnthropicMessages(opts.messages),
      }, { signal: opts.signal })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      return {
        text,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }
    },
  }
}
