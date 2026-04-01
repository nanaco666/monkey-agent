import chalk from 'chalk'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null
  private frame = 0
  private msg = ''

  start(msg: string): void {
    this.msg = msg
    this.frame = 0
    process.stdout.write('\x1B[?25l') // hide cursor
    this.render()
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % FRAMES.length
      this.render()
    }, 80)
  }

  update(msg: string): void {
    this.msg = msg
    this.render()
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    process.stdout.write('\r\x1B[2K') // clear line
    process.stdout.write('\x1B[?25h') // show cursor
  }

  private render(): void {
    process.stdout.write(`\r  ${chalk.gray(FRAMES[this.frame])} ${chalk.gray(this.msg)}`)
  }
}

export const spinner = new Spinner()
