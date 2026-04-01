import * as readline from 'readline'
import chalk from 'chalk'
import Anthropic from '@anthropic-ai/sdk'
import type { Config } from '../config/index.js'
import type { Message } from './api.js'
import { streamResponse } from './api.js'
import { executeTool } from '../tools/index.js'
import { spinner } from '../ui/spinner.js'
import { kaomoji } from '../ui/kaomoji.js'
import { buildMemoryContext } from '../memory/context.js'
import { appendSession } from '../memory/store.js'

const PROMPT = chalk.bold.rgb(232, 98, 42)('❯ ')

const SLOW_TOOL_MS = 300 // show spinner only if tool takes longer than this

const TOOL_MESSAGES: Record<string, string> = {
  bash:  'running...',
  read:  'reading...',
  write: 'scribbling...',
  edit:  'scribbling...',
  glob:  'searching...',
  grep:  'searching...',
}

const WRITE_TOOLS = new Set(['write', 'edit'])

function toolColor(name: string) {
  return WRITE_TOOLS.has(name) ? chalk.rgb(107, 140, 78) : chalk.gray
}

function printToolCall(name: string, input: Record<string, unknown>): void {
  if (name === 'memory_write') {
    process.stdout.write(chalk.rgb(240, 183, 49)(`\n  ◆ memory  ${input.name ?? ''}\n`))
    return
  }
  const color = toolColor(name)
  const detail = input.command ?? input.path ?? input.pattern ?? ''
  const summary = typeof detail === 'string' ? detail.slice(0, 60) : ''
  process.stdout.write(color(`\n  ◆ ${name}${summary ? '  ' + summary : ''}\n`))
}

function printToolResult(name: string, result: string, elapsed: number): void {
  if (name === 'memory_write') {
    const isError = result.startsWith('Error:')
    process.stdout.write(isError ? chalk.red(`    ✗ ${result}\n`) : chalk.rgb(240, 183, 49)(`    → remembered\n`))
    return
  }
  const isError = result.startsWith('Error:')
  const isWrite = WRITE_TOOLS.has(name)

  if (isError) {
    const msg = result.split('\n')[0].slice(0, 80)
    process.stdout.write(chalk.red(`    ✗ ${msg}\n`))
    return
  }

  if (isWrite) {
    process.stdout.write(chalk.rgb(107, 140, 78)(`    → saved\n`))
    return
  }

  const firstLine = result.split('\n')[0].slice(0, 60)
  const lineCount = result.split('\n').length
  const summary = lineCount > 1 ? `${firstLine}  (${lineCount} lines)` : firstLine
  const timeHint = elapsed > 1000 ? chalk.gray(` ${(elapsed / 1000).toFixed(1)}s`) : ''
  process.stdout.write(chalk.gray(`    → ${summary}${timeHint}\n`))
}

function readUserInput(): Promise<string | null> {
  return new Promise(resolve => {
    process.stdout.write(PROMPT)
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    let input = ''
    let ctrlCCount = 0

    const onKey = (_: unknown, key: { name: string; ctrl: boolean; sequence: string }) => {
      if (!key) return

      if (key.ctrl && key.name === 'c') {
        ctrlCCount++
        if (ctrlCCount >= 2) {
          process.stdin.removeListener('keypress', onKey)
          if (process.stdin.isTTY) process.stdin.setRawMode(false)
          resolve(null) // signal exit
          return
        }
        process.stdout.write(chalk.gray(`\n  (Ctrl+C again to exit)  ${kaomoji.upset()}\n`))
        process.stdout.write(PROMPT)
        input = ''
        setTimeout(() => { ctrlCCount = 0 }, 2000)
        return
      }

      ctrlCCount = 0

      if (key.name === 'return') {
        process.stdin.removeListener('keypress', onKey)
        if (process.stdin.isTTY) process.stdin.setRawMode(false)
        process.stdout.write('\n')
        resolve(input)
      } else if (key.name === 'backspace') {
        if (input.length > 0) {
          input = input.slice(0, -1)
          process.stdout.write('\x1B[1D \x1B[1D')
        }
      } else if (key.sequence && !key.ctrl && !key.name?.startsWith('f') && key.sequence >= ' ') {
        input += key.sequence
        process.stdout.write(key.sequence)
      }
    }

    process.stdin.on('keypress', onKey)
  })
}

export async function startRepl(client: Anthropic, config: Config): Promise<void> {
  const messages: Message[] = []
  let memoryContext = ''

  // Load memory context once at startup
  try {
    spinner.start('loading memory...')
    memoryContext = await buildMemoryContext(client, config, '')
    spinner.stop()
    if (memoryContext) process.stdout.write(chalk.gray('  ◆ memory  context loaded\n'))
  } catch {
    spinner.stop()
  }

  const handleSlash = (input: string): boolean => {
    const cmd = input.trim().toLowerCase()
    if (cmd === '/clear') {
      messages.length = 0
      console.log(chalk.rgb(100, 181, 246)('\n  ✦ Conversation cleared.\n'))
      return true
    }
    if (cmd === '/help') {
      console.log(chalk.rgb(245, 242, 235)([
        '',
        '  /clear   clear conversation history',
        '  /model   show current model',
        '  /help    show this help',
        '',
        '  Ctrl+C   interrupt response',
        '  Ctrl+C×2 exit',
        '',
      ].join('\n')))
      return true
    }
    if (cmd === '/model') {
      console.log(chalk.rgb(245, 242, 235)(`\n  model: ${config.model}\n`))
      return true
    }
    return false
  }

  process.stdout.write('\n')

  while (true) {
    const userInput = await readUserInput()

    // null means double Ctrl+C → exit
    if (userInput === null) {
      console.log(chalk.rgb(245, 242, 235)(`\n  bye ${kaomoji.random()}\n`))
      process.exit(0)
    }

    const trimmed = userInput.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('/')) {
      if (handleSlash(trimmed)) continue
    }

    messages.push({ role: 'user', content: trimmed })
    appendSession({ ts: new Date().toISOString(), role: 'user', content: trimmed })
    console.log()

    let responseText = ''
    let thinkingTimer: ReturnType<typeof setTimeout> | null = null

    const clearThinking = () => {
      if (thinkingTimer) { clearTimeout(thinkingTimer); thinkingTimer = null }
      spinner.stop()
    }

    try {
      while (true) {
        responseText = ''
        let thinkingStarted = false

        thinkingTimer = setTimeout(() => {
          thinkingStarted = true
          spinner.start('thinking...')
        }, SLOW_TOOL_MS)

        const { toolUses } = await streamResponse(
          client,
          config,
          messages,
          (text) => {
            if (!thinkingStarted) { clearTimeout(thinkingTimer!); thinkingTimer = null }
            else { clearThinking(); thinkingStarted = false }
            process.stdout.write(chalk.white(text))
            responseText += text
          },
          (_name, _input) => {
            clearThinking()
            thinkingStarted = false
          },
          memoryContext,
        )

        clearThinking()
        if (responseText) {
          process.stdout.write('\n')
          appendSession({ ts: new Date().toISOString(), role: 'assistant', content: responseText })
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const assistantBlocks: any[] = []
        if (responseText) assistantBlocks.push({ type: 'text', text: responseText })
        for (const t of toolUses) {
          assistantBlocks.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input })
        }
        if (assistantBlocks.length > 0) {
          messages.push({ role: 'assistant', content: assistantBlocks })
        }

        if (toolUses.length === 0) break

        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const t of toolUses) {
          printToolCall(t.name, t.input)

          // spinner for slow tools
          let slowTimer: ReturnType<typeof setTimeout> | null = null
          let spinnerShown = false
          const toolMsg = TOOL_MESSAGES[t.name] ?? 'working...'
          slowTimer = setTimeout(() => {
            spinnerShown = true
            spinner.start(toolMsg)
          }, SLOW_TOOL_MS)

          const start = Date.now()
          const result = await executeTool(t.name, t.input)
          const elapsed = Date.now() - start

          if (slowTimer) clearTimeout(slowTimer)
          if (spinnerShown) spinner.stop()

          printToolResult(t.name, result, elapsed)
          toolResults.push({ type: 'tool_result', tool_use_id: t.id, content: result })
        }

        messages.push({ role: 'user', content: toolResults })
        console.log()
      }
    } catch (err: unknown) {
      clearThinking()
      const msg = (err as Error).message || String(err)
      console.log(chalk.red(`\n  ✗ ${msg}`))
      console.log(chalk.rgb(240, 183, 49)(`  ${kaomoji.crash()}\n`))
    }

    process.stdout.write('\n')
  }
}
