import { createAnthropicProvider } from './anthropic.js'
import { createOpenAICompatibleProvider } from './openai-compatible.js'
import type { Provider, ProviderConfig } from './types.js'

export type { Provider, StreamEvent, StreamResult, ChatMessage, ToolDef, SystemBlock, ContentBlock, ProviderConfig } from './types.js'

// Model prefix → provider key mapping
const MODEL_PROVIDER_MAP: Record<string, string> = {
  'claude-': 'anthropic',
  'gpt-': 'openai',
  'o1': 'openai',
  'o3': 'openai',
  'o4': 'openai',
  'glm-': 'zhipu',
  'chatglm': 'zhipu',
}

export function detectProvider(model: string): string {
  for (const [prefix, provider] of Object.entries(MODEL_PROVIDER_MAP)) {
    if (model.startsWith(prefix)) return provider
  }
  return 'anthropic' // default
}

export function createProvider(config: ProviderConfig): Provider {
  if (config.type === 'anthropic') {
    return createAnthropicProvider(config.api_key, config.base_url)
  }
  return createOpenAICompatibleProvider(config.api_key, config.base_url ?? '', config.name)
}

// Registry: holds instantiated providers keyed by name
const providers: Map<string, Provider> = new Map()

export function registerProvider(key: string, provider: Provider): void {
  providers.set(key, provider)
}

export function getProvider(key: string): Provider | undefined {
  return providers.get(key)
}

export function getProviderForModel(model: string): Provider | undefined {
  const key = detectProvider(model)
  return providers.get(key)
}

export function listProviders(): string[] {
  return [...providers.keys()]
}
