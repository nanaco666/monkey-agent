import chalk from 'chalk'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null
  private frame = 0
  private msg = ''
  private active = false  // whether spinner is currently on screen
  private staticShown = false  // whether static placeholder is on screen

  /** Show a static dim placeholder immediately (no animation) */
  showStatic(msg: string): void {
    this.msg = msg
    this.staticShown = true
    this.active = true
    process.stdout.write('\x1B[?25l') // hide cursor
    process.stdout.write(`  ${chalk.dim('◆')} ${chalk.dim(msg)}`)
  }

  /** Upgrade from static placeholder to animated spinner */
  start(msg: string): void {
    this.msg = msg
    this.frame = 0
    this.staticShown = false
    this.active = true
    process.stdout.write('\x1B[?25l') // hide cursor
    if (!this.timer) {
      // First frame: overwrite static or fresh start
      process.stdout.write('\r\x1B[2K')
    }
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
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.active) {
      process.stdout.write('\r\x1B[2K') // clear whatever is on this line
      this.active = false
      this.staticShown = false
    }
    process.stdout.write('\x1B[?25h') // show cursor
  }

  private render(): void {
    process.stdout.write(`\r  ${chalk.dim(FRAMES[this.frame])} ${chalk.dim(this.msg)}`)
  }
}

export const spinner = new Spinner()
