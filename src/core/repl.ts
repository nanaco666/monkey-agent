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
import { shouldCompact, compactMessages } from './compact.js'
import { findCommand, ALL_PICKER_ENTRIES, type PickerEntry } from '../commands/index.js'

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
  return WRITE_TOOLS.has(name) ? chalk.rgb(107, 140, 78) : chalk.dim
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
  const timeHint = elapsed > 1000 ? chalk.dim(` ${(elapsed / 1000).toFixed(1)}s`) : ''
  process.stdout.write(chalk.dim(`    → ${summary}${timeHint}\n`))
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

// A segment is either a typed string or a paste block.
// We track segments so that backspace knows what is displayed on screen for each
// piece of input (typed chars echo 1:1; a paste block shows a short label).
type TypedSegment = { kind: 'typed'; text: string }
type PasteSegment = { kind: 'paste'; text: string; label: string }
type Segment = TypedSegment | PasteSegment

function segmentDisplayWidth(seg: Segment): number {
  if (seg.kind === 'paste') return seg.label.length // ASCII label, all width-1
  return [...seg.text].reduce((sum, ch) => sum + charDisplayWidth(ch), 0)
}

function readUserInput(prompt: string): Promise<string | null> {
  return new Promise(resolve => {
    process.stdout.write(prompt)
    process.stdout.write('\x1B[?2004h') // enable bracketed paste
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    const segments: Segment[] = [{ kind: 'typed', text: '' }]
    let ctrlCCount = 0
    let pasting = false
    let pasteBuffer = ''

    // Picker state
    let pickerMode = false
    let pickerFilter = ''
    let pickerCursor = 0
    let pickerRendered = false
    let placeholder = '' // dim args hint after command selection

    const fullInput = () => segments.map(s => s.text).join('')

    const finish = (value: string | null) => {
      process.stdin.removeListener('keypress', onKey)
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
      process.stdout.write('\x1B[?2004l')
      resolve(value)
    }

    // ── Picker helpers ─────────────────────────────────────────────────────
    const getFiltered = (): PickerEntry[] => {
      if (!pickerFilter) return ALL_PICKER_ENTRIES
      return ALL_PICKER_ENTRIES.filter(e => e.cmd.slice(1).startsWith(pickerFilter))
    }

    const renderPicker = () => {
      const filtered = getFiltered()
      const listLines = filtered.length || 1
      if (pickerRendered) {
        // Move up: 1 input line + listLines
        process.stdout.write(`\x1B[${1 + listLines}A\x1B[0J`)
      }
      pickerRendered = true
      // Input line
      process.stdout.write(prompt + '/' + pickerFilter + '\n')
      // Command list
      if (filtered.length === 0) {
        process.stdout.write(chalk.dim('  no matching commands\n'))
      } else {
        pickerCursor = Math.min(pickerCursor, filtered.length - 1)
        pickerCursor = Math.max(0, pickerCursor)
        filtered.forEach((entry, i) => {
          const cmdPad = entry.cmd.padEnd(10)
          if (i === pickerCursor) {
            process.stdout.write(
              chalk.bold.rgb(232, 98, 42)(`  ❯ ${cmdPad}`) +
              '  ' + entry.description + '\n'
            )
          } else {
            process.stdout.write(chalk.dim(`    ${cmdPad}  ${entry.description}\n`))
          }
        })
      }
    }

    const closePicker = (clearLine = true) => {
      if (pickerRendered) {
        const filtered = getFiltered()
        const listLines = filtered.length || 1
        process.stdout.write(`\x1B[${1 + listLines}A\x1B[0J`)
        pickerRendered = false
      }
      pickerMode = false
      pickerFilter = ''
      pickerCursor = 0
      if (clearLine) process.stdout.write('\r\x1B[2K')
    }

    const selectPickerEntry = (entry: PickerEntry) => {
      closePicker(false)
      process.stdout.write('\r\x1B[2K')
      if (!entry.argsPlaceholder) {
        // No args: submit immediately
        process.stdout.write(prompt + entry.cmd + '\n')
        finish(entry.cmd)
      } else {
        // Fill input with command, show dim placeholder
        const typed = entry.cmd + ' '
        segments[0] = { kind: 'typed', text: typed }
        placeholder = entry.argsPlaceholder
        process.stdout.write(prompt + typed + chalk.dim(placeholder))
        // Move cursor back before placeholder
        process.stdout.write(`\x1B[${placeholder.length}D`)
      }
    }

    // ── Key handler ────────────────────────────────────────────────────────
    const onKey = (_: unknown, key: { name: string; ctrl: boolean; sequence: string }) => {
      if (!key) return

      // Bracketed paste
      if (key.sequence === '\x1B[200~') { pasting = true; pasteBuffer = ''; return }
      if (key.sequence === '\x1B[201~') {
        pasting = false
        const cleaned = pasteBuffer.replace(/\r?\n/g, ' ').trim()
        pasteBuffer = ''
        if (!cleaned) return
        const label = `[pasted ${cleaned.length} chars]`
        const preview = cleaned.length > 120 ? cleaned.slice(0, 120) + '…' : cleaned
        segments.push({ kind: 'paste', text: cleaned, label })
        segments.push({ kind: 'typed', text: '' })
        process.stdout.write(chalk.dim(label))
        process.stdout.write(chalk.dim(`\n  ${preview}\n`))
        process.stdout.write(prompt)
        for (let i = 0; i < segments.length - 2; i++) {
          const s = segments[i]
          process.stdout.write(s.kind === 'typed' ? s.text : chalk.dim(s.label))
        }
        process.stdout.write(chalk.dim(label))
        return
      }
      if (pasting) { pasteBuffer += key.sequence ?? ''; return }

      // ── Picker mode keys ─────────────────────────────────────────────────
      if (pickerMode) {
        if (key.ctrl && key.name === 'c') { closePicker(); process.stdout.write(prompt); return }
        if (key.name === 'escape') { closePicker(); process.stdout.write(prompt); return }
        if (key.name === 'up') { pickerCursor--; renderPicker(); return }
        if (key.name === 'down') { pickerCursor++; renderPicker(); return }
        if (key.name === 'return') {
          const filtered = getFiltered()
          const entry = filtered[pickerCursor]
          if (entry) selectPickerEntry(entry)
          else { closePicker(); process.stdout.write(prompt) }
          return
        }
        if (key.name === 'backspace') {
          if (pickerFilter.length > 0) {
            pickerFilter = pickerFilter.slice(0, -1)
            pickerCursor = 0
            renderPicker()
          } else {
            // Backspace with empty filter: exit picker, restore empty input
            closePicker()
            process.stdout.write(prompt)
          }
          return
        }
        if (key.sequence && !key.ctrl && key.sequence >= ' ') {
          pickerFilter += key.sequence
          pickerCursor = 0
          renderPicker()
        }
        return
      }

      // ── Normal mode keys ─────────────────────────────────────────────────
      if (key.ctrl && key.name === 'c') {
        ctrlCCount++
        if (ctrlCCount >= 2) { process.stdout.write('\n'); finish(null); return }
        process.stdout.write(chalk.dim(`\n  (Ctrl+C again to exit)  ${kaomoji.upset()}\n`))
        process.stdout.write(prompt)
        segments.length = 0; segments.push({ kind: 'typed', text: '' })
        placeholder = ''
        setTimeout(() => { ctrlCCount = 0 }, 2000)
        return
      }
      ctrlCCount = 0

      if (key.name === 'return') {
        // Clear placeholder from display before submitting
        if (placeholder) {
          process.stdout.write(`\x1B[${placeholder.length}C\x1B[${placeholder.length}P`)
          placeholder = ''
        }
        process.stdout.write('\n')
        finish(fullInput())
        return
      }

      if (key.name === 'backspace') {
        // If placeholder is showing, erase it first visually
        if (placeholder) {
          process.stdout.write(`\x1B[${placeholder.length}C\x1B[${placeholder.length}P`)
          placeholder = ''
        }
        while (segments.length > 1) {
          const last = segments[segments.length - 1]
          if (last.kind === 'typed' && last.text.length === 0) {
            const prev = segments[segments.length - 2]
            if (prev.kind === 'paste') {
              const w = prev.label.length
              segments.splice(segments.length - 2, 2)
              process.stdout.write(`\x1B[${w}D${' '.repeat(w)}\x1B[${w}D`)
              return
            } else { segments.pop(); continue }
          }
          break
        }
        const last = segments[segments.length - 1]
        if (last.kind === 'paste') {
          const w = last.label.length; segments.pop()
          process.stdout.write(`\x1B[${w}D${' '.repeat(w)}\x1B[${w}D`)
        } else {
          const chars = [...last.text]
          if (chars.length > 0) {
            const lastChar = chars[chars.length - 1]
            const w = charDisplayWidth(lastChar)
            last.text = chars.slice(0, -1).join('')
            process.stdout.write(`\x1B[${w}D${' '.repeat(w)}\x1B[${w}D`)
          }
        }
        return
      }

      if (key.sequence && !key.ctrl && !key.name?.startsWith('f') && key.sequence >= ' ') {
        // Entering picker when '/' is first character
        if (key.sequence === '/' && fullInput() === '') {
          pickerMode = true
          pickerFilter = ''
          pickerCursor = 0
          pickerRendered = false
          renderPicker()
          return
        }
        // Clear placeholder on first keystroke
        if (placeholder) {
          process.stdout.write(`\x1B[${placeholder.length}C\x1B[${placeholder.length}P`)
          placeholder = ''
        }
        const last = segments[segments.length - 1]
        if (last.kind === 'typed') {
          last.text += key.sequence
        } else {
          segments.push({ kind: 'typed', text: key.sequence })
        }
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
    if (memoryContext) process.stdout.write(chalk.dim('  ◆ memory  context loaded\n'))
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
        '  /commit  generate and create a git commit',
        '  /plan    read-only planning mode',
        '  /memory  view and manage memory',
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

      // Slash commands like /commit, /plan, /memory
      const [cmdName, ...cmdArgParts] = trimmed.slice(1).split(' ')
      const slashCmd = findCommand(cmdName)
      if (slashCmd) {
        const cmdArgs = cmdArgParts.join(' ')
        const prompt = slashCmd.buildPrompt(cmdArgs)
        // Run as a fresh one-shot exchange with restricted tools, without polluting main messages
        const cmdMessages: typeof messages = [{ role: 'user', content: prompt }]
        console.log()
        let cmdText = ''
        let cmdThinkingTimer: ReturnType<typeof setTimeout> | null = null
        let cmdThinkingStarted = false
        const clearCmdThinking = () => {
          if (cmdThinkingTimer) { clearTimeout(cmdThinkingTimer); cmdThinkingTimer = null }
          spinner.stop()
        }
        try {
          while (true) {
            cmdText = ''
            cmdThinkingStarted = false
            cmdThinkingTimer = setTimeout(() => { cmdThinkingStarted = true; spinner.start('thinking...') }, SLOW_TOOL_MS)
            const { toolUses } = await streamResponse(
              client, config, cmdMessages,
              (text) => {
                if (!cmdThinkingStarted) { clearTimeout(cmdThinkingTimer!); cmdThinkingTimer = null }
                else { clearCmdThinking(); cmdThinkingStarted = false }
                process.stdout.write(text)
                cmdText += text
              },
              () => { clearCmdThinking(); cmdThinkingStarted = false },
              memoryContext,
              slashCmd.allowedTools,
            )
            clearCmdThinking()
            if (cmdText) process.stdout.write('\n')
            const assistantBlocks: unknown[] = []
            if (cmdText) assistantBlocks.push({ type: 'text', text: cmdText })
            for (const t of toolUses) assistantBlocks.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input })
            if (assistantBlocks.length > 0) cmdMessages.push({ role: 'assistant', content: assistantBlocks as never })
            if (toolUses.length === 0) break
            const toolResults: Anthropic.ToolResultBlockParam[] = []
            for (const t of toolUses) {
              printToolCall(t.name, t.input)
              let slowTimer: ReturnType<typeof setTimeout> | null = null
              let spinnerShown = false
              slowTimer = setTimeout(() => { spinnerShown = true; spinner.start(TOOL_MESSAGES[t.name] ?? 'working...') }, SLOW_TOOL_MS)
              const start = Date.now()
              const result = await executeTool(t.name, t.input)
              const elapsed = Date.now() - start
              if (slowTimer) clearTimeout(slowTimer)
              if (spinnerShown) spinner.stop()
              printToolResult(t.name, result, elapsed)
              toolResults.push({ type: 'tool_result', tool_use_id: t.id, content: result })
            }
            cmdMessages.push({ role: 'user', content: toolResults })
            console.log()
          }
        } catch (err: unknown) {
          clearCmdThinking()
          console.log(chalk.red(`\n  ✗ ${(err as Error).message || String(err)}`))
        }
        process.stdout.write('\n')
        continue
      }
    }

    messages.push({ role: 'user', content: trimmed })
    appendSession({ ts: new Date().toISOString(), role: 'user', content: trimmed })
    console.log()

    let responseText = ''
    let thinkingTimer: ReturnType<typeof setTimeout> | null = null
    let lastInputTokens = 0

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

        const { toolUses, inputTokens: tokens } = await streamResponse(
          client,
          config,
          messages,
          (text) => {
            if (!thinkingStarted) { clearTimeout(thinkingTimer!); thinkingTimer = null }
            else { clearThinking(); thinkingStarted = false }
            process.stdout.write(text) // use terminal's native foreground color
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

        lastInputTokens = tokens
        messages.push({ role: 'user', content: toolResults })
        console.log()
      }

      // Auto-compact when context gets too long
      if (shouldCompact(lastInputTokens)) {
        try {
          spinner.start('compacting context...')
          const compacted = await compactMessages(client, config, messages)
          spinner.stop()
          const removed = messages.length - compacted.length
          messages.length = 0
          messages.push(...compacted)
          process.stdout.write(chalk.dim(`  ◆ context compacted  (−${removed} messages)\n\n`))
        } catch {
          spinner.stop()
        }
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
