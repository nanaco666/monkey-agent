export type Data = Record<string, any>
export type Status = 'offline' | 'connecting' | 'connected' | 'reconnecting' | 'auth-error'
export function endpoint(address: string): string {
  const url = new URL(address.trim())
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('请填写不含密钥的 HTTP(S) 服务地址')
  url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:'
  // Plaintext is permitted only for local development/LAN connections.
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname)
  if (url.protocol === 'ws:' && !local) throw new Error('远程连接请使用 HTTPS 地址')
  url.pathname = url.pathname.replace(/\/$/, '').replace(/\/rpc$/, '') + '/rpc'
  return url.toString()
}
export class MonkeyClient {
  private socket?: WebSocket
  private generation = 0
  private nextId = 0
  private pending = new Map<number, { resolve: (data: Data) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private timer?: ReturnType<typeof setTimeout>
  private stopped = true
  private failures = 0
  private url = ''
  private token = ''
  status: Status = 'offline'
  constructor(private onStatus: (status: Status) => void, private onEvent: (event: Data) => void, private onReady: () => void, private Socket: typeof WebSocket = WebSocket) {}
  connect(address: string, token: string) {
    const url = endpoint(address)
    if (token.trim().length < 32) throw new Error('连接密钥至少需要 32 个字符')
    this.disconnect(); this.url = url; this.token = token.trim(); this.stopped = false; this.failures = 0; this.open()
  }
  private state(status: Status) { this.status = status; this.onStatus(status) }
  private open() {
    if (this.stopped) return
    const generation = ++this.generation
    this.state(this.failures ? 'reconnecting' : 'connecting')
    let ws: WebSocket
    try { ws = new this.Socket(this.url) }
    catch { this.schedule(); return }
    this.socket = ws
    const timeout = setTimeout(() => ws.close(), 10_000)
    ws.onopen = async () => {
      clearTimeout(timeout)
      if (generation !== this.generation) return
      try {
        await this.call('authenticate', { token: this.token }, true)
        if (generation !== this.generation) return
        this.failures = 0; this.state('connected'); this.onReady()
      } catch (err) {
        if (generation !== this.generation) return
        if ((err as Error & { code?: number }).code === 4401) { this.stopped = true; this.state('auth-error') }
        ws.close()
      }
    }
    ws.onmessage = event => {
      if (generation !== this.generation) return
      try {
        const data = JSON.parse(String(event.data))
        if (typeof data.id === 'number') {
          const pending = this.pending.get(data.id)
          if (!pending) return
          clearTimeout(pending.timer); this.pending.delete(data.id)
          if (data.error) pending.reject(Object.assign(new Error(data.error.message), { code: data.error.code }))
          else pending.resolve(data.result || {})
        } else if (data.method) this.onEvent(data)
      } catch { /* malformed messages cannot mutate UI state */ }
    }
    ws.onerror = () => ws.close()
    ws.onclose = event => {
      clearTimeout(timeout)
      if (generation !== this.generation) return
      this.rejectPending()
      if (event.code === 4401) { this.stopped = true; this.state('auth-error'); return }
      if (!this.stopped) this.schedule()
    }
  }
  private schedule() {
    this.state('reconnecting')
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.open(), Math.min(1000 * 2 ** this.failures++, 15_000))
  }
  request(method: string, params: Data = {}) { return this.call(method, params, false) }
  private call(method: string, params: Data, authentication: boolean): Promise<Data> {
    if (!this.socket || this.socket.readyState !== 1 || (!authentication && this.status !== 'connected')) return Promise.reject(new Error('尚未连接到 Monkey'))
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id); reject(new Error('请求超时；请刷新会话确认状态，消息不会自动重发'))
      }, 15_000)
      this.pending.set(id, { resolve, reject, timer })
      try { this.socket!.send(JSON.stringify({ jsonrpc: '2.0', id, method, params })) }
      catch { clearTimeout(timer); this.pending.delete(id); reject(new Error('连接已中断')) }
    })
  }
  private rejectPending() {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('连接已中断；重连后将恢复服务端状态')) }
    this.pending.clear()
  }
  resume() {
    if (this.stopped) return
    clearTimeout(this.timer); ++this.generation; this.socket?.close(); this.rejectPending(); this.open()
  }
  disconnect() {
    this.stopped = true; ++this.generation; clearTimeout(this.timer); this.socket?.close(); this.socket = undefined
    this.rejectPending(); this.token = ''; this.state('offline')
  }
}
