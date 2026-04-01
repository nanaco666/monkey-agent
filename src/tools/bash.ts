import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const TIMEOUT_MS = 30_000

export const bashToolDef = {
  name: 'bash',
  description: 'Execute a shell command in the current working directory. Returns stdout and stderr. Avoid interactive commands.',
  input_schema: {
    type: 'object' as const,
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      timeout_ms: { type: 'number', description: 'Timeout in milliseconds (default 30000)' },
    },
    required: ['command'],
  },
}

export async function runBash(command: string, timeout = TIMEOUT_MS): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout,
      maxBuffer: 1024 * 1024 * 10, // 10MB
      shell: '/bin/bash',
    })
    const out = [stdout, stderr].filter(Boolean).join('\n').trim()
    return out || '(no output)'
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string; killed?: boolean }
    if (e.killed) return `Error: command timed out after ${timeout}ms`
    const out = [e.stdout, e.stderr].filter(Boolean).join('\n').trim()
    return out || e.message || 'Unknown error'
  }
}
