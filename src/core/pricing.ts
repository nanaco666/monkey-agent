/**
 * Pricing per million tokens, keyed by provider.
 * Each provider has a `_default` and optional model-prefix overrides.
 */

interface ModelPricing {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
  currency?: string  // e.g. 'USD', 'CNY'; defaults to 'USD'
}

const PRICING: Record<string, Record<string, ModelPricing>> = {
  anthropic: {
    _default: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    // claude-3.5-haiku
    'claude-3-5-haiku': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
    'claude-3-haiku': { input: 0.25, output: 1.25, cacheRead: 0.03, cacheWrite: 0.3 },
    // claude-opus-4
    'claude-opus-4': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    'claude-3-opus': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  },
  openai: {
    _default: { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'o1': { input: 15, output: 60 },
    'o3-mini': { input: 1.1, output: 4.4 },
    'o4-mini': { input: 1.1, output: 4.4 },
  },
  zhipu: {
    _default: { input: 0.15, output: 0.15, currency: 'CNY' },
  },
}

/**
 * Get pricing for a model. Returns per-million-token rates and currency.
 */
export function getPricing(provider: string, model: string): ModelPricing {
  const providerPricing = PRICING[provider]
  if (!providerPricing) return { input: 0, output: 0 }

  // Match by prefix (longer prefix = more specific = higher priority)
  let bestMatch: string | null = null
  for (const key of Object.keys(providerPricing)) {
    if (key === '_default') continue
    if (model.startsWith(key) || model === key) {
      if (!bestMatch || key.length > bestMatch.length) {
        bestMatch = key
      }
    }
  }

  if (bestMatch) return providerPricing[bestMatch]
  return providerPricing._default ?? { input: 0, output: 0 }
}

/**
 * Calculate cost for given usage. Returns { cost, currency }.
 */
export function calculateCost(
  provider: string,
  model: string,
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number },
): { cost: number; currency: string } {
  const p = getPricing(provider, model)
  const costInput = usage.inputTokens * p.input / 1_000_000
  const costOutput = usage.outputTokens * p.output / 1_000_000
  const costCacheRead = usage.cacheReadTokens * (p.cacheRead ?? 0) / 1_000_000
  const costCacheWrite = usage.cacheCreationTokens * (p.cacheWrite ?? 0) / 1_000_000
  const cost = costInput + costOutput + costCacheRead + costCacheWrite
  return { cost, currency: p.currency ?? 'USD' }
}
