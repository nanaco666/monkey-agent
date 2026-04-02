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

// Returns the display width of a single character (wide chars like CJK/emoji = 2)
function charDisplayWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0
  if (
    (cp >= 0x1100 && cp <= 0x115F) ||   // Hangul Jamo
    cp === 0x2329 || cp === 0x232A ||
    (cp >= 0x2E80 && cp <= 0x303E) ||   // CJK Radicals
    (cp >= 0x3040 && cp <= 0x33FF) ||   // Japanese
    (cp >= 0x3400 && cp <= 0x4DBF) ||   // CJK Extension A
    (cp >= 0x4E00 && cp <= 0x9FFF) ||   // CJK Unified
    (cp >= 0xA000 && cp <= 0xA4CF) ||   // Yi
    (cp >= 0xAC00 && cp <= 0xD7AF) ||   // Hangul Syllables
    (cp >= 0xF900 && cp <= 0xFAFF) ||   // CJK Compatibility
    (cp >= 0xFE10 && cp <= 0xFE1F) ||   // Vertical Forms
    (cp >= 0xFE30 && cp <= 0xFE4F) ||   // CJK Compatibility Forms
    (cp >= 0xFE50 && cp <= 0xFE6F) ||   // Small Forms
    (cp >= 0xFF00 && cp <= 0xFF60) ||   // Fullwidth Forms
    (cp >= 0xFFE0 && cp <= 0xFFE6) ||   // Fullwidth Signs
    (cp >= 0x1F300 && cp <= 0x1F9FF) || // Emoji
    (cp >= 0x20000 && cp <= 0x2FFFD) || // CJK Extension B-F
    (cp >= 0x30000 && cp <= 0x3FFFD)
  ) return 2
  return 1
}

function readUserInput(prompt: string): Promise<string | null> {
  return new Promise(resolve => {
    process.stdout.write(prompt)
    // Enable bracketed paste mode
    process.stdout.write('\x1B[?2004h')
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    let input = ''
    let ctrlCCount = 0
    let pasting = false
    let pasteBuffer = ''

    const finish = (value: string | null) => {
      process.stdin.removeListener('keypress', onKey)
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
      process.stdout.write('\x1B[?2004l') // disable bracketed paste
      resolve(value)
    }

    const onKey = (_: unknown, key: { name: string; ctrl: boolean; sequence: string }) => {
      if (!key) return

      // Bracketed paste start: \x1B[200~
      if (key.sequence === '\x1B[200~') {
        pasting = true
        pasteBuffer = ''
        return
      }
      // Bracketed paste end: \x1B[201~
      if (key.sequence === '\x1B[201~') {
        pasting = false
        // Strip newlines from pasted content (prevent accidental send)
        const cleaned = pasteBuffer.replace(/\r?\n/g, ' ').trim()
        if (cleaned) {
          input += cleaned
          // Show [pasted text] label instead of raw content
          process.stdout.write(chalk.gray('[pasted text]'))
        }
        pasteBuffer = ''
        return
      }
      // Buffer paste content without echoing
      if (pasting) {
        pasteBuffer += key.sequence ?? ''
        return
      }

      if (key.ctrl && key.name === 'c') {
        ctrlCCount++
        if (ctrlCCount >= 2) {
          process.stdout.write('\n')
          finish(null)
          return
        }
        process.stdout.write(chalk.gray(`\n  (Ctrl+C again to exit)  ${kaomoji.upset()}\n`))
        process.stdout.write(prompt)
        input = ''
        setTimeout(() => { ctrlCCount = 0 }, 2000)
        return
      }

      ctrlCCount = 0

      if (key.name === 'return') {
        process.stdout.write('\n')
        finish(input)
      } else if (key.name === 'backspace') {
        const chars = [...input]
        if (chars.length > 0) {
          const lastChar = chars[chars.length - 1]
          const w = charDisplayWidth(lastChar)
          input = chars.slice(0, -1).join('')
          process.stdout.write(`\x1B[${w}D${' '.repeat(w)}\x1B[${w}D`)
        }
      } else if (key.sequence && !key.ctrl && !key.name?.startsWith('f') && key.sequence >= ' ') {
        input += key.sequence
        process.stdout.write(key.sequence)
      }
    }

    process.stdin.on('keypress', onKey)
  })
}

const DANGEROUS_PATTERNS = [
  /\brm\s/,
  /\brmdir\b/,
  /git\s+push\s+.*(-f|--force)\b/,
  /\bchmod\b.*\/(bin|etc|usr|sys|proc)\b/,
  /\b(kill|pkill)\b/,
  /\|\s*(bash|sh)\b/,
]

function isDangerous(command: string): boolean {
  return DANGEROUS_PATTERNS.some(p => p.test(command))
}

export async function startRepl(client: Anthropic, config: Config): Promise<void> {
  const messages: Message[] = []
  let memoryContext = ''
  let wildMode = false

  const getPrompt = () => wildMode
    ? chalk.bold.rgb(232, 98, 42)('🐒 ❯ ')
    : chalk.bold.rgb(232, 98, 42)('❯ ')

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
    if (cmd === '/wild') {
      wildMode = true
      console.log(chalk.rgb(240, 183, 49)('\n  🐒 wild mode — all commands allowed\n'))
      return true
    }
    if (cmd === '/tame') {
      wildMode = false
      console.log(chalk.rgb(100, 181, 246)('\n  ✦ tame mode — dangerous commands blocked\n'))
      return true
    }
    if (cmd === '/help') {
      console.log(chalk.rgb(245, 242, 235)([
        '',
        '  /clear   clear conversation history',
        '  /model   show current model',
        '  /wild    unlock dangerous commands 🐒',
        '  /tame    re-enable safety mode',
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
    const userInput = await readUserInput(getPrompt())

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

          // tame mode: block dangerous bash commands
          if (!wildMode && t.name === 'bash' && isDangerous(t.input.command as string ?? '')) {
            if (slowTimer) clearTimeout(slowTimer)
            const blocked = 'Error: command blocked in tame mode. Switch to wild mode with /wild to allow.'
            printToolResult(t.name, blocked, 0)
            toolResults.push({ type: 'tool_result', tool_use_id: t.id, content: blocked })
            continue
          }

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
