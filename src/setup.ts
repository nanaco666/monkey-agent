import chalk from 'chalk'
import { saveConfig } from './config/index.js'
import { selectList } from './ui/select.js'
import { askRaw } from './ui/input.js'
import { spinner } from './ui/spinner.js'
import { divider, success, error, hint } from './ui/layout.js'
import { kaomoji } from './ui/kaomoji.js'

interface Provider {
  name: string
  base_url: string | null | undefined
  models: { id: string; label: string }[]
  key_url: string | null
}

const PROVIDERS: Provider[] = [
  {
    name: 'Anthropic',
    base_url: undefined,
    key_url: 'https://console.anthropic.com/',
    models: [
      { id: 'claude-opus-4-5',          label: 'claude-opus-4-5        — most capable' },
      { id: 'claude-sonnet-4-5',         label: 'claude-sonnet-4-5      — balanced' },
      { id: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5       — fastest, cheapest' },
    ],
  },
  {
    name: 'OpenRouter',
    base_url: 'https://openrouter.ai/api/v1',
    key_url: 'https://openrouter.ai/keys',
    models: [],
  },
  {
    name: 'Custom endpoint',
    base_url: null,
    key_url: null,
    models: [],
  },
]

async function fetchModels(base_url: string, api_key: string): Promise<string[]> {
  const url = `${base_url.replace(/\/$/, '')}/v1/models`
  spinner.start('checking what models are around...')
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${api_key}` } })
    spinner.stop()
    if (!res.ok) throw new Error(`${res.status}`)
    const json = await res.json() as { data?: { id: string }[] }
    return (json.data ?? []).map((m: { id: string }) => m.id).filter(Boolean).sort()
  } catch {
    spinner.stop()
    return []
  }
}

export async function runSetup(): Promise<void> {
  console.log(chalk.rgb(245, 242, 235)('\n  Welcome. Let\'s get you set up.\n'))

  // ── Provider
  divider('Provider')
  const providerIdx = await selectList('Choose a provider:', PROVIDERS.map(p => p.name))
  const provider = PROVIDERS[providerIdx]

  // ── Base URL (custom only)
  let base_url = provider.base_url
  if (base_url === null) {
    divider('Endpoint')
    hint('e.g. https://your-proxy.com\n')
    while (true) {
      base_url = (await askRaw('  Base URL: ')).trim()
      if (!base_url) { error('Base URL is required.'); continue }
      if (!base_url.startsWith('http')) { error('Must start with http:// or https://'); continue }
      break
    }
  }

  // ── API Key
  divider('API Key')
  if (provider.key_url) hint(`Get your key: ${provider.key_url}\n`)
  let api_key = ''
  while (true) {
    api_key = (await askRaw('  API key: ')).trim()
    if (api_key) break
    error('API key is required.')
  }

  // ── Models
  divider('Model')
  let modelList = provider.models
  if (modelList.length === 0 && base_url) {
    const ids = await fetchModels(base_url, api_key)
    if (ids.length > 0) {
      modelList = ids.map(id => ({ id, label: id }))
    } else {
      hint('Could not fetch models — enter manually.\n')
    }
  }

  let model: string
  let fast_model: string

  if (modelList.length > 0) {
    const modelIdx = await selectList('Main model:', modelList.map(m => m.label))
    model = modelList[modelIdx].id

    divider('Fast Model')
    const fastIdx = await selectList('Fast model (used for quick tasks):', modelList.map(m => m.label))
    fast_model = modelList[fastIdx].id
  } else {
    while (true) {
      model = (await askRaw('\n  Main model: ')).trim()
      if (model) break
      error('Model name cannot be empty.')
    }
    fast_model = (await askRaw(`  Fast model [${model}]: `)).trim() || model
  }

  const cfg: Record<string, string> = { api_key, model, fast_model }
  if (base_url) cfg.base_url = base_url
  saveConfig(cfg)

  success(`Ready. ${kaomoji.random()}\n`)
}
