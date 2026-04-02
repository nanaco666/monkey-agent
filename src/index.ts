#!/usr/bin/env node
import { loadConfig, saveConfig } from './config/index.js'
import { printBanner } from './banner.js'
import { makeClient } from './core/api.js'
import { startRepl } from './core/repl.js'
import { runSetup } from './setup.js'
import { appendFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CRASH_LOG = join(homedir(), '.monkey-cli', 'crash.log')

process.on('uncaughtException', (err) => {
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

const client = makeClient(config)

printBanner(config.model)
await startRepl(client, config)
