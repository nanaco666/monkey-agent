import { execSync } from 'child_process'
import { basename } from 'path'

export function getProjectSlug(): string {
  try {
    const root = execSync('git rev-parse --show-toplevel', { stdio: ['pipe', 'pipe', 'pipe'] })
      .toString().trim()
    return basename(root).toLowerCase().replace(/[^a-z0-9-]/g, '-')
  } catch {
    return basename(process.cwd()).toLowerCase().replace(/[^a-z0-9-]/g, '-')
  }
}
