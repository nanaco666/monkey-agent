import * as readline from 'readline'
import chalk from 'chalk'

// Display width of a single character (CJK/emoji = 2, others = 1)
function charDisplayWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0
  if (
    (cp >= 0x1100 && cp <= 0x115F) ||
    cp === 0x2329 || cp === 0x232A ||
    (cp >= 0x2E80 && cp <= 0x303E) ||
    (cp >= 0x3040 && cp <= 0x33FF) ||
    (cp >= 0x3400 && cp <= 0x4DBF) ||
    (cp >= 0x4E00 && cp <= 0x9FFF) ||
    (cp >= 0xA000 && cp <= 0xA4CF) ||
    (cp >= 0xAC00 && cp <= 0xD7AF) ||
    (cp >= 0xF900 && cp <= 0xFAFF) ||
    (cp >= 0xFE10 && cp <= 0xFE1F) ||
    (cp >= 0xFE30 && cp <= 0xFE4F) ||
    (cp >= 0xFE50 && cp <= 0xFE6F) ||
    (cp >= 0xFF00 && cp <= 0xFF60) ||
    (cp >= 0xFFE0 && cp <= 0xFFE6) ||
    (cp >= 0x1F300 && cp <= 0x1F9FF) ||
    (cp >= 0x20000 && cp <= 0x2FFFD) ||
    (cp >= 0x30000 && cp <= 0x3FFFD)
  ) return 2
  return 1
}

export function askRaw(question: string): Promise<string> {
  return new Promise(resolve => {
    process.stdout.write(chalk.bold.rgb(232, 98, 42)(question))
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    let input = ''
    const onKey = (_: unknown, key: { name: string; ctrl: boolean; sequence: string }) => {
      try {
        if (key.ctrl && key.name === 'c') { process.stdout.write('\n'); process.exit(0) }
        if (key.name === 'return') {
          process.stdin.removeListener('keypress', onKey)
          if (process.stdin.isTTY) process.stdin.setRawMode(false)
          process.stdout.write('\n')
          resolve(input)
        } else if (key.name === 'backspace') {
          // Use spread to properly handle Unicode code points (surrogate pairs, CJK)
          const chars = [...input]
          if (chars.length > 0) {
            const lastChar = chars[chars.length - 1]
            const w = charDisplayWidth(lastChar)
            input = chars.slice(0, -1).join('')
            process.stdout.write(`\x1B[${w}D${' '.repeat(w)}\x1B[${w}D`)
          }
        } else if (key.sequence && !key.ctrl && key.sequence >= ' ') {
          input += key.sequence
          process.stdout.write(key.sequence)
        }
      } catch {
        // Swallow errors from IME composition — don't crash
      }
    }
    process.stdin.on('keypress', onKey)
  })
}
