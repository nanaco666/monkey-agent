import { execSync } from 'child_process'
import { platform } from 'os'

const isWindows = platform() === 'win32'

export const grepToolDef = {
  name: 'grep',
  description: 'Search for a pattern in files using ripgrep (rg) or grep. Returns matching lines with file and line number.',
  input_schema: {
    type: 'object' as const,
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search for' },
      path: { type: 'string', description: 'File or directory to search in (default: current directory)' },
      glob: { type: 'string', description: 'File glob filter, e.g. "*.ts"' },
      case_insensitive: { type: 'boolean', description: 'Case insensitive search' },
    },
    required: ['pattern'],
  },
}

export function runGrep(pattern: string, path?: string, glob?: string, caseInsensitive?: boolean): string {
  try {
    const target = path || '.'

    if (isWindows) {
      // Windows: try rg first, fallback to findstr
      const iFlag = caseInsensitive ? '-i' : ''
      const globFlag = glob ? `--glob "${glob}"` : ''
      const rgCmd = `rg --no-heading -n ${iFlag} ${globFlag} "${pattern.replace(/"/g, '\\"')}" ${target}`
      try {
        const result = execSync(rgCmd, { maxBuffer: 1024 * 1024 * 5, shell: 'powershell.exe' }).toString().trim()
        return result || 'No matches found'
      } catch {
        // fallback to findstr
        const findstrFlags = caseInsensitive ? '/i /s /n' : '/s /n'
        const findstrCmd = `findstr ${findstrFlags} "${pattern.replace(/"/g, '\\"')}" ${target}\\*`
        const result = execSync(findstrCmd, { maxBuffer: 1024 * 1024 * 5, shell: 'cmd.exe' }).toString().trim()
        return result || 'No matches found'
      }
    }

    // Unix: rg with grep fallback
    const iFlag = caseInsensitive ? '-i' : ''
    const globFlag = glob ? `--glob '${glob}'` : ''
    const cmd = `rg --no-heading -n ${iFlag} ${globFlag} '${pattern.replace(/'/g, "'\\''")}' ${target} 2>/dev/null || grep -rn ${iFlag} '${pattern.replace(/'/g, "'\\''")}' ${target}`
    const result = execSync(cmd, { maxBuffer: 1024 * 1024 * 5, shell: '/bin/bash' }).toString().trim()
    return result || 'No matches found'
  } catch {
    return 'No matches found'
  }
}
