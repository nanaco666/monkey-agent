import { chmodSync, copyFileSync, mkdirSync } from 'node:fs'
// npm scripts also run in Windows cmd.exe, where chmod/mkdir -p/cp are absent.
if (process.platform !== 'win32') chmodSync('dist/index.js', 0o755)
mkdirSync('dist/scripts', { recursive: true })
copyFileSync('scripts/ocr', 'dist/scripts/ocr')
