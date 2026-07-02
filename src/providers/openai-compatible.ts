import OpenAI from 'openai'
import type { Provider, StreamEvent, StreamResult, ChatMessage, ToolDef, SystemBlock, ContentBlock } from './types.js'

// Convert our internal message format to OpenAI format
function toOpenAIMessages(system: string | SystemBlock[], messages: ChatMessage[]): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = []

  // System message
  const systemText = typeof system === 'string'
    ? system
    : system.map(b => b.text).join('\n\n')
  if (systemText) {
    result.push({ role: 'system', content: systemText })
  }

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content })
    } else {
      // Convert content blocks
      if (msg.role === 'user') {
        // User messages can have text, image, or tool_result blocks
        const parts: OpenAI.ChatCompletionMessageParam[] = []
        const multimodalParts: OpenAI.ChatCompletionContentPart[] = []
        for (const block of msg.content) {
          if (block.type === 'text') {
            multimodalParts.push({ type: 'text', text: block.text })
          } else if (block.type === 'image') {
            multimodalParts.push({
              type: 'image_url',
              image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
            })
          } else if (block.type === 'tool_result') {
            // Flush multimodal parts first
            if (multimodalParts.length > 0) {
              parts.push({ role: 'user', content: multimodalParts.splice(0) })
            }
            parts.push({ role: 'tool', tool_call_id: block.tool_use_id, content: block.content })
          }
        }
        if (multimodalParts.length > 0) {
          parts.push({ role: 'user', content: multimodalParts })
        }
        result.push(...parts)
      } else {
        // Assistant messages can have text + tool_use blocks
        const textParts: string[] = []
        const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = []
        for (const block of msg.content) {
          if (block.type === 'text') {
            textParts.push(block.text)
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: { name: block.name, arguments: JSON.stringify(block.input) },
            })
          }
        }
        const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: textParts.join('\n') || null,
        }
        if (toolCalls.length > 0) {
          assistantMsg.tool_calls = toolCalls
        }
        result.push(assistantMsg)
      }
    }
  }

  return result
}

function toOpenAITools(tools: ToolDef[]): OpenAI.ChatCompletionTool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }))
}

export function createOpenAICompatibleProvider(apiKey: string, baseUrl: string, displayName?: string): Provider {
  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl,
  })

  return {
    name: displayName ?? 'OpenAI-Compatible',

    async *stream(opts): AsyncGenerator<StreamEvent, StreamResult> {
      const messages = toOpenAIMessages(opts.system, opts.messages)
      const tools = toOpenAITools(opts.tools)

      const stream = await client.chat.completions.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        stream: true,
        stream_options: { include_usage: true },
      }, { signal: opts.signal })

      const toolCalls: Map<number, { id: string; name: string; args: string }> = new Map()
      let inputTokens = 0
      let outputTokens = 0

      try {
        for await (const chunk of stream) {
          // 检查中止信号
          if (opts.signal?.aborted) break

          const delta = chunk.choices?.[0]?.delta

          if (delta?.content) {
            yield { type: 'text', text: delta.content }
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index
              if (!toolCalls.has(idx)) {
                const id = tc.id ?? `call_${idx}`
                const name = tc.function?.name ?? ''
                toolCalls.set(idx, { id, name, args: '' })
                yield { type: 'tool_start', toolId: id, toolName: name }
              }
              if (tc.function?.arguments) {
                const entry = toolCalls.get(idx)!
                entry.args += tc.function.arguments
                yield { type: 'tool_delta', toolId: entry.id, inputJson: tc.function.arguments }
              }
            }
          }

          // Usage in final chunk
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? 0
            outputTokens = chunk.usage.completion_tokens ?? 0
          }

          // Finish reason — emit tool_end for all pending tools
          if (chunk.choices?.[0]?.finish_reason) {
            for (const [, entry] of toolCalls) {
              yield { type: 'tool_end', toolId: entry.id, toolName: entry.name }
            }
          }
        }
      } catch (err: unknown) {
        // AbortError 是正常的中止
        if (opts.signal?.aborted) return {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        }
        throw err
      }

      return {
        inputTokens,
        outputTokens,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }
    },

    async chat(opts) {
      const messages = toOpenAIMessages(opts.system ?? '', opts.messages)

      const response = await client.chat.completions.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        messages,
      }, { signal: opts.signal })

      const text = response.choices[0]?.message?.content ?? ''
      return {
        text,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      }
    },
  }
}
