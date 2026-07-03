/**
 * Electron main process.
 * Spawns `monkey app` as a child process, communicates via JSON-RPC over stdio.
 */

const { app, BrowserWindow, ipcMain, Menu, nativeImage } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

// ── Globals ──

let mainWindow = null
let monkeyProc = null
let inputBuffer = ''
let nextRequestId = 1
const pendingCallbacks = new Map() // id -> { resolve, reject }

// ── Window ──

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 780,
    height: 600,
    minWidth: 480,
    minHeight: 360,
    title: 'Monkey',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── Monkey CLI process ──

function findMonkeyCli() {
  // 1. Check env variable
  if (process.env.MONKEY_CLI_PATH) return process.env.MONKEY_CLI_PATH

  // 2. Check common locations
  const isWin = process.platform === 'win32'
  const candidates = isWin
    ? [
        path.join(process.env.APPDATA || '', 'npm', 'monkey.cmd'),
        path.join(process.env.LOCALAPPDATA || '', 'npm', 'monkey.cmd'),
        'monkey.cmd',
      ]
    : ['/opt/homebrew/bin/monkey', '/usr/local/bin/monkey', 'monkey']

  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }

  return isWin ? 'monkey.cmd' : 'monkey'
}

function startMonkeyProcess() {
  if (monkeyProc) return

  const cliPath = findMonkeyCli()
  const isWin = process.platform === 'win32'

  // On Windows, use cmd.exe to run the .cmd wrapper
  const command = isWin ? 'cmd.exe' : cliPath
  const args = isWin ? ['/c', cliPath, 'app'] : ['app']

  monkeyProc = spawn(command, args, {
    cwd: require('os').homedir(),
    env: { ...process.env },
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  monkeyProc.stdout.on('data', (chunk) => {
    inputBuffer += chunk.toString()
    while (inputBuffer.includes('\n')) {
      const idx = inputBuffer.indexOf('\n')
      const line = inputBuffer.slice(0, idx).trim()
      inputBuffer = inputBuffer.slice(idx + 1)
      if (line) handleJsonRpc(line)
    }
  })

  monkeyProc.stderr.on('data', (chunk) => {
    const str = chunk.toString()
    if (str.trim()) console.error('[monkey stderr]', str.trim())
  })

  monkeyProc.on('close', (code) => {
    console.log('[monkey] process exited with code', code)
    monkeyProc = null
    sendToRenderer('monkey:disconnected', { code })
  })

  monkeyProc.on('error', (err) => {
    console.error('[monkey] process error:', err)
    sendToRenderer('monkey:error', { message: err.message })
  })

  // Auto-initialize
  sendRequest('initialize', {}).then((result) => {
    sendToRenderer('monkey:initialized', result)
  }).catch((err) => {
    sendToRenderer('monkey:error', { message: String(err) })
  })
}

function stopMonkeyProcess() {
  if (!monkeyProc) return
  try {
    writeLine(JSON.stringify({ jsonrpc: '2.0', method: 'shutdown' }))
    setTimeout(() => {
      if (monkeyProc) {
        monkeyProc.kill()
        monkeyProc = null
      }
    }, 1000)
  } catch {
    monkeyProc?.kill()
    monkeyProc = null
  }
}

// ── JSON-RPC ──

function sendRequest(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++
    const msg = { jsonrpc: '2.0', id, method }
    if (Object.keys(params).length > 0) msg.params = params

    pendingCallbacks.set(id, { resolve, reject })
    writeLine(JSON.stringify(msg))

    // Timeout after 60s
    setTimeout(() => {
      if (pendingCallbacks.has(id)) {
        pendingCallbacks.delete(id)
        reject(new Error('Request timeout'))
      }
    }, 60000)
  })
}

function sendNotification(method, params) {
  const msg = { jsonrpc: '2.0', method }
  if (params && Object.keys(params).length > 0) msg.params = params
  writeLine(JSON.stringify(msg))
}

function writeLine(line) {
  if (!monkeyProc?.stdin.writable) return
  monkeyProc.stdin.write(line + '\n')
}

function handleJsonRpc(line) {
  let json
  try {
    json = JSON.parse(line)
  } catch {
    return
  }

  if (json.id != null && pendingCallbacks.has(json.id)) {
    const cb = pendingCallbacks.get(json.id)
    pendingCallbacks.delete(json.id)
    if (json.error) {
      cb.reject(json.error)
    } else {
      cb.resolve(json.result)
    }
    return
  }

  // Stream notifications → forward to renderer
  if (json.method?.startsWith('stream/')) {
    sendToRenderer('monkey:' + json.method, json.params)
    return
  }

  // Other notifications
  if (json.method) {
    sendToRenderer('monkey:' + json.method, json.params)
  }
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data)
  }
}

// ── IPC from renderer ──

function setupIpc() {
  ipcMain.handle('chat', async (_event, prompt) => {
    try {
      const result = await sendRequest('chat', { prompt })
      return result
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('slash', async (_event, cmd) => {
    try {
      return await sendRequest('slash', { cmd })
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.on('abort', () => {
    sendNotification('abort', {})
  })

  ipcMain.on('set_model', (_event, model) => {
    sendNotification('set_model', { model })
  })

  ipcMain.on('set_wild', (_event, wild) => {
    sendNotification('set_wild', { wild })
  })

  ipcMain.on('clear', () => {
    sendNotification('clear', {})
  })

  ipcMain.on('shutdown', () => {
    stopMonkeyProcess()
  })
}

// ── App lifecycle ──

app.whenReady().then(() => {
  // Menu
  const menuTemplate = [
    {
      label: 'Monkey',
      submenu: [
        { role: 'about', label: 'About Monkey' },
        { type: 'separator' },
        { role: 'settings', label: 'Settings' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))

  createWindow()
  setupIpc()

  // Small delay to let window render, then start CLI
  setTimeout(() => startMonkeyProcess(), 500)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopMonkeyProcess()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopMonkeyProcess()
})
