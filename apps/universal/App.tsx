import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, BackHandler, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Feather from '@expo/vector-icons/Feather'
import Markdown from 'react-native-markdown-display'
import * as Clipboard from 'expo-clipboard'
import { MonkeyClient, endpoint, type Data, type Status } from './src/client'
import { readConnection, saveConnection, clearConnection } from './src/storage'
import { pickImage, pickTextFile, type Attachment } from './src/attachments'

type IconName = React.ComponentProps<typeof Feather>['name']
const C = { ink: '#27251F', muted: '#89877F', orange: '#E46A32', pale: '#FFF0E6', line: '#E9E7E1', paper: '#FFFFFF', bg: '#F8F7F3', green: '#3C876C' }
const statusText: Record<Status, string> = { offline: '未连接', connecting: '正在连接', connected: '已连接', reconnecting: '正在重连', 'auth-error': '密钥不正确' }
function Icon({ name, color = C.ink, size = 19 }: { name: IconName; color?: string; size?: number }) { return <Feather name={name} size={size} color={color} /> }
function Button({ label, icon, onPress, disabled, primary }: { label: string; icon?: IconName; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, primary && s.primary, disabled && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}>{icon && <Icon name={icon} color={primary ? '#FFF' : C.ink} size={17} />}<Text style={[s.buttonText, primary && { color: '#FFF' }]}>{label}</Text></Pressable>
}
function AppContent() {
  const wide = useWindowDimensions().width >= 900
  const [status, setStatus] = useState<Status>('offline')
  const [sessions, setSessions] = useState<Data[]>([])
  const [snapshot, setSnapshot] = useState<Data | null>(null)
  const [models, setModels] = useState<Data[]>([])
  const [screen, setScreen] = useState<'chat' | 'sessions' | 'settings'>('chat')
  const [address, setAddress] = useState(Platform.OS === 'web' && typeof location !== 'undefined' ? location.origin : '')
  const [token, setToken] = useState('')
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modelDraft, setModelDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [confirm, setConfirm] = useState<{ title: string; body: string; action: () => void } | null>(null)
  const [rename, setRename] = useState<string | null>(null)
  const activeId = useRef<string | null>(null)
  const loadVersion = useRef(0)
  const messagesRef = useRef<FlatList>(null)
  const followScroll = useRef(true)
  const callbacks = useRef({ ready: () => {}, event: (_: Data) => {} })
  const client = useRef<MonkeyClient | null>(null)
  if (!client.current) client.current = new MonkeyClient(setStatus, event => callbacks.current.event(event), () => callbacks.current.ready())
  const rpc = client.current
  const online = status === 'connected'
  const busy = !!snapshot?.busy
  const fail = (err: unknown) => setError(err instanceof Error ? err.message : String(err))
  async function attempt(action: () => Promise<unknown>) { setError(''); try { await action() } catch (err) { fail(err) } }
  async function refresh() {
    const result = await rpc.request('session_list'); setSessions(result.sessions)
    if (activeId.current && !result.sessions.some((item: Data) => item.id === activeId.current)) {
      activeId.current = null; setSnapshot(null)
      if (result.sessions[0]) await openSession(result.sessions[0].id)
    }
  }
  async function openSession(id: string) {
    const version = ++loadVersion.current
    activeId.current = id; setLoading(true); setSnapshot(null); setDraft(''); setFiles([]); setScreen('chat'); followScroll.current = true
    try {
      const result = await rpc.request('session_get', { sessionId: id })
      if (version === loadVersion.current) setSnapshot(result)
    } finally { if (version === loadVersion.current) setLoading(false) }
  }
  async function newSession() {
    const result = await rpc.request('session_new'); await openSession(result.sessionId)
  }
  async function change(method: string, params: Data = {}) {
    const id = activeId.current
    if (!id) return
    const result = await rpc.request(method, { ...params, sessionId: id })
    if (activeId.current === id && result.sessionId) setSnapshot(result)
    await refresh()
  }
  callbacks.current.ready = () => {
    void attempt(async () => {
      const result = await rpc.request('initialize'); setModels(result.models); setSessions(result.sessions)
      const id = activeId.current
      if (id && result.sessions.some((item: Data) => item.id === id)) {
        // Restore in-flight state without discarding an unsent draft on reconnect.
        const restored = await rpc.request('session_get', { sessionId: id })
        if (activeId.current === id) setSnapshot(restored)
      } else if (result.sessions[0]) await openSession(result.sessions[0].id)
      else await newSession()
    })
  }
  callbacks.current.event = event => {
    const p = event.params || {}
    if (event.method === 'sessions/changed') { void attempt(refresh); return }
    if (p.sessionId !== activeId.current) return
    if (event.method === 'run/done') { if (p.error) setError(p.error); else if (p.aborted) setNotice('任务已停止'); return }
    setSnapshot(previous => {
      if (event.method === 'session/state') return p
      if (!previous) return previous
      if (event.method === 'approval/request') return { ...previous, approval: p }
      if (event.method === 'approval/cleared') return { ...previous, approval: null }
      const run = previous.run || { text: '', tools: [], usage: {} }
      if (event.method === 'stream/text') return { ...previous, busy: true, run: { ...run, text: run.text + p.text } }
      if (event.method === 'stream/usage') return { ...previous, run: { ...run, usage: p } }
      if (event.method === 'stream/tool_start') return { ...previous, run: { ...run, tools: [...run.tools, p] } }
      if (event.method === 'stream/tool_result') return { ...previous, run: { ...run, tools: run.tools.map((t: Data) => t.id === p.id ? { ...t, ...p } : t) } }
      return previous
    })
  }
  useEffect(() => {
    let alive = true
    readConnection().then(connection => {
      if (!alive || !connection) return
      setAddress(connection.address); setToken(connection.token)
      if (connection.token) rpc.connect(connection.address, connection.token)
    }).catch(fail)
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') rpc.resume() })
    return () => { alive = false; subscription.remove(); rpc.disconnect() }
  }, [])
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen !== 'chat') { setScreen('chat'); return true }
      return false
    })
    return () => back.remove()
  }, [screen])
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3000); return () => clearTimeout(timer) }, [notice])
  async function connect() {
    endpoint(address)
    if (token.trim().length < 32) throw new Error('请粘贴服务端的连接密钥')
    await saveConnection({ address: address.trim(), token: token.trim() })
    activeId.current = null; setSnapshot(null); setSessions([]); ++loadVersion.current
    rpc.connect(address, token); setScreen('chat')
  }
  async function send() {
    if (!activeId.current || sending || busy || !online || (!draft.trim() && !files.length)) return
    const prompt = draft; const attachments = files
    setSending(true); setError(''); followScroll.current = true
    try {
      await rpc.request('chat', { sessionId: activeId.current, prompt, attachments })
      setDraft(''); setFiles([])
    } catch (err) { fail(err) } finally { setSending(false) }
  }
  async function addFile(image: boolean) {
    if (files.length >= 4) throw new Error('最多添加 4 个附件')
    const file = await (image ? pickImage() : pickTextFile())
    if (file) setFiles(old => [...old, file].slice(0, 4))
  }
  function askDelete() {
    setConfirm({ title: '删除这个会话？', body: '此操作会删除服务端的会话记录，所有设备都会同步。', action: () => void attempt(async () => {
      await rpc.request('session_delete', { sessionId: activeId.current }); activeId.current = null; setSnapshot(null)
      const result = await rpc.request('session_list'); setSessions(result.sessions)
      if (result.sessions[0]) await openSession(result.sessions[0].id); else await newSession()
    }) })
  }
  const sessionList = <View style={{ flex: 1 }}>
    <View style={s.sectionHeading}><Text style={s.eyebrow}>你的会话</Text><Text style={s.muted}>{sessions.length}</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 5 }}>
      {!sessions.length && <Text style={[s.muted, { padding: 12 }]}>连接后，会话会在这里同步。</Text>}
      {sessions.map(item => <Pressable accessibilityRole="button" accessibilityLabel={`打开会话 ${item.title}`} key={item.id} disabled={!online || sending} onPress={() => void attempt(() => openSession(item.id))} style={[s.session, item.id === snapshot?.sessionId && s.selected]}>
        <Icon name="message-circle" size={17} color={item.id === snapshot?.sessionId ? C.orange : C.muted} /><View style={{ flex: 1 }}><Text numberOfLines={1} style={s.sessionTitle}>{item.title}</Text><Text style={s.small}>{item.messageCount} 条消息 · {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}</Text></View>
      </Pressable>)}
    </ScrollView>
  </View>
  const rows: Data[] = snapshot?.messages || []
  const allRows = [...rows, ...(snapshot?.run?.text ? [{ role: 'assistant', content: snapshot.run.text }] : []), ...(snapshot?.run?.tools || []).map((tool: Data) => ({ role: 'tool', toolName: tool.name, content: tool.result || tool.summary, status: tool.status }))]
  const chat = <View style={s.chat}>
    <View style={s.chatHeader}><View style={{ flex: 1 }}><Text numberOfLines={1} style={s.chatTitle}>{snapshot?.sessionTitle === 'New Chat' ? '新的可能，从这里开始' : snapshot?.sessionTitle || '和 Monkey 一起'}</Text><Text numberOfLines={1} style={s.small}>{snapshot?.model || '你的 AI 助手，随时在身边'}</Text></View>{!snapshot && online && <Button label="新会话" icon="plus" onPress={() => void attempt(newSession)} />}{snapshot && <Pressable accessibilityRole="button" accessibilityLabel="会话设置" onPress={() => { setModelDraft(snapshot.model); setScreen('settings') }} style={s.iconButton}><Icon name="sliders" /></Pressable>}</View>
    {loading ? <ActivityIndicator style={{ flex: 1 }} color={C.orange} /> : allRows.length ? <FlatList
      ref={messagesRef} data={allRows} keyExtractor={(_, index) => String(index)}
      contentContainerStyle={s.messageList} keyboardShouldPersistTaps="handled"
      onScroll={event => { const n = event.nativeEvent; followScroll.current = n.contentSize.height - n.layoutMeasurement.height - n.contentOffset.y < 120 }} scrollEventThrottle={100}
      onContentSizeChange={() => { if (followScroll.current) messagesRef.current?.scrollToEnd({ animated: false }) }}
      renderItem={({ item }) => <Message item={item} onCopy={() => void attempt(async () => { await Clipboard.setStringAsync(item.content); setNotice('已复制') })} />}
    /> : <ScrollView contentContainerStyle={s.welcome}>
      <Image source={require('./assets/icon.png')} style={s.avatar} />
      <Text style={s.welcomeTitle}>嘿，我是 Monkey。</Text><Text style={s.welcomeCopy}>想法、问题，或者还没做完的事。{ '\n' }一起往前走一步。</Text>
      <View style={s.suggestions}>{[['compass', '一起理清思路', '/plan 帮我梳理这个项目，建议接下来最值得做的三件事'], ['book-open', '接着上次聊', '根据你记住的背景，我们上次进行到哪里了？'], ['zap', '把想法变成行动', '先看看当前项目，告诉我你可以帮我完成哪些事情。']].map(([icon, title, prompt]) => <Pressable key={title} accessibilityRole="button" onPress={() => online ? setDraft(prompt) : setScreen('settings')} style={s.suggestion}><Icon name={icon as IconName} color={C.orange} /><Text style={s.suggestionTitle}>{title}</Text><Icon name="arrow-up-right" color={C.muted} size={16} /></Pressable>)}</View>
      {!online && <Button label="连接你的 Monkey" icon="link" primary onPress={() => setScreen('settings')} />}
    </ScrollView>}
    {snapshot?.approval && <View style={s.approval}><Text style={s.bold}>Monkey 请求执行 {snapshot.approval.name}</Text><Text style={s.small}>操作将在连接的主机上执行；2 分钟未确认会自动拒绝。</Text><ScrollView style={{ maxHeight: 100 }}><Text selectable style={s.code}>{JSON.stringify(snapshot.approval.input, null, 2)}</Text></ScrollView><View style={s.row}><Button disabled={!online} label="拒绝" onPress={() => void attempt(() => rpc.request('approval_respond', { sessionId: activeId.current, approvalId: snapshot.approval.id, allow: false }))} /><Button disabled={!online} label="允许这一次" primary onPress={() => void attempt(() => rpc.request('approval_respond', { sessionId: activeId.current, approvalId: snapshot.approval.id, allow: true }))} /></View></View>}
    <View style={s.composerArea}>
      {busy && <View style={s.runStatus}><ActivityIndicator size="small" color={C.orange} /><Text style={s.small}>{snapshot?.approval ? '等待你的确认' : 'Monkey 正在处理'}{snapshot?.run?.usage?.outputTokens ? ` · ${snapshot.run.usage.outputTokens} 输出 tokens` : ''}</Text></View>}
      <View style={s.composer}>
        {!!files.length && <ScrollView horizontal contentContainerStyle={s.row}>{files.map((file, i) => <Pressable key={i} accessibilityLabel={`移除附件 ${file.name}`} onPress={() => setFiles(old => old.filter((_, index) => index !== i))} style={s.file}><Text numberOfLines={1} style={s.small}>{file.name} ×</Text></Pressable>)}</ScrollView>}
        <TextInput accessibilityLabel="消息" value={draft} onChangeText={setDraft} multiline placeholder={online ? '和 Monkey 说点什么…' : '连接 Monkey 后开始对话'} placeholderTextColor={C.muted} style={s.messageInput} editable={online && !sending} />
        <View style={s.composerFooter}><View style={s.row}><Pressable accessibilityRole="button" accessibilityLabel="添加图片" disabled={!online || sending} onPress={() => void attempt(() => addFile(true))} style={s.iconButton}><Icon name="image" color={C.muted} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="添加文本附件" disabled={!online || sending} onPress={() => void attempt(() => addFile(false))} style={s.iconButton}><Icon name="paperclip" color={C.muted} /></Pressable><Text style={s.small}>图片 / 文本</Text></View>{busy ? <Button label="停止" icon="square" disabled={!online} onPress={() => void attempt(() => rpc.request('abort', { sessionId: activeId.current }))} /> : <Button label={sending ? '发送中' : '发送'} icon="arrow-up" primary disabled={!online || !snapshot || sending || (!draft.trim() && !files.length)} onPress={() => void send()} />}</View>
      </View><Text style={s.footnote}>会话在各端同步 · 工具在你的主机上执行</Text>
    </View>
  </View>
  const settings = <ScrollView contentContainerStyle={s.settings} keyboardShouldPersistTaps="handled">
    <Text style={s.pageTitle}>让 Monkey 陪你到处走。</Text><Text style={s.description}>连接同一台 Monkey 主机，在手机、平板和电脑上继续对话。</Text>
    <View style={s.card}><Text style={s.cardTitle}>连接主机</Text><Text style={s.label}>服务地址</Text><TextInput accessibilityLabel="服务地址" autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://monkey.example.com" value={address} onChangeText={setAddress} style={s.input} /><Text style={s.label}>连接密钥</Text><TextInput accessibilityLabel="连接密钥" autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="粘贴主机上的 server-token" value={token} onChangeText={setToken} style={s.input} /><Text style={s.small}>在主机运行 monkey serve，从 ~/.monkey-cli/server-token 获取连接密钥。它与模型 API Key 不同。{Platform.OS === 'web' ? '浏览器不会保存密钥。' : '密钥保存在系统安全存储中。'}</Text><View style={[s.row, { marginTop: 18 }]}><Button label="连接" icon="link" primary onPress={() => void attempt(connect)} /><Button label="断开并忘记" disabled={status === 'offline' && !token} onPress={() => void attempt(async () => { await clearConnection(); rpc.disconnect(); setToken(''); setSnapshot(null); setSessions([]); activeId.current = null })} /></View></View>
    {snapshot && <View style={s.card}><Text style={s.cardTitle}>当前会话</Text><Text style={s.label}>模型</Text><View style={[s.row, { flexWrap: 'wrap' }]}>{models.map(model => <Button key={model.id} label={model.alias} disabled={!online || busy} onPress={() => { setModelDraft(model.id); void attempt(() => change('set_model', { model: model.id })) }} />)}</View><TextInput accessibilityLabel="模型 ID" value={modelDraft} onChangeText={setModelDraft} placeholder={snapshot.model} autoCapitalize="none" autoCorrect={false} style={[s.input, { marginTop: 12 }]} /><Button label="使用这个模型" disabled={!online || busy || !modelDraft.trim()} onPress={() => void attempt(() => change('set_model', { model: modelDraft }))} /><Text style={[s.small, { marginTop: 8 }]}>模型需已配置在主机的服务商中。</Text>
      <View style={s.divider} /><Text style={s.bold}>{snapshot.wildMode ? 'Wild 模式已开启' : '逐次确认操作'}</Text><Text style={[s.small, { marginVertical: 10 }]}>默认在执行命令、修改文件或操作备忘录前询问。Wild 模式会跳过这些确认。</Text><Button label={snapshot.wildMode ? '恢复逐次确认' : '开启 Wild 模式'} disabled={!online || busy} onPress={() => snapshot.wildMode ? void attempt(() => change('set_wild', { wild: false })) : setConfirm({ title: '开启 Wild 模式？', body: 'Monkey 将可以直接在主机上执行命令和修改文件，无需逐次确认。仅对当前会话生效。', action: () => void attempt(() => change('set_wild', { wild: true })) })} />
      <View style={s.divider} /><View style={[s.row, { flexWrap: 'wrap' }]}><Button label="重命名" disabled={!online || busy} onPress={() => setRename(snapshot.sessionTitle)} /><Button label="清空内容" disabled={!online || busy} onPress={() => setConfirm({ title: '清空会话内容？', body: '所有设备上的这个会话都会清空。', action: () => void attempt(() => change('clear')) })} /><Button label="删除会话" disabled={!online || busy} onPress={askDelete} /></View>
    </View>}
    <Text style={s.small}>iOS · Android · Web · Desktop{ '\n' }Monkey 0.3 · 你的主机保存会话和记忆，模型服务商处理对话内容。</Text>
  </ScrollView>
  return <SafeAreaView style={s.safe} edges={['top', 'bottom']}><StatusBar style="dark" /><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.root}>
    {wide && <View style={s.sidebar}><View style={s.brand}><Image source={require('./assets/icon.png')} style={s.brandIcon} /><Text style={s.brandName}>monkey<Text style={{ color: C.orange }}>.</Text></Text></View><Button label="新会话" icon="plus" disabled={!online || sending} onPress={() => void attempt(newSession)} /><View style={{ flex: 1, marginTop: 30 }}>{sessionList}</View><Pressable style={s.connectionBadge} onPress={() => setScreen('settings')}><View style={[s.dot, { backgroundColor: online ? C.green : C.muted }]} /><Text style={s.small}>{statusText[status]}</Text><View style={{ flex: 1 }} /><Icon name="settings" size={18} /></Pressable></View>}
    <View style={s.main}><View style={s.topbar}>{!wide && <View style={s.brand}><Image source={require('./assets/icon.png')} style={s.brandIcon} /><Text style={s.brandName}>monkey.</Text></View>}<View style={s.row}>{(['chat', 'sessions', 'settings'] as const).filter(key => !wide || key !== 'sessions').map(key => <Pressable key={key} accessibilityRole="button" onPress={() => setScreen(key)} style={[s.nav, screen === key && s.navActive]}><Text style={[s.navText, screen === key && { color: C.ink }]}>{key === 'chat' ? '对话' : key === 'sessions' ? '会话' : '设置'}</Text></Pressable>)}</View>{wide && <Text style={s.small}>A LITTLE CURIOUS. ALWAYS HERE.</Text>}</View>
      {(error || (!online && status !== 'offline')) && <View style={s.error}><Text style={{ color: '#974A32', flex: 1 }}>{error || `${statusText[status]}，恢复连接后将同步进度。`}</Text><Pressable accessibilityLabel="关闭提示" onPress={() => setError('')} style={s.iconButton}><Icon name="x" color="#974A32" size={16} /></Pressable></View>}
      {!!notice && <View style={s.notice}><Text style={{ color: C.green }}>{notice}</Text></View>}
      {screen === 'chat' ? chat : screen === 'settings' ? settings : <View style={{ flex: 1, padding: 20 }}><Button label="新会话" icon="plus" primary disabled={!online || sending} onPress={() => void attempt(newSession)} />{sessionList}</View>}
    </View>
    <Modal visible={!!confirm || rename !== null} transparent animationType="fade" onRequestClose={() => { setConfirm(null); setRename(null) }}><View style={s.modalBackdrop}><View style={s.modalCard}><Text style={s.cardTitle}>{confirm?.title || '重命名会话'}</Text>{confirm ? <Text style={s.description}>{confirm.body}</Text> : <TextInput accessibilityLabel="会话名称" autoFocus value={rename || ''} onChangeText={setRename} style={s.input} maxLength={100} />}<View style={s.row}><Button label="取消" onPress={() => { setConfirm(null); setRename(null) }} /><Button label="确认" primary onPress={() => { if (confirm) { const action = confirm.action; setConfirm(null); action() } else { const title = rename; setRename(null); void attempt(() => change('session_rename', { title })) } }} /></View></View></View></Modal>
  </KeyboardAvoidingView></SafeAreaView>
}
function Message({ item, onCopy }: { item: Data; onCopy: () => void }) {
  const [expanded, setExpanded] = useState(false)
  if (item.role === 'tool') return <Pressable accessibilityRole="button" accessibilityLabel="展开工具结果" onPress={() => setExpanded(!expanded)} style={s.tool}><Icon name={item.status === 'error' ? 'alert-circle' : 'terminal'} color={C.muted} size={15} /><View style={{ flex: 1 }}><Text style={s.small}>{item.toolName || '工具结果'}{item.status === 'running' ? ' · 处理中' : ''}</Text><Text selectable numberOfLines={expanded ? undefined : 2} style={s.code}>{item.content}</Text></View><Icon name={expanded ? 'chevron-up' : 'chevron-down'} color={C.muted} size={14} /></Pressable>
  if (item.role === 'user') return <View style={s.userMessage}><Text selectable style={s.userText}>{item.content}</Text></View>
  return <View style={s.assistantMessage}><View style={[s.row, { marginBottom: 7 }]}><Image source={require('./assets/icon.png')} style={s.messageAvatar} /><Text style={s.bold}>Monkey</Text></View><Markdown style={markdown} onLinkPress={url => { if (/^https?:\/\//i.test(url)) void Linking.openURL(url); return false }}>{item.content}</Markdown><Pressable accessibilityRole="button" accessibilityLabel="复制回复" onPress={onCopy} style={s.copy}><Icon name="copy" size={14} color={C.muted} /><Text style={s.small}>复制</Text></Pressable></View>
}
export default function App() { return <SafeAreaProvider><AppContent /></SafeAreaProvider> }
const markdown = StyleSheet.create({ body: { color: C.ink, fontSize: 16, lineHeight: 26 }, code_inline: { backgroundColor: '#F0EEE8', color: C.ink }, fence: { backgroundColor: '#F4F2EC', color: C.ink, borderColor: C.line, borderRadius: 10, padding: 14 }, link: { color: C.orange }, heading1: { fontSize: 24 }, heading2: { fontSize: 21 } })
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, root: { flex: 1, flexDirection: 'row' }, main: { flex: 1, minWidth: 0, backgroundColor: C.paper },
  sidebar: { width: 264, backgroundColor: C.bg, padding: 22, borderRightWidth: 1, borderRightColor: C.line }, brand: { flexDirection: 'row', alignItems: 'center', gap: 8 }, brandIcon: { width: 30, height: 30, borderRadius: 9 }, brandName: { fontSize: 25, fontWeight: '800', letterSpacing: -1 },
  button: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 15, borderWidth: 1, borderColor: C.line, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: C.paper }, primary: { backgroundColor: C.orange, borderColor: C.orange }, buttonText: { color: C.ink, fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 }, muted: { color: C.muted, fontSize: 14 }, small: { color: C.muted, fontSize: 12, lineHeight: 19 }, bold: { color: C.ink, fontWeight: '600', fontSize: 14 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 17 }, eyebrow: { color: C.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1 }, session: { paddingVertical: 14, paddingHorizontal: 12, flexDirection: 'row', gap: 10, borderRadius: 12, alignItems: 'center' }, sessionTitle: { color: C.ink, fontSize: 14, marginBottom: 3 }, selected: { backgroundColor: '#EEECE5' }, connectionBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 18, borderTopWidth: 1, borderColor: C.line }, dot: { height: 6, width: 6, borderRadius: 3 },
  topbar: { minHeight: 73, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: C.line }, nav: { minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 10 }, navActive: { backgroundColor: C.bg }, navText: { color: C.muted, fontSize: 14, fontWeight: '600' },
  chat: { flex: 1 }, chatHeader: { paddingHorizontal: 24, paddingVertical: 18, flexDirection: 'row', alignItems: 'center' }, chatTitle: { fontSize: 17, fontWeight: '600', color: C.ink, marginBottom: 3 }, iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  welcome: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32 }, avatar: { width: 94, height: 94, borderRadius: 27, marginBottom: 25 }, welcomeTitle: { fontSize: 29, fontWeight: '700', letterSpacing: -0.8, color: C.ink, textAlign: 'center' }, welcomeCopy: { color: C.muted, lineHeight: 25, fontSize: 15, textAlign: 'center', marginTop: 14 }, suggestions: { width: '100%', maxWidth: 470, gap: 9, marginTop: 29, marginBottom: 25 }, suggestion: { borderWidth: 1, borderColor: C.line, backgroundColor: C.bg, borderRadius: 13, padding: 16, gap: 12, flexDirection: 'row', alignItems: 'center' }, suggestionTitle: { flex: 1, color: C.ink, fontSize: 14 },
  messageList: { padding: 24, gap: 18, width: '100%', maxWidth: 850, alignSelf: 'center' }, userMessage: { alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: C.pale, paddingHorizontal: 18, paddingVertical: 13, borderRadius: 17, borderBottomRightRadius: 5 }, userText: { fontSize: 16, lineHeight: 25, color: C.ink }, assistantMessage: { paddingVertical: 8 }, messageAvatar: { width: 26, height: 26, borderRadius: 8 }, copy: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' }, tool: { flexDirection: 'row', gap: 10, backgroundColor: C.bg, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: C.line }, code: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, lineHeight: 19, color: C.ink },
  composerArea: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 5, width: '100%', maxWidth: 850, alignSelf: 'center' }, composer: { borderWidth: 1, borderColor: '#DDDAD2', borderRadius: 18, backgroundColor: C.paper, padding: 10 }, messageInput: { minHeight: 53, maxHeight: 150, padding: 10, fontSize: 16, color: C.ink, textAlignVertical: 'top' }, composerFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, footnote: { color: C.muted, fontSize: 10, textAlign: 'center', paddingVertical: 9 }, runStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 }, file: { maxWidth: 180, padding: 8, backgroundColor: C.bg, borderRadius: 8 },
  settings: { padding: 24, gap: 20, maxWidth: 760, width: '100%', alignSelf: 'center' }, pageTitle: { color: C.ink, fontSize: 27, fontWeight: '700', marginTop: 10 }, description: { color: C.muted, fontSize: 15, lineHeight: 24 }, card: { backgroundColor: C.bg, borderRadius: 17, padding: 22, borderColor: C.line, borderWidth: 1 }, cardTitle: { color: C.ink, fontSize: 18, fontWeight: '600', marginBottom: 17 }, label: { color: C.ink, fontSize: 13, marginBottom: 8, marginTop: 12 }, input: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: 10, minHeight: 47, padding: 12, fontSize: 15, color: C.ink, marginBottom: 12 }, divider: { height: 1, backgroundColor: C.line, marginVertical: 23 }, error: { backgroundColor: '#FFF0E8', paddingHorizontal: 18, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' }, notice: { padding: 12, alignItems: 'center', backgroundColor: '#EDF7F1' }, approval: { backgroundColor: '#FFF7E8', borderWidth: 1, borderColor: '#F0D5A4', borderRadius: 14, padding: 16, marginHorizontal: 20, gap: 8 }, modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00000055', padding: 24 }, modalCard: { backgroundColor: C.paper, padding: 24, borderRadius: 18, maxWidth: 430, width: '100%', gap: 16 },
})
