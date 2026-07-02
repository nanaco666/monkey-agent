/**
 * Clipboard image OCR: grab image from macOS clipboard, run Vision OCR, return text.
 */
import { execSync } from 'child_process'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import chalk from 'chalk'
import { spinner } from '../ui/spinner.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OCR_BIN = join(__dirname, '..', 'scripts', 'ocr')

const CLIPBOARD_APPLESCRIPT = `
try
    set imageData to the clipboard as «class PNGf»
    set fh to open for access (POSIX file "%s") with write permission
    write imageData to fh
    close access fh
    return "OK"
on error errMsg
    return "ERROR:" & errMsg
end try
`

/**
 * Check if the clipboard currently holds an image.
 */
export function clipboardHasImage(): boolean {
  try {
    const info = execSync('osascript -e \'clipboard info\'', { encoding: 'utf8', timeout: 5000 })
    return info.includes('PNGf') || info.includes('JPEG') || info.includes('TIFF') || info.includes('GIF')
  } catch {
    return false
  }
}

/**
 * Save clipboard image to a temp file and run OCR on it.
 * Returns the recognized text, or null if no image in clipboard.
 */
export function clipboardImageToText(verbose = true): string | null {
  if (!clipboardHasImage()) {
    if (verbose) console.log(chalk.dim('  clipboard has no image'))
    return null
  }

  const tmpPath = `/tmp/monkey_clip_${Date.now()}.png`

  // Save clipboard image
  const script = CLIPBOARD_APPLESCRIPT.replace('%s', tmpPath)
  try {
    const result = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf8',
      timeout: 10000,
    }).trim()

    if (!result.startsWith('OK')) {
      if (verbose) console.log(chalk.red(`  ✗ failed to read clipboard image`))
      return null
    }
  } catch {
    if (verbose) console.log(chalk.red(`  ✗ failed to read clipboard image`))
    return null
  }

  if (!existsSync(tmpPath)) {
    if (verbose) console.log(chalk.red(`  ✗ no image saved`))
    return null
  }

  // Run OCR
  try {
    if (verbose) spinner.start('OCR...')
    const text = execSync(`"${OCR_BIN}" "${tmpPath}"`, {
      encoding: 'utf8',
      timeout: 30000,
    }).trim()
    if (verbose) spinner.stop()

    if (!text) {
      if (verbose) console.log(chalk.dim('  no text recognized in image'))
      return null
    }

    if (verbose) {
      const preview = text.length > 200 ? text.slice(0, 200) + '…' : text
      console.log(chalk.rgb(107, 140, 78)(`  ◆ OCR ${text.length} chars`))
      console.log(chalk.dim(`  ${preview}`))
    }

    return text
  } catch (err) {
    if (verbose) spinner.stop()
    console.log(chalk.red(`  ✗ OCR failed: ${(err as Error).message?.split('\n')[0]}`))
    return null
  } finally {
    try { unlinkSync(tmpPath) } catch {}
  }
}
