import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import WebSocket from 'ws'
const temporary = mkdtempSync(join(tmpdir(), 'monkey-transport-'))
process.env.MONKEY_DATA_DIR = temporary
const { MonkeyRuntime } = await import('../dist/server/runtime.js')
const { createMonkeyServer } = await import('../dist/server/http.js')
const { MonkeyClient, endpoint } = await import('../apps/universal/src/client.ts')
after(() => rmSync(temporary, { recursive: true, force: true }))
const token = 'test-only-connection-key-000000000000000000'
const config = { api_key: 'test-only', model: 'test-model', fast_model: 'test-fast' }
test('endpoint validation rejects leaked tokens, credentials and insecure public hosts', () => {
  assert.equal(endpoint('https://example.com'), 'wss://example.com/rpc')
  assert.equal(endpoint('http://192.168.1.2:8787'), 'ws://192.168.1.2:8787/rpc')
  for (const url of ['http://example.com', 'https://u:p@example.com', 'https://example.com?token=secret', 'file:///tmp']) assert.throws(() => endpoint(url))
})
test('network auth, two clients, disconnected run recovery without replay, origin and static isolation', async () => {
  let calls = 0, finish
  const runtime = new MonkeyRuntime(config, '', { tool: async () => 'unused', stream: async (_c, _m, text) => {
    calls++; text('streamed '); await new Promise(resolve => { finish = resolve }); text('answer')
    return { toolUses: [], inputTokens: 5, outputTokens: 2, cacheReadTokens: 0, cacheCreationTokens: 0 }
  } })
  writeFileSync(join(temporary, 'index.html'), '<h1>test</h1>')
  const server = createMonkeyServer(runtime, { token, webRoot: temporary })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`
  const clients = []
  const connect = (key = token) => new Promise((resolve, reject) => {
    const c = new MonkeyClient(status => { if (status === 'auth-error') reject(new Error('auth rejected')) }, () => {}, () => resolve(c), WebSocket)
    clients.push(c); c.connect(url, key)
  })
  try {
    assert.equal((await fetch(`${url}/health`)).status, 200)
    assert.equal(await (await fetch(url)).text(), '<h1>test</h1>')
    assert.equal((await fetch(`${url}/%2e%2e%2foutside`)).status, 403)
    await assert.rejects(connect('incorrect-token-0000000000000000000000'), /auth rejected/)
    const a = await connect(); const b = await connect()
    const { sessionId } = await a.request('session_new')
    assert.ok((await b.request('session_list')).sessions.some(s => s.id === sessionId))
    await a.request('chat', { sessionId, prompt: 'hello' }); a.disconnect()
    const snapshot = await b.request('session_get', { sessionId })
    assert.equal(snapshot.busy, true); assert.equal(snapshot.run.text, 'streamed ')
    await assert.rejects(b.request('chat', { sessionId, prompt: 'duplicate' }), /仍在运行/)
    const done = new Promise(resolve => { const off = runtime.subscribe(e => { if (e.method === 'run/done') { off(); resolve() } }) })
    finish(); await done
    const c = await connect(); const restored = await c.request('session_get', { sessionId })
    assert.equal(restored.busy, false); assert.equal(restored.messages.at(-1).content, 'streamed answer'); assert.equal(calls, 1)
    const malicious = new WebSocket(url.replace('http:', 'ws:') + '/rpc', { origin: 'https://evil.example' })
    await new Promise(resolve => malicious.once('unexpected-response', (_req, res) => { assert.equal(res.statusCode, 403); res.resume(); malicious.terminate(); resolve() }).once('error', () => {}))
  } finally {
    for (const c of clients) c.disconnect()
    await runtime.close()
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  }
})
