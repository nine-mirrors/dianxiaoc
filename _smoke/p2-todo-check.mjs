/**
 * 跨角色闭环收尾验证：经理下派后，业代端 P2 待办应可见。
 * 前置：p5-check 已下派任务（db.tasks ≥ 2，其中 assigneeId=U_REP 且 open）。
 *
 * 用法：node p2-todo-check.mjs [baseUrl] [cdpPort]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:4173'
const PORT = process.argv[3] || '9333'

async function connectBrowser() {
  const version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json())
  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
  return { ws, send: (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) }) }
}

const browser = await connectBrowser()
const { result } = await browser.send('Target.createTarget', { url: 'about:blank' })
const { result: attach } = await browser.send('Target.attachToTarget', { targetId: result.targetId, flatten: true })
const sid = attach.sessionId
let mid = 1e6
const sendTo = (method, params = {}) => new Promise((r) => {
  const i = ++mid
  const on = (ev) => { const m = JSON.parse(ev.data); if (m.id === i) { browser.ws.removeEventListener('message', on); r(m) } }
  browser.ws.addEventListener('message', on)
  browser.ws.send(JSON.stringify({ id: i, method, params, sessionId: sid }))
})
const evaluate = async (e) => (await sendTo('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value

await sendTo('Runtime.enable')
await sendTo('Page.enable')
// 切到业代角色（localStorage 写 session roleId=rep），再开 P2
await sendTo('Page.navigate', { url: `${BASE}/#/rep/today` })
await new Promise((r) => setTimeout(r, 3000))
const text = await evaluate('document.body ? document.body.innerText.replace(/\\s+/g," ") : ""')
// ⚠ C1：原读 localStorage['store-app:db:v1'] —— 那是 **mock 时代的存储键**，
// mock 删除后就不存在，catch 返回 -1，看起来像「待办数为负数」，极具误导性。
// 改为直接查**真后端** GET /api/v1/tasks（需 token，用登录接口现取）。
const API = process.argv[4] || process.env.SMOKE_API || 'http://127.0.0.1:3000'
let todoCount = -1
let countNote = ''
try {
  const login = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'liqiang', password: '123456' }),
  }).then((r) => r.json())
  const token = login?.data?.token
  const resp = await fetch(`${API}/api/v1/tasks`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then((r) => r.json())
  const tasks = resp?.data?.tasks ?? []
  todoCount = tasks.filter((t) => t.assigneeId === 'U_REP' && t.status === 'open').length
  countNote = `（真后端 ${tasks.length} 条任务中，U_REP 的 open 任务）`
} catch (e) {
  countNote = `（查询失败：${e.message}）`
}

console.log('=== 业代端 P2 待办 ===')
console.log(`  open 待办数: ${todoCount}${countNote}`)
console.log(`  P2 页面出现「待办」或「王敏」或「下派」: ${/待办|王敏|下派|整改任务/.test(text) ? '✅' : '❌'}`)
console.log(`  P2 文案片段: ${text.slice(0, 200)}`)

await browser.send('Target.closeTarget', { targetId: result.targetId })
browser.ws.close()
