import * as readline from 'readline'
import chalk from 'chalk'
import { saveConfig } from './config/index.js'

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

// Fetch models from {base_url}/v1/models
async function fetchModels(base_url: string, api_key: string): Promise<string[]> {
  const url = `${base_url.replace(/\/$/, '')}/v1/models`
  process.stdout.write(chalk.gray('\n  Fetching available models...'))
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${api_key}` } })
    if (!res.ok) throw new Error(`${res.status}`)
    const json = await res.json() as { data?: { id: string }[] }
    const ids = (json.data ?? []).map((m: { id: string }) => m.id).filter(Boolean).sort()
    process.stdout.write('\r\x1B[2K')
    return ids
  } catch {
    process.stdout.write('\r\x1B[2K')
    console.log(chalk.yellow('  Could not fetch models — enter model name manually.\n'))
    return []
  }
}

// Text input using raw process.stdin (no readline interface needed)
function askRaw(question: string): Promise<string> {
  return new Promise(resolve => {
    process.stdout.write(question)
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    let input = ''
    const onKey = (_: unknown, key: { name: string; ctrl: boolean; sequence: string }) => {
      if (key.ctrl && key.name === 'c') { process.stdout.write('\n'); process.exit(0) }
      if (key.name === 'return') {
        process.stdin.removeListener('keypress', onKey)
        if (process.stdin.isTTY) process.stdin.setRawMode(false)
        process.stdout.write('\n')
        resolve(input)
      } else if (key.name === 'backspace') {
        if (input.length > 0) {
          input = input.slice(0, -1)
          process.stdout.write('\x1B[1D \x1B[1D') // erase last char
        }
      } else if (key.sequence && !key.ctrl) {
        input += key.sequence
        process.stdout.write(key.sequence)
      }
    }
    process.stdin.on('keypress', onKey)
  })
}

// Arrow-key selector. Returns selected index.
function selectList(label: string, items: string[], defaultIdx = 0): Promise<number> {
  return new Promise(resolve => {
    let cursor = defaultIdx
    let rendered = false
    const totalLines = items.length + 3

    const render = () => {
      if (rendered) process.stdout.write(`\x1B[${totalLines}A\x1B[0J`)
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
      if (key.ctrl && key.name === 'c') { process.stdout.write('\x1B[?25h'); process.exit(0) }
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

export async function runSetup(): Promise<void> {
  console.log(chalk.rgb(245, 242, 235)('\n  Welcome to Monkey Agent. Let\'s get you set up.\n'))

  const providerIdx = await selectList('Choose a provider:', PROVIDERS.map(p => p.name))
  const provider = PROVIDERS[providerIdx]

  // base_url
  let base_url = provider.base_url
  if (base_url === null) {
    console.log(chalk.gray('\n  e.g. https://your-proxy.com\n'))
    while (true) {
      base_url = (await askRaw(chalk.bold.rgb(232, 98, 42)('  Base URL: '))).trim()
      if (!base_url) { console.log(chalk.red('  Base URL is required.')); continue }
      if (!base_url.startsWith('http')) { console.log(chalk.red('  Must start with http:// or https://')); continue }
      break
    }
  }

  // API key
  if (provider.key_url) console.log(chalk.gray(`\n  Get your API key: ${provider.key_url}\n`))
  let api_key = ''
  while (true) {
    api_key = (await askRaw(chalk.bold.rgb(232, 98, 42)('  API key: '))).trim()
    if (api_key) break
    console.log(chalk.red('  API key is required.'))
  }

  // Model list
  let modelList = provider.models
  if (modelList.length === 0 && base_url) {
    const ids = await fetchModels(base_url, api_key)
    if (ids.length > 0) modelList = ids.map(id => ({ id, label: id }))
  }

  let model: string
  let fast_model: string

  if (modelList.length > 0) {
    const modelIdx = await selectList('Main model:', modelList.map(m => m.label))
    model = modelList[modelIdx].id
    const fastIdx = await selectList('Fast model (used for quick tasks):', modelList.map(m => m.label))
    fast_model = modelList[fastIdx].id
  } else {
    while (true) {
      model = (await askRaw(chalk.bold.rgb(232, 98, 42)('\n  Main model: '))).trim()
      if (model) break
      console.log(chalk.red('  Model name cannot be empty.'))
    }
    fast_model = (await askRaw(chalk.bold.rgb(232, 98, 42)(`  Fast model [${model}]: `))).trim() || model
  }

  const cfg: Record<string, string> = { api_key, model, fast_model }
  if (base_url) cfg.base_url = base_url
  saveConfig(cfg)

  console.log(chalk.rgb(107, 140, 78)('\n  ✓ Config saved to ~/.monkey-cli/config.json\n'))
}
