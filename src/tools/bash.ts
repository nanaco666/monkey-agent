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
  // 如果已经中止，直接返回
  if (signal?.aborted) return 'Error: aborted'

  return new Promise((resolve) => {
    const shell = isWindows ? 'powershell.exe' : '/bin/bash'
    const shellArgs = isWindows ? ['/c', command] : ['-c', command]
    const child = spawn(shell, shellArgs, {
      timeout,
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })

    child.on('close', (code: number | null) => {
      const out = [stdout, stderr].filter(Boolean).join('\n').trim()
      if (signal?.aborted) {
        resolve('Error: command aborted')
        return
      }
      if (code !== null && code !== 0 && !out) {
        resolve(`Error: exit code ${code}`)
        return
      }
      resolve(out || '(no output)')
    })

    child.on('error', (err: Error) => {
      resolve(`Error: ${err.message}`)
    })

    // 监听中止信号，kill 子进程
    if (signal) {
      const onAbort = () => {
        child.kill('SIGTERM')
        // 给 2 秒优雅退出，否则强杀
        setTimeout(() => { child.kill('SIGKILL') }, 2000)
      }
      if (signal.aborted) {
        onAbort()
      } else {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    }
  })
}
