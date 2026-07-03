/**
 * Monkey Electron — Renderer (browser) process.
 * Communicates with main process via window.monkeyIPC.
 */

// ── State ──
const state = {
  messages: [],
  isStreaming: false,
  wildMode: false,
  isConnected: false,
  displayModel: '…',
  assistantName: 'Monkey',
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, requests: 0 },
}

const MODELS = [
  ['Sonnet 4', 'claude-sonnet-4-6'],
  ['Opus 4',   'claude-opus-4-6'],
  ['Haiku 4',  'claude-haiku-4-5-latest'],
  ['GPT-4o',   'gpt-4o'],
  ['o3',       'o3'],
  ['o4-mini',  'o4-mini'],
  ['GLM-5',    'glm-5'],
  ['GLM-4.5',  'glm-4.5'],
]

const SLASH_COMMANDS = [
  ['/commit', 'Generate git commit'],
  ['/plan',   'Read-only planning mode'],
  ['/memory', 'View & manage memory'],
  ['/model',  'Show or switch model'],
  ['/usage',  'Show token usage & cost'],
  ['/clean',  'Prune stale sessions & memory'],
  ['/clear',  'Clear conversation history'],
  ['/wild',   'Unlock dangerous commands'],
  ['/tame',   'Re-enable safety mode'],
]

// ── DOM refs ──
const $messages = document.getElementById('messages')
const $input = document.getElementById('inputField')
const $sendBtn = document.getElementById('sendBtn')
const $statusDot = document.getElementById('statusDot')
const $modelBtn = document.getElementById('modelBtn')
const $modelLabel = document.getElementById('modelLabel')
const $modelDropdown = document.getElementById('modelDropdown')
const $modeBtn = document.getElementById('modeBtn')
const $modeIcon = document.getElementById('modeIcon')
const $modeLabel = document.getElementById('modeLabel')
const $usageLabel = document.getElementById('usageLabel')
const $slashBtn = document.getElementById('slashBtn')
const $slashDropdown = document.getElementById('slashDropdown')
const $clearBtn = document.getElementById('clearBtn')

// ── IPC ──
const ipc = window.monkeyIPC

ipc.onInitialized((data) => {
  state.isConnected = true
  state.displayModel = data.model || 'unknown'
  state.assistantName = data.name || 'Monkey'
  updateUI()
})

ipc.onDisconnected(() => {
  state.isConnected = false
  updateUI()
})

ipc.onError((data) => {
  addMessage('system', `Error: ${data.message}`)
})

ipc.onStreamText((data) => {
  appendOrExtendAssistant(data.text || '')
})

ipc.onStreamToolStart((data) => {
  const name = data.name || 'tool'
  const summary = data.summary || ''
  const content = summary ? `${name}  ${summary}` : name
  addMessage('tool', content, { toolName: name })
})

ipc.onStreamToolResult((data) => {
  const name = data.name
  let result = data.result || ''
  if (result.length > 300) result = result.slice(0, 300) + '…'
  addMessage('tool', result, { toolName: name, isError: data.error })
})

ipc.onStreamUsage((data) => {
  state.usage = {
    inputTokens: data.inputTokens ?? state.usage.inputTokens,
    outputTokens: data.outputTokens ?? state.usage.outputTokens,
    cacheReadTokens: data.cacheReadTokens ?? state.usage.cacheReadTokens,
    requests: data.requests ?? state.usage.requests,
  }
  updateUsageLabel()
})

ipc.onStreamCompacted((data) => {
  const removed = data.removed || 0
  const learned = data.knowledgeSaved || 0
  let msg = `Context compacted (−${removed} messages)`
  if (learned > 0) msg += `, learned ${learned} new things`
  addMessage('system', msg)
})

// ── Message model ──
let msgIdCounter = 0

function addMessage(role, content, opts = {}) {
  const msg = {
    id: ++msgIdCounter,
    role,
    content,
    toolName: opts.toolName || null,
    isError: opts.isError || false,
    isStreaming: opts.isStreaming || false,
    time: new Date(),
  }
  state.messages.push(msg)
  renderMessage(msg)
  scrollToBottom()
  return msg
}

function appendOrExtendAssistant(text) {
  const last = state.messages.findLastIndex(m => m.role === 'assistant' && m.isStreaming)
  if (last !== -1) {
    state.messages[last].content += text
    updateMessageContent(state.messages[last])
  } else {
    addMessage('assistant', text, { isStreaming: true })
  }
}

// ── Rendering ──

function renderMessage(msg) {
  const el = document.createElement('div')
  el.className = `message ${msg.role}`
  el.id = `msg-${msg.id}`
  el.innerHTML = buildMessageHTML(msg)
  $messages.appendChild(el)
}

function updateMessageContent(msg) {
  const el = document.getElementById(`msg-${msg.id}`)
  if (!el) return
  const contentEl = el.querySelector('.message-content')
  if (contentEl) contentEl.innerHTML = renderMarkdown(msg.content)
  scrollToBottom()
}

function buildMessageHTML(msg) {
  const avatar = getAvatar(msg.role)
  const roleClass = msg.role
  const roleLabel = getRoleLabel(msg.role, msg.toolName)
  const timeStr = msg.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  let contentHTML = ''
  if (msg.role === 'tool') {
    const errorClass = msg.isError ? ' error' : ''
    contentHTML = `<div class="message-content${errorClass}">${escapeHTML(msg.content)}</div>`
  } else if (msg.role === 'system') {
    contentHTML = `<div class="message-content">${escapeHTML(msg.content)}</div>`
  } else {
    contentHTML = `<div class="message-content">${renderMarkdown(msg.content)}</div>`
  }

  let toolNameHTML = ''
  if (msg.toolName) {
    toolNameHTML = `<span class="message-tool-name">${escapeHTML(msg.toolName)}</span>`
  }

  return `
    <div class="message-avatar">${avatar}</div>
    <div class="message-body">
      <div class="message-header">
        <span class="message-role ${roleClass}">${escapeHTML(roleLabel)}</span>
        ${toolNameHTML}
        <span class="message-time">${timeStr}</span>
      </div>
      ${contentHTML}
    </div>
  `
}

function getAvatar(role) {
  switch (role) {
    case 'user': return '👤'
    case 'assistant': return '🐵'
    case 'tool': return '🔧'
    case 'system': return 'ℹ️'
    default: return '💬'
  }
}

function getRoleLabel(role, toolName) {
  switch (role) {
    case 'user': return 'You'
    case 'assistant': return state.assistantName
    case 'tool': return 'Tool'
    case 'system': return 'System'
    default: return role
  }
}

// ── Markdown (lightweight) ──

function renderMarkdown(text) {
  if (!text) return ''

  // Split out code blocks first
  const parts = []
  const codeRegex = /```(\w*)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = codeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'code', lang: match[1] || '', code: match[2] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) })
  }

  if (parts.length === 0) parts.push({ type: 'text', content: text })

  return parts.map(part => {
    if (part.type === 'code') {
      const id = 'code-' + (++msgIdCounter)
      return `<div class="code-block">
        ${part.lang ? `<div class="code-block-header"><span class="code-lang">${escapeHTML(part.lang)}</span><button class="copy-btn" onclick="copyCode('${id}')">Copy</button></div>` : ''}
        <pre id="${id}">${escapeHTML(part.code)}</pre>
      </div>`
    }
    return renderInlineMarkdown(part.content)
  }).join('')
}

function renderInlineMarkdown(text) {
  // Process line by line for headings, lists, blockquotes
  return text.split('\n').map(line => {
    if (line.startsWith('### ')) return `<h3>${escapeHTML(line.slice(4))}</h3>`
    if (line.startsWith('## ')) return `<h2>${escapeHTML(line.slice(3))}</h2>`
    if (line.startsWith('# ')) return `<h1>${escapeHTML(line.slice(2))}</h1>`
    if (line.startsWith('- ') || line.startsWith('• ')) return `<li>${renderInline(line.slice(2))}</li>`
    if (line.startsWith('> ')) return `<blockquote>${renderInline(line.slice(2))}</blockquote>`
    if (line.trim() === '') return '<br>'
    return `<p>${renderInline(line)}</p>`
  }).join('')
}

function renderInline(text) {
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Inline code (but not inside code blocks)
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
  return text
}

function escapeHTML(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── Copy code ──
window.copyCode = function(id) {
  const el = document.getElementById(id)
  if (el) navigator.clipboard.writeText(el.textContent)
}

// ── Send message ──

async function sendMessage() {
  const text = $input.value.trim()
  if (!text || !state.isConnected) return

  $input.value = ''
  autoResizeInput()

  if (text.startsWith('/')) {
    handleSlashCommand(text)
    return
  }

  addMessage('user', text)
  state.isStreaming = true
  updateSendButton()

  try {
    const result = await ipc.chat(text)
    if (result.error) {
      addMessage('system', `Error: ${result.error}`)
    }
  } catch (err) {
    addMessage('system', `Error: ${String(err)}`)
  }

  // Stream events handle the rest; finalize streaming messages
  state.isStreaming = false
  finalizeStreamingMessages()
  updateSendButton()
}

function handleSlashCommand(input) {
  const cmd = input.trim().toLowerCase()

  switch (cmd) {
    case '/clear':
      state.messages = []
      $messages.innerHTML = ''
      ipc.clear()
      break
    case '/wild':
      state.wildMode = true
      ipc.setWild(true)
      addMessage('system', 'Wild mode — all commands allowed 🐒')
      break
    case '/tame':
      state.wildMode = false
      ipc.setWild(false)
      addMessage('system', 'Tame mode — dangerous commands blocked')
      break
    default:
      ipc.slash(input)
      break
  }
  updateUI()
}

function finalizeStreamingMessages() {
  for (const msg of state.messages) {
    if (msg.isStreaming) {
      msg.isStreaming = false
      // Re-render to remove streaming state if needed
    }
  }
}

// ── UI Updates ──

function updateUI() {
  $statusDot.className = 'status-dot' + (state.isConnected ? ' connected' : '')
  $modelLabel.textContent = state.displayModel
  updateModeButton()
  updateSendButton()
}

function updateModeButton() {
  if (state.wildMode) {
    $modeBtn.className = 'toolbar-btn mode-btn wild'
    $modeIcon.textContent = '🔥'
    $modeLabel.textContent = 'Wild'
  } else {
    $modeBtn.className = 'toolbar-btn mode-btn tame'
    $modeIcon.textContent = '🛡️'
    $modeLabel.textContent = 'Tame'
  }
}

function updateSendButton() {
  if (state.isStreaming) {
    $sendBtn.className = 'send-btn stop'
    $sendBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><rect x="5" y="5" width="10" height="10" rx="2"/></svg>'
    $sendBtn.disabled = false
    $sendBtn.onclick = () => { ipc.abort(); state.isStreaming = false; updateSendButton() }
  } else {
    $sendBtn.className = 'send-btn'
    $sendBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"/></svg>'
    $sendBtn.disabled = !state.isConnected
    $sendBtn.onclick = sendMessage
  }
}

function updateUsageLabel() {
  const u = state.usage
  if (u.requests === 0) { $usageLabel.textContent = ''; return }
  const fmtK = n => n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n)
  $usageLabel.textContent = `${u.requests} req · ${fmtK(u.inputTokens + u.outputTokens)} tok`
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    $messages.scrollTop = $messages.scrollHeight
  })
}

// ── Input handling ──

$input.addEventListener('input', () => autoResizeInput())

$input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
})

function autoResizeInput() {
  $input.style.height = 'auto'
  $input.style.height = Math.min($input.scrollHeight, 160) + 'px'
}

// ── Model dropdown ──

function buildModelDropdown() {
  $modelDropdown.innerHTML = MODELS.map(([alias, model]) => {
    const active = model === state.displayModel
    return `<button class="dropdown-item${active ? ' active' : ''}" data-model="${model}">
      ${active ? '<span class="check">✓</span>' : ''}${escapeHTML(alias)}
    </button>`
  }).join('')

  $modelDropdown.querySelectorAll('.dropdown-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const model = btn.dataset.model
      state.displayModel = model
      ipc.setModel(model)
      closeAllDropdowns()
      updateUI()
    })
  })
}

// ── Slash dropdown ──

function buildSlashDropdown() {
  $slashDropdown.innerHTML = SLASH_COMMANDS.map(([cmd, desc]) => {
    return `<button class="dropdown-item" data-cmd="${cmd}">
      <span class="cmd">${cmd}</span><span class="desc">${desc}</span>
    </button>`
  }).join('')

  $slashDropdown.querySelectorAll('.dropdown-item').forEach(btn => {
    btn.addEventListener('click', () => {
      handleSlashCommand(btn.dataset.cmd)
      closeAllDropdowns()
    })
  })
}

// ── Dropdown toggle ──

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'))
}

$modelBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  const isOpen = $modelDropdown.classList.contains('open')
  closeAllDropdowns()
  if (!isOpen) {
    buildModelDropdown()
    $modelDropdown.classList.add('open')
  }
})

$slashBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  const isOpen = $slashDropdown.classList.contains('open')
  closeAllDropdowns()
  if (!isOpen) {
    buildSlashDropdown()
    $slashDropdown.classList.add('open')
  }
})

document.addEventListener('click', () => closeAllDropdowns())

// ── Clear ──
$clearBtn.addEventListener('click', () => {
  state.messages = []
  $messages.innerHTML = ''
  ipc.clear()
})

// ── Mode toggle ──
$modeBtn.addEventListener('click', () => {
  state.wildMode = !state.wildMode
  ipc.setWild(state.wildMode)
  addMessage('system', state.wildMode
    ? 'Wild mode — all commands allowed 🐒'
    : 'Tame mode — dangerous commands blocked')
  updateUI()
})

// ── Init ──
buildModelDropdown()
buildSlashDropdown()
updateUI()
$input.focus()
