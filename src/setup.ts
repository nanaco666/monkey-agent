import * as readline from 'readline'
import chalk from 'chalk'
import { saveConfig } from './config/index.js'

interface Provider {
  name: string
  base_url: string | null | undefined
  models: { id: string; label: string }[]
  fast_models: { id: string; label: string }[]
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
    fast_models: [
      { id: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5       — recommended for quick tasks' },
      { id: 'claude-sonnet-4-5',         label: 'claude-sonnet-4-5      — balanced' },
    ],
  },
  {
    name: 'OpenRouter',
    base_url: 'https://openrouter.ai/api/v1',
    key_url: 'https://openrouter.ai/keys',
    models: [],
    fast_models: [],
  },
  {
    name: 'Custom endpoint',
    base_url: null,
    key_url: null,
    models: [],
    fast_models: [],
  },
]

// Fetch models from a /v1/models endpoint
async function fetchModels(base_url: string, api_key: string): Promise<string[]> {
  const base = base_url.replace(/\/$/, '')
  // Try the base as-is first (e.g. https://openrouter.ai/api/v1 → /models)
  // Then try appending /v1 (e.g. https://llm-proxy.tapsvc.com → /v1/models)
  const urls = base.endsWith('/v1')
    ? [`${base}/models`]
    : [`${base}/models`, `${base}/v1/models`]

  process.stdout.write(chalk.gray('\n  Fetching available models...'))

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${api_key}` },
      })
      if (!res.ok) continue
      const json = await res.json() as { data?: { id: string }[]; models?: { id: string }[] }
      const list = json.data ?? json.models ?? []
      const ids = list.map((m: { id: string }) => m.id).filter(Boolean).sort()
      if (ids.length > 0) {
        process.stdout.write('\r\x1B[2K')
        return ids
      }
    } catch {
      continue
    }
  }

  process.stdout.write('\r\x1B[2K')
  console.log(chalk.red('  Could not fetch models. Check your base URL and API key.\n'))
  return []
}

// Arrow-key selector. Returns selected index.
function selectList(label: string, items: string[], defaultIdx = 0): Promise<number> {
  return new Promise(resolve => {
    let cursor = defaultIdx
    let rendered = false

    // total lines: 1 blank + 1 label + 1 blank + N items = N+3
    const totalLines = items.length + 3

    const render = () => {
      if (rendered) {
        process.stdout.write(`\x1B[${totalLines}A\x1B[0J`)
      }
      rendered = true
      process.stdout.write(chalk.rgb(245, 242, 235)(`\n  ${label}\n\n`))
      items.forEach((item, i) => {
        if (i === cursor) {
          process.stdout.write(chalk.bold.rgb(232, 98, 42)(`    ❯ ${item}\n`))
        } else {
          process.stdout.write(chalk.gray(`      ${item}\n`))
        }
      })
    }

    process.stdout.write('\x1B[?25l')
    render()

    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    const onKey = (_: unknown, key: { name: string; ctrl: boolean }) => {
      if (key.ctrl && key.name === 'c') {
        process.stdout.write('\x1B[?25h')
        process.exit(0)
      }
      if (key.name === 'up')    { cursor = (cursor - 1 + items.length) % items.length; render() }
      if (key.name === 'down')  { cursor = (cursor + 1) % items.length; render() }
      if (key.name === 'return') {
        process.stdin.removeListener('keypress', onKey)
        if (process.stdin.isTTY) process.stdin.setRawMode(false)
        process.stdout.write('\x1B[?25h\n')
        resolve(cursor)
      }
    }

    process.stdin.on('keypress', onKey)
  })
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve))
}

export async function runSetup(): Promise<void> {
  console.log(chalk.rgb(245, 242, 235)('\n  Welcome to Monkey Agent. Let\'s get you set up.\n'))

  // Choose provider
  const providerIdx = await selectList('Choose a provider:', PROVIDERS.map(p => p.name))
  const provider = PROVIDERS[providerIdx]

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  // base_url for custom
  let base_url = provider.base_url
  if (base_url === null) {
    base_url = (await ask(rl, chalk.bold.rgb(232, 98, 42)('\n  Base URL: '))).trim()
    if (!base_url) { console.log(chalk.red('\n  Base URL is required.\n')); rl.close(); process.exit(1) }
  }

  // API key
  if (provider.key_url) {
    console.log(chalk.gray(`\n  Get your API key: ${provider.key_url}\n`))
  }
  const api_key = (await ask(rl, chalk.bold.rgb(232, 98, 42)('  API key: '))).trim()
  if (!api_key) { console.log(chalk.red('\n  API key is required.\n')); rl.close(); process.exit(1) }
  rl.close()

  // For providers without hardcoded models, fetch from /v1/models
  let modelList = provider.models
  if (modelList.length === 0 && base_url) {
    const ids = await fetchModels(base_url, api_key)
    if (ids.length > 0) {
      modelList = ids.map(id => ({ id, label: id }))
    }
  }

  let model: string
  let fast_model: string

  if (modelList.length > 0) {
    const modelIdx = await selectList('Main model:', modelList.map(m => m.label))
    model = modelList[modelIdx].id

    const fastIdx = await selectList('Fast model (used for quick tasks):', modelList.map(m => m.label))
    fast_model = modelList[fastIdx].id
  } else {
    // fallback: type manually
    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout })
    while (true) {
      model = (await ask(rl2, chalk.bold.rgb(232, 98, 42)('\n  Model (required): '))).trim()
      if (model) break
      console.log(chalk.red('  Model name cannot be empty.'))
    }
    fast_model = (await ask(rl2, chalk.bold.rgb(232, 98, 42)(`  Fast model [${model}]: `))).trim() || model
    rl2.close()
  }

  // Save
  const cfg: Record<string, string> = { api_key, model, fast_model }
  if (base_url) cfg.base_url = base_url
  saveConfig(cfg)

  console.log(chalk.rgb(107, 140, 78)('\n  ✓ Config saved to ~/.monkey-cli/config.json\n'))
}
