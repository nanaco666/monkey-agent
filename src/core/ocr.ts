/**
 * Clipboard image handling: detect, save, and OCR images from macOS clipboard.
 * OCR is used as auxiliary context for vision models — the image itself is sent
 * as base64, and OCR text helps the model understand the content.
 */
import { execSync } from 'child_process'
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs'
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
 * Save clipboard image to a temp PNG file.
 * Returns the temp file path, or null if no image in clipboard.
 */
export function saveClipboardImage(): string | null {
  if (!clipboardHasImage()) return null

  const tmpPath = `/tmp/monkey_clip_${Date.now()}.png`

  const script = CLIPBOARD_APPLESCRIPT.replace('%s', tmpPath)
  try {
    const result = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf8',
      timeout: 10000,
    }).trim()

    if (!result.startsWith('OK') || !existsSync(tmpPath)) return null
    return tmpPath
  } catch {
    return null
  }
}

/**
 * Read an image file as base64 data URI.
 */
export function imageToBase64(filePath: string): { mediaType: string; data: string } | null {
  try {
    if (!existsSync(filePath)) return null
    const buf = readFileSync(filePath)
    const ext = filePath.toLowerCase()
    let mediaType = 'image/png'
    if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) mediaType = 'image/jpeg'
    else if (ext.endsWith('.gif')) mediaType = 'image/gif'
    else if (ext.endsWith('.webp')) mediaType = 'image/webp'
    return { mediaType, data: buf.toString('base64') }
  } catch {
    return null
  }
}

/**
 * Run OCR on an image file. Returns recognized text or null.
 */
export function ocrImageFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null

  try {
    spinner.start('OCR...')
    const text = execSync(`"${OCR_BIN}" "${filePath}"`, {
      encoding: 'utf8',
      timeout: 30000,
    }).trim()
    spinner.stop()

    if (!text) {
      console.log(chalk.dim('  no text recognized in image'))
      return null
    }

    const preview = text.length > 200 ? text.slice(0, 200) + '…' : text
    console.log(chalk.rgb(107, 140, 78)(`  ◆ OCR ${text.length} chars`))
    console.log(chalk.dim(`  ${preview}`))

    return text
  } catch (err) {
    spinner.stop()
    console.log(chalk.red(`  ✗ OCR failed: ${(err as Error).message?.split('\n')[0]}`))
    return null
  }
}

/**
 * Clean up temp image file.
 */
export function cleanupTempImage(filePath: string): void {
  try { unlinkSync(filePath) } catch {}
}
