#!/usr/bin/env node
import { loadConfig, saveConfig } from './config/index.js'
import { printBanner } from './banner.js'
import { initProviders } from './core/api.js'
import { startRepl } from './core/repl.js'
import { runSetup } from './setup.js'
import { appendFileSync } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const CRASH_LOG = join(homedir(), '.monkey-cli', 'crash.log')

process.on('uncaughtException', (err) => {
  // IME composition can trigger errors from readline's keypress parser.
  // These originate from internal readline code and are non-fatal —
  // recover terminal state and continue instead of crashing.
  const isReadlineError = err.stack && (
    err.stack.includes('readline') ||
    err.stack.includes('emitKeypressEvents') ||
    err.stack.includes('keypress')
  )
  if (isReadlineError && process.stdin.isTTY) {
    // Recover terminal state without exiting
    try { process.stdin.setRawMode(false) } catch {}
    process.stdout.write('\x1B[?25h\x1B[?2004l')
    const msg = `[${new Date().toISOString()}] readline error (recovered): ${err.stack ?? err.message}\n`
    try { appendFileSync(CRASH_LOG, msg) } catch {}
    return
  }
  if (process.stdin.isTTY) {
    try { process.stdin.setRawMode(false) } catch {}
  }
  process.stdout.write('\x1B[?25h') // restore cursor
  process.stdout.write('\x1B[?2004l') // disable bracketed paste
  const msg = `[${new Date().toISOString()}] uncaughtException: ${err.stack ?? err.message}\n`
  try { appendFileSync(CRASH_LOG, msg) } catch {}
  process.stderr.write(msg)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  const msg = `[${new Date().toISOString()}] unhandledRejection: ${reason}\n`
  try { appendFileSync(CRASH_LOG, msg) } catch {}
})

// handle: monkey config set <key> <value>
const args = process.argv.slice(2)
if (args[0] === 'config' && args[1] === 'set' && args[2] && args[3]) {
  saveConfig({ [args[2]]: args[3] })
  console.log(`Saved ${args[2]} to ~/.monkey-cli/config.json`)
  process.exit(0)
}

let config = loadConfig()

// first-time setup wizard
if (!config) {
  await runSetup()
  config = loadConfig()
  if (!config) process.exit(1)
}

initProviders(config)

// Telegram bot mode: monkey telegram
if (args[0] === 'telegram' || args[0] === 'tg') {
  const { TelegramBot } = await import('./core/telegram.js')
  const token = config.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || ''
  if (!token) {
    console.error('Error: No Telegram bot token configured.')
    console.error('Set it via: monkey config set telegram_bot_token YOUR_TOKEN')
    console.error('Or set TELEGRAM_BOT_TOKEN env var.')
    process.exit(1)
  }
  const allowedUsers = config.telegram_allowed_users || []
  const bot = new TelegramBot(config, token, allowedUsers)
  process.on('SIGINT', () => { bot.stop(); process.exit(0) })
  process.on('SIGTERM', () => { bot.stop(); process.exit(0) })
  await bot.start()
  process.exit(0)
}

// Daemon mode: monkey daemon
if (args[0] === 'daemon') {
  const { startDaemon } = await import('./core/daemon.js')
  startDaemon()
  await new Promise<void>(() => {}) // never resolves — server keeps event loop alive
}

// App protocol mode: monkey app (JSON-RPC over stdio for macOS GUI)
if (args[0] === 'app') {
  await import('./core/app-protocol.js')
  await new Promise<void>(() => {}) // never resolves
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'))
printBanner(config.model, pkg.version)
await startRepl(config)
