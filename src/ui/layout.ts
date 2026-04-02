import chalk from 'chalk'

const WIDTH = 42

export function divider(label: string): void {
  const line = `── ${label} ${'─'.repeat(Math.max(0, WIDTH - label.length - 4))}`
  console.log(chalk.dim(`\n  ${line}\n`))
}

export function success(msg: string): void {
  console.log(chalk.rgb(107, 140, 78)(`\n  ✓ ${msg}`))
}

export function error(msg: string): void {
  console.log(chalk.red(`\n  ✗ ${msg}`))
}

export function hint(msg: string): void {
  console.log(chalk.dim(`  ${msg}`))
}
