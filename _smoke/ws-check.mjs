/**
 * WebSocket 跨角色实时推送运行期校验。
 *
 * 验证链路：
 *   1) 连一个 ws 客户端（模拟「业代」已登录在线）；
 *   2) 触发 `POST /api/v1/tasks`（模拟「经理下派任务」）；
 *   3) 断言该 ws 客户端**实时**收到 `task:new` 推送（无需轮询/刷新）；
 *   4) 打开业代端今日巡店页，确认控制台 0 错误（连不上 WS 也不能白屏/报错）。
 *
 * 用法：node ws-check.mjs [baseUrl] [cdpPort]
 *   baseUrl  前端地址（默认 http://127.0.0.1:5180，仅用于第 4 步浏览器校验）
 *   cdpPort  Chrome 远程调试端口（默认 9333；不可达时自动跳过第 4 步）
 *   后端地址固定取环境变量 WS_API 或 http://127.0.0.1:3000
 *
 * 注：使用 Node 22 内置全局 WebSocket（无需从 server/node_modules 解析依赖）。
 */

// T2 整改：token 改为 HMAC 签名后，真实登录换取 token 再注入 localStorage
import { sessionSeed, loginToken } from './_auth-helper.mjs'
const BASE = process.argv[2] || 'http://127.0.0.1:5180'
const CDP_PORT = process.argv[3] || '9333'
const API = process.env.WS_API || 'http://127.0.0.1:3000'
const WS_URL = API.replace(/^http/, 'ws') + '/ws'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ═══════════════ 第 1–3 步：WS 推送断言 ═══════════════ */

async function checkRealtimePush() {
  const result = { ok: false, connected: false, events: [], hello: null, pushed: null, reason: '' }

  // ⚠ A1 安全整改后 /ws 握手要验签 token，query 里的 role/name 已被后端忽略。
  //   这里必须带真实 token，否则服务端以 1008「未授权」关闭，收不到任何推送。
  const wsToken = await loginToken('liqiang')
  const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(wsToken)}`)
  const frames = []
  ws.addEventListener('message', (ev) => {
    let frame
    try { frame = JSON.parse(String(ev.data)) } catch { return }
    frames.push(frame)
    if (frame.event === 'hello') result.hello = frame.payload
    if (frame.event === 'task:new') result.pushed = frame
  })

  const connected = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 5000)
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(true) }, { once: true })
    ws.addEventListener('error', () => { clearTimeout(timer); resolve(false) }, { once: true })
  })

  if (!connected) {
    result.reason = `无法连接 ${WS_URL}（后端未启动？）`
    try { ws.close() } catch { /* ignore */ }
    return result
  }
  result.connected = true

  // 触发「经理下派任务」
  // ⚠ T1 整改后该接口需要鉴权 + 限 manager 角色，故用经理账号的真实 token
  const storeId = process.env.WS_STORE || 'S5'
  let mgrToken = ''
  try {
    mgrToken = await loginToken('wangmin')
  } catch (e) {
    result.reason = `经理登录失败：${e.message}`
  }
  const res = await fetch(`${API}/api/v1/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(mgrToken ? { Authorization: `Bearer ${mgrToken}` } : {}),
    },
    body: JSON.stringify({
      storeId,
      taskType: 'OOS',
      assigneeId: 'U_REP',
      dueAt: '今日 18:00',
      note: 'ws-check 自测下派',
    }),
  }).then((r) => r.json()).catch((e) => ({ code: -1, message: String(e) }))

  // 等推送到达（最多 4s）
  const deadline = Date.now() + 4000
  while (!result.pushed && Date.now() < deadline) await sleep(150)

  try { ws.close() } catch { /* ignore */ }

  result.events = frames.map((f) => f.event)
  result.postCode = res?.code
  result.postTaskId = res?.data?.task?.id ?? null
  result.ok = !!result.pushed && result.pushed?.payload?.task?.id === result.postTaskId
  if (!result.pushed) result.reason = '未收到 task:new 推送'
  return result
}

/* ═══════════════ 第 4 步：浏览器控制台 0 错误 ═══════════════ */

async function connectBrowser(port) {
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json())
  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const myId = ++id
      pending.set(myId, resolve)
      ws.send(JSON.stringify({ id: myId, method, params }))
    })
  return { ws, send }
}

async function checkPageConsole() {
  const out = { skipped: false, logs: [], page: null }
  let browser
  try {
    browser = await connectBrowser(CDP_PORT)
  } catch {
    out.skipped = true
    out.logs = []
    return out
  }

  const url = `${BASE}/#/rep/today`
  const { result } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const targetId = result.targetId
  const { result: attach } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
  const sessionId = attach.sessionId

  browser.ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.sessionId !== sessionId) return
    if (msg.method === 'Runtime.consoleAPICalled') {
      const kind = msg.params.type
      if (kind === 'error' || kind === 'warning') {
        const body = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')
        out.logs.push(`[console.${kind}] ${body}`)
      }
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      out.logs.push(`[exception] ${d.exception?.description ?? d.text}`)
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry
      if (e.level === 'error' || e.level === 'warning') out.logs.push(`[log.${e.level}] ${e.text}`)
    }
  })

  const sendTo = (method, params = {}) =>
    new Promise((resolve) => {
      const myId = Math.floor(Math.random() * 1e9)
      const onMsg = (ev) => {
        const m = JSON.parse(ev.data)
        if (m.id === myId) {
          browser.ws.removeEventListener('message', onMsg)
          resolve(m)
        }
      }
      browser.ws.addEventListener('message', onMsg)
      browser.ws.send(JSON.stringify({ id: myId, method, params, sessionId }))
    })

  await sendTo('Runtime.enable')
  await sendTo('Log.enable')
  // ★ 登录强制后，页面脚本执行前先注入演示会话（否则守卫会拦回 /login）
  await sendTo('Page.addScriptToEvaluateOnNewDocument', {
    source: await sessionSeed(process.env.PROBE_USER || 'liqiang'),
  })
  await sendTo('Page.enable')
  await sendTo('Page.navigate', { url })
  await sleep(5000)

  // 顺带确认页面真的渲染出来了（不是白屏）
  const evalRes = await sendTo('Runtime.evaluate', {
    expression: `JSON.stringify({ title: document.title, hasContent: (document.body.innerText||'').trim().length, storeCards: document.querySelectorAll('.store-card, [class*="store-card"]').length })`,
    returnByValue: true,
  })
  try {
    out.page = JSON.parse(evalRes.result?.result?.value ?? '{}')
  } catch {
    out.page = {}
  }

  await browser.send('Target.closeTarget', { targetId })
  browser.ws.close()
  return out
}

/* ═══════════════ 主流程 ═══════════════ */

console.log(`后端 WS: ${WS_URL}`)
console.log(`前端地址: ${BASE}   CDP: ${CDP_PORT}\n`)

const rt = await checkRealtimePush()
console.log('── ① WS 连接与推送 ──')
console.log(`   连接成功          : ${rt.connected ? 'YES' : 'NO'}${rt.reason ? ' (' + rt.reason + ')' : ''}`)
console.log(`   服务端 hello 身份 : ${rt.hello ? JSON.stringify(rt.hello) : '无'}`)
console.log(`   收到的事件序列    : ${rt.events.length ? rt.events.join(' → ') : '无'}`)
console.log(`   POST /tasks 返回  : code=${rt.postCode} taskId=${rt.postTaskId}`)
console.log(`   收到 task:new     : ${rt.pushed ? 'YES' : 'NO'}`)
if (rt.pushed) {
  const t = rt.pushed.payload?.task ?? {}
  console.log(`   推送内容          : ${t.storeName ?? '?'} / ${t.taskTypeLabel ?? '?'} / ${t.id ?? '?'}`)
}
console.log(`   推送 taskId 一致  : ${rt.ok ? 'YES' : 'NO'}\n`)

const page = await checkPageConsole()
console.log('── ② 业代端页面控制台 ──')
if (page.skipped) {
  console.log(`   跳过（CDP ${CDP_PORT} 不可达）`)
} else {
  console.log(`   页面已渲染        : ${page.page?.hasContent ?? '?'} 字符, 门店卡 ${page.page?.storeCards ?? 0} 张`)
  console.log(`   错误/警告         : ${page.logs.length ? page.logs.join(' || ') : '无'}`)
}
console.log()

const pass = rt.connected && rt.ok && (page.skipped || page.logs.length === 0)
if (pass) {
  console.log('结论: PASS —— 经理下派 → 业代实时收到 task:new，页面无报错')
} else {
  console.log('结论: FAIL')
  if (!rt.connected) console.log('  · WS 未连上：确认后端已启动（node src/index.js）')
  else if (!rt.ok) console.log('  · 未收到 task:new 或 taskId 不一致')
  if (!page.skipped && page.logs.length) console.log('  · 页面存在控制台错误，见上')
  process.exitCode = 1
}
