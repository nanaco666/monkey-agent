import { createServer, type Server } from 'node:http'
import { createReadStream, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import { MonkeyRuntime, RpcError, type Data } from './runtime.js'
import { loadConfig } from '../config/index.js'
import { initProviders } from '../core/api.js'
import { buildMemoryContext } from '../memory/context.js'

export interface ServerOptions { token: string; host?: string; port?: number; webRoot?: string; origins?: string[] }
export function createMonkeyServer(runtime: MonkeyRuntime, options: ServerOptions): Server {
  if (options.token.length < 32) throw new Error('MONKEY_SERVER_TOKEN must contain at least 32 characters')
  const server = createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return }
    const url = new URL(req.url || '/', 'http://localhost')
    if (url.pathname === '/health') { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true,"protocolVersion":1}'); return }
    if (!options.webRoot) { res.writeHead(404).end('Export apps/universal first, or connect with the mobile app.'); return }
    try {
      const root = realpathSync(options.webRoot)
      let target = resolve(root, '.' + decodeURIComponent(url.pathname))
      if (target !== root && !target.startsWith(root + sep)) { res.writeHead(403).end(); return }
      if (target === root || (existsSync(target) && statSync(target).isDirectory())) target = join(target, 'index.html')
      if (!existsSync(target)) { res.writeHead(404).end(); return }
      target = realpathSync(target)
      if (!target.startsWith(root + sep) || !statSync(target).isFile()) { res.writeHead(403).end(); return }
      const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json' }
      res.setHeader('Content-Type', types[extname(target)] || 'application/octet-stream')
      if (req.method === 'HEAD') { res.end(); return }
      createReadStream(target).on('error', () => res.destroy()).pipe(res)
    } catch { res.writeHead(400).end() }
  })
  const wss = new WebSocketServer({ noServer: true, maxPayload: 17_000_000, perMessageDeflate: false })
  server.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin
    let allowed = !origin // native clients have no browser origin; authentication is still required
    if (origin) {
      try {
        const parsed = new URL(origin)
        allowed = (['http:', 'https:'].includes(parsed.protocol) && parsed.host === req.headers.host) || !!options.origins?.includes(origin)
      } catch { allowed = false }
    }
    if (req.url !== '/rpc' || !allowed || wss.clients.size >= 32) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws))
  })
  wss.on('connection', ws => {
    let authenticated = false
    let active = 0
    let alive = true
    const send = (value: Data) => {
      if (ws.readyState !== WebSocket.OPEN) return
      if (ws.bufferedAmount > 20_000_000) { ws.close(1013, 'Client too slow'); return }
      ws.send(JSON.stringify(value))
    }
    const deadline = setTimeout(() => ws.close(4401, 'Authentication required'), 5000)
    const unsubscribe = runtime.subscribe(event => { if (authenticated) send(event) })
    const heartbeat = setInterval(() => {
      if (!alive) { ws.terminate(); return }
      alive = false; ws.ping()
    }, 25_000)
    ws.on('pong', () => { alive = true })
    ws.on('message', async (buffer, binary) => {
      let id = 0
      try {
        if (binary) throw new RpcError(-32600, 'Text JSON required')
        const data = JSON.parse(buffer.toString())
        if (!data || typeof data !== 'object' || !Number.isSafeInteger(data.id) || typeof data.method !== 'string') throw new RpcError(-32600, 'Invalid request')
        id = data.id
        if (!authenticated) {
          const token = data.params?.token
          if (data.method !== 'authenticate' || typeof token !== 'string' || token.length > 1024) throw new RpcError(4401, '连接密钥不正确')
          const supplied = Buffer.from(token); const expected = Buffer.from(options.token)
          if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new RpcError(4401, '连接密钥不正确')
          authenticated = true; clearTimeout(deadline); send({ jsonrpc: '2.0', id, result: { authenticated: true } }); return
        }
        if (active >= 16) throw new RpcError(-32029, 'Too many requests')
        active++
        try { send({ jsonrpc: '2.0', id, result: await runtime.request(data.method, data.params) }) }
        finally { active-- }
      } catch (err) {
        send({ jsonrpc: '2.0', id, error: { code: err instanceof RpcError ? err.code : -32603, message: err instanceof Error ? err.message : 'Request failed' } })
        if (!authenticated) ws.close(4401, 'Authentication failed')
      }
    })
    ws.on('error', () => {})
    ws.on('close', () => { clearTimeout(deadline); clearInterval(heartbeat); unsubscribe() })
  })
  server.on('close', () => { for (const ws of wss.clients) ws.terminate(); wss.close() })
  return server
}

export async function startNetworkServer() {
  const config = loadConfig()
  if (!config) throw new Error('请先运行 monkey 完成模型配置')
  initProviders(config)
  const directory = process.env.MONKEY_DATA_DIR || join(homedir(), '.monkey-cli')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const tokenFile = join(directory, 'server-token')
  let token = process.env.MONKEY_SERVER_TOKEN
  if (!token) {
    if (!existsSync(tokenFile)) writeFileSync(tokenFile, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' })
    token = readFileSync(tokenFile, 'utf8').trim()
  }
  const port = Number(process.env.MONKEY_PORT || 8787)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid MONKEY_PORT')
  const host = process.env.MONKEY_HOST || '127.0.0.1'
  const defaultWebRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/universal/dist')
  const webRoot = process.env.MONKEY_WEB_ROOT || (existsSync(defaultWebRoot) ? defaultWebRoot : undefined)
  const memory = await buildMemoryContext(config, '').catch(() => '')
  const runtime = new MonkeyRuntime(config, memory)
  const server = createMonkeyServer(runtime, { token, webRoot, origins: process.env.MONKEY_ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) })
  server.listen(port, host, () => {
    console.log(`Monkey listening on http://${host}:${port}`)
    console.log(process.env.MONKEY_SERVER_TOKEN ? 'Connection key: configured via MONKEY_SERVER_TOKEN' : `Connection key file: ${tokenFile}`)
    console.log('Mobile: use a reachable HTTPS address. Agent tools execute on this host.')
  })
  const stop = async () => {
    server.close(); server.closeAllConnections()
    await runtime.close(); process.exit(0)
  }
  process.once('SIGINT', stop); process.once('SIGTERM', stop)
  return server
}
