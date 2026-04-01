import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CONFIG_DIR = join(homedir(), '.monkey-cli')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

export interface Config {
  api_key: string
  model: string
  fast_model: string
}

const DEFAULTS: Omit<Config, 'api_key'> = {
  model: 'claude-opus-4-6',
  fast_model: 'claude-sonnet-4-6',
}

export function loadConfig(): Config {
  // Priority 1: env var
  const envKey = process.env.ANTHROPIC_API_KEY

  // Priority 2: config file
  let fileConfig: Partial<Config> = {}
  if (existsSync(CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
    } catch {
      // ignore malformed config
    }
  }

  const api_key = envKey || fileConfig.api_key || ''

  if (!api_key) {
    console.error('\nNo API key found. Set ANTHROPIC_API_KEY or run: monkey config set api_key <key>\n')
    process.exit(1)
  }

  return {
    ...DEFAULTS,
    ...fileConfig,
    api_key,
  }
}

export function saveConfig(partial: Partial<Config>): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
  const current = existsSync(CONFIG_FILE)
    ? JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
    : {}
  writeFileSync(CONFIG_FILE, JSON.stringify({ ...current, ...partial }, null, 2))
}
