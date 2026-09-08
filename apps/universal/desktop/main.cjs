const { app, BrowserWindow, shell, session, dialog } = require('electron')
// The same exported Expo UI is served by `monkey serve` on the selected host.
const address = process.env.MONKEY_DESKTOP_URL || 'http://127.0.0.1:8787'
let url
try {
  url = new URL(address)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error()
  if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error()
} catch { console.error('MONKEY_DESKTOP_URL must be HTTPS, or loopback HTTP.'); app.exit(1) }
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  function createWindow() {
    const window = new BrowserWindow({ width: 1180, height: 840, minWidth: 390, minHeight: 600, title: 'Monkey', backgroundColor: '#F8F7F3', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } })
    window.webContents.setWindowOpenHandler(({ url: target }) => {
      if (/^https?:\/\//i.test(target)) void shell.openExternal(target)
      return { action: 'deny' }
    })
    window.webContents.on('will-navigate', (event, target) => { if (new URL(target).origin !== url.origin) event.preventDefault() })
    window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) void dialog.showMessageBox(window, { type: 'error', title: '无法连接 Monkey', message: '请先启动 Monkey 服务', detail: `在仓库中导出 Web 客户端并运行 monkey serve，然后重新打开应用。\n\n${description}` })
    })
    void window.loadURL(url.toString()).catch(() => {})
  }
  createWindow()
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
