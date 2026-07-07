import { spawn } from 'child_process'
import { platform } from 'os'

const TIMEOUT_MS = 30_000
const isWindows = platform() === 'win32'

export const bashToolDef = {
  name: 'bash',
  description: `Execute a shell command in the current working directory. Returns stdout and stderr. Avoid interactive commands. ${isWindows ? 'Running on Windows — use cmd/powershell syntax.' : ''}`,
  input_schema: {
    type: 'object' as const,
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      timeout_ms: { type: 'number', description: 'Timeout in milliseconds (default 30000)' },
    },
    required: ['command'],
  },
}

export async function runBash(command: string, timeout = TIMEOUT_MS, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) return 'Error: aborted'

  return new Promise((resolve) => {
    const shell = isWindows ? 'powershell.exe' : '/bin/bash'
    const shellArgs = isWindows ? ['/c', command] : ['-c', command]
    // detached: true creates a new process group so we can kill the whole tree
    const child = spawn(shell, shellArgs, {
      detached: !isWindows,
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const killTree = (sig: NodeJS.Signals) => {
      try {
        if (isWindows) {
          child.kill(sig)
        } else if (child.pid !== undefined) {
          // Negative PID kills entire process group
          process.kill(-child.pid, sig)
        }
      } catch { /* process may have already exited */ }
    }

    const finish = (result: string) => {
      if (settled) return
      settled = true
      if (timeoutHandle) clearTimeout(timeoutHandle)
      resolve(result)
    }

    child.stdout?.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })

    child.on('close', (code: number | null) => {
      const out = [stdout, stderr].filter(Boolean).join('\n').trim()
      if (signal?.aborted) {
        finish('Error: command aborted')
        return
      }
      if (code !== null && code !== 0 && !out) {
        finish(`Error: exit code ${code}`)
        return
      }
      finish(out || '(no output)')
    })

    child.on('error', (err: Error) => {
      finish(`Error: ${err.message}`)
    })

    // Manual timeout: kill process group, then force-kill after 2s
    const timeoutHandle = setTimeout(() => {
      killTree('SIGTERM')
      setTimeout(() => killTree('SIGKILL'), 2000)
      // Resolve immediately so the agent isn't blocked waiting for orphan children
      const out = [stdout, stderr].filter(Boolean).join('\n').trim()
      finish(out ? `(timeout) ${out}` : `Error: command timed out after ${timeout}ms`)
    }, timeout)

    // AbortSignal handler
    if (signal) {
      const onAbort = () => {
        killTree('SIGTERM')
        setTimeout(() => killTree('SIGKILL'), 2000)
        finish('Error: command aborted')
      }
      if (signal.aborted) {
        onAbort()
      } else {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    }
  })
}
