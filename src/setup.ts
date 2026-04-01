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
      { id: 'claude-opus-4-5',            label: 'claude-opus-4-5        — most capable' },
      { id: 'claude-sonnet-4-5',           label: 'claude-sonnet-4-5      — balanced' },
      { id: 'claude-haiku-4-5-20251001',   label: 'claude-haiku-4-5       — fastest, cheapest' },
    ],
    fast_models: [
      { id: 'claude-haiku-4-5-20251001',   label: 'claude-haiku-4-5       — recommended for quick tasks' },
      { id: 'claude-sonnet-4-5',           label: 'claude-sonnet-4-5      — balanced' },
    ],
  },
  {
    name: 'OpenRouter',
    base_url: 'https://openrouter.ai/api/v1',
    key_url: 'https://openrouter.ai/keys',
    models: [
      { id: 'anthropic/claude-opus-4-5',       label: 'anthropic/claude-opus-4-5' },
      { id: 'anthropic/claude-sonnet-4-5',      label: 'anthropic/claude-sonnet-4-5' },
      { id: 'anthropic/claude-haiku-4-5',       label: 'anthropic/claude-haiku-4-5' },
      { id: 'openai/gpt-4o',                    label: 'openai/gpt-4o' },
      { id: 'openai/gpt-4o-mini',               label: 'openai/gpt-4o-mini' },
      { id: 'google/gemini-2.0-flash-001',      label: 'google/gemini-2.0-flash-001' },
      { id: 'deepseek/deepseek-r1',             label: 'deepseek/deepseek-r1' },
    ],
    fast_models: [
      { id: 'anthropic/claude-haiku-4-5',       label: 'anthropic/claude-haiku-4-5' },
      { id: 'openai/gpt-4o-mini',               label: 'openai/gpt-4o-mini' },
      { id: 'google/gemini-2.0-flash-001',      label: 'google/gemini-2.0-flash-001' },
    ],
  },
  {
    name: 'Custom endpoint',
    base_url: null,
    key_url: null,
    models: [],
    fast_models: [],
  },
]

// Arrow-key selector. Returns selected index.
function selectList(label: string, items: string[], defaultIdx = 0): Promise<number> {
  return new Promise(resolve => {
    let cursor = defaultIdx
    let rendered = false

    // total lines printed: 1 blank + 1 label + 1 blank + N items = N+3
    const totalLines = items.length + 3

    const render = () => {
      if (rendered) {
        // move up to start of block, clear to end of screen
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

    // hide cursor while selecting
    process.stdout.write('\x1B[?25l')
    render()

    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    const onKey = (_: unknown, key: { name: string; ctrl: boolean }) => {
      if (key.ctrl && key.name === 'c') {
        process.stdout.write('\x1B[?25h')
        process.exit(0)
      }
      if (key.name === 'up')   { cursor = (cursor - 1 + items.length) % items.length; render() }
      if (key.name === 'down') { cursor = (cursor + 1) % items.length; render() }
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
  const providerIdx = await selectList(
    'Choose a provider:',
    PROVIDERS.map(p => p.name),
  )
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

  // Model selection
  let model: string
  let fast_model: string

  if (provider.models.length > 0) {
    const modelIdx = await selectList(
      'Main model:',
      provider.models.map(m => m.label),
    )
    model = provider.models[modelIdx].id

    const fastIdx = await selectList(
      'Fast model (used for quick tasks):',
      provider.fast_models.map(m => m.label),
    )
    fast_model = provider.fast_models[fastIdx].id
  } else {
    // custom: type manually
    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout })
    model = (await ask(rl2, chalk.bold.rgb(232, 98, 42)('\n  Model: '))).trim()
    fast_model = (await ask(rl2, chalk.bold.rgb(232, 98, 42)(`  Fast model [${model}]: `))).trim() || model
    rl2.close()
  }

  // Save
  const cfg: Record<string, string> = { api_key, model, fast_model }
  if (base_url) cfg.base_url = base_url
  saveConfig(cfg)

  console.log(chalk.rgb(107, 140, 78)('\n  ✓ Config saved to ~/.monkey-cli/config.json\n'))
}
