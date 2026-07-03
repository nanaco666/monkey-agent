/**
 * Preload script — exposes safe IPC bridge to renderer.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('monkeyIPC', {
  // Send a chat message (returns promise)
  chat: (prompt) => ipcRenderer.invoke('chat', prompt),

  // Slash command
  slash: (cmd) => ipcRenderer.invoke('slash', cmd),

  // Notifications (fire-and-forget)
  abort: () => ipcRenderer.send('abort'),
  setModel: (model) => ipcRenderer.send('set_model', model),
  setWild: (wild) => ipcRenderer.send('set_wild', wild),
  clear: () => ipcRenderer.send('clear'),
  shutdown: () => ipcRenderer.send('shutdown'),

  // Listen for events from main process
  onInitialized: (callback) => {
    ipcRenderer.on('monkey:initialized', (_event, data) => callback(data))
  },
  onDisconnected: (callback) => {
    ipcRenderer.on('monkey:disconnected', (_event, data) => callback(data))
  },
  onError: (callback) => {
    ipcRenderer.on('monkey:error', (_event, data) => callback(data))
  },
  onStreamText: (callback) => {
    ipcRenderer.on('monkey:stream/text', (_event, data) => callback(data))
  },
  onStreamToolStart: (callback) => {
    ipcRenderer.on('monkey:stream/tool_start', (_event, data) => callback(data))
  },
  onStreamToolResult: (callback) => {
    ipcRenderer.on('monkey:stream/tool_result', (_event, data) => callback(data))
  },
  onStreamUsage: (callback) => {
    ipcRenderer.on('monkey:stream/usage', (_event, data) => callback(data))
  },
  onStreamCompacted: (callback) => {
    ipcRenderer.on('monkey:stream/compacted', (_event, data) => callback(data))
  },
})
