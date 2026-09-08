import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const temporary = mkdtempSync(join(tmpdir(), 'monkey-runtime-'))
process.env.MONKEY_DATA_DIR = temporary
const { MonkeyRuntime } = await import('../dist/server/runtime.js')
const { loadSession } = await import('../dist/session/store.js')
after(() => rmSync(temporary, { recursive: true, force: true }))
const config = { api_key: 'test-only', model: 'test-model', fast_model: 'test-fast' }
const response = tools => ({ toolUses: tools || [], inputTokens: 10, outputTokens: 3, cacheReadTokens: 0, cacheCreationTokens: 0 })
function event(runtime, method, predicate = () => true) {
  return new Promise(resolve => { const off = runtime.subscribe(e => { if (e.method === method && predicate(e.params)) { off(); resolve(e.params) } }) })
}
test('persistent rename, model, clear and traversal rejection', async () => {
  const runtime = new MonkeyRuntime(config)
  const { sessionId } = await runtime.request('session_new')
  await runtime.request('session_rename', { sessionId, title: '手机测试' })
  await runtime.request('set_model', { sessionId, model: 'other-model' })
  const restored = new MonkeyRuntime(config)
  assert.equal((await restored.request('session_get', { sessionId })).sessionTitle, '手机测试')
  assert.equal(loadSession(sessionId).model, 'other-model')
  await assert.rejects(runtime.request('session_delete', { sessionId: '../../config' }), /Invalid sessionId/)
  await assert.rejects(runtime.request('chat', { sessionId, attachments: [{ name: 'bad.png', isImage: true, mediaType: 'image/png', data: '%%%=' }] }), /Invalid base64/)
  await runtime.request('clear', { sessionId })
  await runtime.request('session_delete', { sessionId })
  assert.equal(loadSession(sessionId), null)
})
test('independent sessions; reconnect snapshot; concurrent writes to one session rejected; abort persists partial text', async () => {
  const runtime = new MonkeyRuntime(config, '', { tool: async () => 'unused', stream: async (_c, _m, onText, _t, _ctx, _allow, signal) => {
    onText('partial response')
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    throw new Error('aborted')
  } })
  const a = await runtime.request('session_new'); const b = await runtime.request('session_new')
  const done = event(runtime, 'run/done', p => p.sessionId === a.sessionId)
  await runtime.request('chat', { sessionId: a.sessionId, prompt: 'a' })
  const snapshot = await runtime.request('session_get', { sessionId: a.sessionId })
  assert.equal(snapshot.busy, true); assert.equal(snapshot.run.text, 'partial response')
  assert.equal(snapshot.messages.filter(m => m.role === 'assistant').length, 0)
  assert.equal((await runtime.request('session_get', { sessionId: b.sessionId })).busy, false)
  for (const method of ['chat', 'clear', 'session_delete', 'set_model']) await assert.rejects(runtime.request(method, { sessionId: a.sessionId, prompt: 'duplicate', model: 'other' }), /仍在运行/)
  await runtime.request('abort', { sessionId: a.sessionId }); await done
  assert.equal(loadSession(a.sessionId).messages.at(-1).content, 'partial response')
  assert.equal((await runtime.request('session_get', { sessionId: a.sessionId })).busy, false)
  await runtime.close()
})
test('denied tool never executes and tool results remain paired; next turn works', async () => {
  let calls = 0, executed = 0
  const runtime = new MonkeyRuntime(config, '', { tool: async () => { executed++; return 'ok' }, stream: async (_c, _m, text) => {
    if (calls++ === 0) return response([{ id: 'write-1', name: 'write', input: { path: '/never', content: 'no' } }])
    text('done'); return response()
  } })
  const { sessionId } = await runtime.request('session_new')
  const approval = event(runtime, 'approval/request'); const done = event(runtime, 'run/done')
  await runtime.request('chat', { sessionId, prompt: 'test' })
  const pending = await approval
  assert.equal((await runtime.request('session_get', { sessionId })).approval.id, pending.id)
  await runtime.request('approval_respond', { sessionId, approvalId: pending.id, allow: false }); await done
  assert.equal(executed, 0)
  assert.equal(loadSession(sessionId).messages[2].content[0].tool_use_id, 'write-1')
  const second = event(runtime, 'run/done'); await runtime.request('chat', { sessionId, prompt: 'next' }); await second
  assert.equal((await runtime.request('session_get', { sessionId })).busy, false)
})
test('allow once executes; abort fills all remaining tool results; stale approval rejected', async () => {
  let calls = 0, executed = 0
  const runtime = new MonkeyRuntime(config, '', { tool: async () => { executed++; return 'ok' }, stream: async () => calls++ === 0 ? response([
    { id: 't1', name: 'write', input: { path: '/fake' } }, { id: 't2', name: 'bash', input: { command: 'echo no' } },
  ]) : response() })
  const { sessionId } = await runtime.request('session_new')
  const first = event(runtime, 'approval/request'); const done = event(runtime, 'run/done')
  await runtime.request('chat', { sessionId, prompt: 'test' }); const p = await first
  const second = event(runtime, 'approval/request', p => p.name === 'bash')
  await runtime.request('approval_respond', { sessionId, approvalId: p.id, allow: true }); await second
  await runtime.request('abort', { sessionId }); await done
  assert.equal(executed, 1)
  assert.deepEqual(loadSession(sessionId).messages[2].content.map(t => t.tool_use_id), ['t1', 't2'])
  await assert.rejects(runtime.request('approval_respond', { sessionId, approvalId: p.id, allow: true }), /失效/)
})
test('/plan enforces tool whitelist even if provider returns a write tool', async () => {
  let calls = 0, executed = 0
  const runtime = new MonkeyRuntime(config, '', { tool: async () => { executed++; return 'bad' }, stream: async (_c, _m, _text, _tools, _memory, allowed) => {
    assert.ok(!allowed.includes('write'))
    return calls++ === 0 ? response([{ id: 'forbidden', name: 'write', input: {} }]) : response()
  } })
  const { sessionId } = await runtime.request('session_new'); const done = event(runtime, 'run/done')
  await runtime.request('chat', { sessionId, prompt: '/plan inspect' }); await done
  assert.equal(executed, 0)
  assert.match(loadSession(sessionId).messages[2].content[0].content, /not allowed/)
})
