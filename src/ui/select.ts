import * as readline from 'readline'
import chalk from 'chalk'

export function selectList(label: string, items: string[], defaultIdx = 0): Promise<number> {
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
          process.stdout.write(chalk.dim(`      ${item}\n`))
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
