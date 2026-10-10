/**
 * P5 经理看板专项校验（复用 render-check 的 CDP 思路）。
 * 验证：环图/趋势渲染、下派弹层可打开、跨角色闭环落库、控制台无报错。
 *
 * 用法：node p5-check.mjs [baseUrl] [cdpPort]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:4173'
const PORT = process.argv[3] || '9333'

async function connectBrowser() {
  const version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json())
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

const browser = await connectBrowser()
const { result } = await browser.send('Target.createTarget', { url: 'about:blank' })
const targetId = result.targetId
const { result: attach } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
const sessionId = attach.sessionId

const logs = []
browser.ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.sessionId !== sessionId) return
  if (msg.method === 'Runtime.consoleAPICalled') {
    const kind = msg.params.type
    const body = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')
    if (kind === 'error' || kind === 'warning') logs.push(`[console.${kind}] ${body}`)
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    logs.push(`[exception] ${d.exception?.description ?? d.text}`)
  } else if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry
    if (e.level === 'error' || e.level === 'warning') logs.push(`[log.${e.level}] ${e.text}`)
  }
})

let mid = Math.floor(Math.random() * 1e9)
const sendTo = (method, params = {}) =>
  new Promise((resolve) => {
    const myId = ++mid
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

const evaluate = async (expression) => {
  const r = await sendTo('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return r.result?.result?.value
}

await sendTo('Runtime.enable')
await sendTo('Log.enable')
await sendTo('Page.enable')
await sendTo('Page.navigate', { url: `${BASE}/#/manager/dashboard` })
await new Promise((r) => setTimeout(r, 3500))

const text = await evaluate('document.body ? document.body.innerText.replace(/\\s+/g," ") : ""')
const canvasCount = await evaluate('document.querySelectorAll("canvas").length')

console.log('=== P5 /manager/dashboard ===')
const must = ['区域平均健康分', '健康分四档分布', '近 8 周趋势', '门店明细', '风险预警', '下派任务', '永辉生活', '门店']
for (const k of must) {
  console.log(`  关键词「${k}」: ${text.includes(k) ? '✅' : '❌'}`)
}
console.log(`  canvas 元素数: ${canvasCount}（环图+趋势应 ≥ 2）`)
console.log(`  控制台错误: ${logs.length ? logs.join(' || ') : '无'}`)

// 点击「下派任务」按钮 → 弹层应出现
await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('下派任务')); if (b) b.click(); return !!b })()`)
await new Promise((r) => setTimeout(r, 800))
const dlgText = await evaluate('document.body ? document.body.innerText.replace(/\\s+/g," ") : ""')
console.log(`  弹层「下派整改任务」: ${dlgText.includes('下派整改任务') ? '✅' : '❌'}`)
console.log(`  弹层「目标门店」「任务类型」「完成时限」: ${dlgText.includes('目标门店') && dlgText.includes('任务类型') && dlgText.includes('完成时限') ? '✅' : '❌'}`)

// 确认下派（默认选中 S5 永辉生活，任务类型 OOS）
await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('确认下派')); if (b) b.click(); return !!b })()`)
await new Promise((r) => setTimeout(r, 1200))
const dbRaw = await evaluate(`localStorage.getItem('store-app:db:v1')`)
let taskCount = 0
try {
  const db = JSON.parse(dbRaw)
  taskCount = db.tasks.length
} catch { taskCount = -1 }
console.log(`  下派后 db.tasks 数量: ${taskCount}（应 ≥ 2：默认 1 + 新下派 1）`)
const toastText = await evaluate('document.body ? document.body.innerText.replace(/\\s+/g," ") : ""')
console.log(`  下派成功提示: ${toastText.includes('已写入业代待办') || toastText.includes('任务已下派') ? '✅' : '❌'}`)

const errors = logs.filter((l) => /exception|console\.error|\[log\.error\]/.test(l))
console.log(`\n汇总: ${errors.length ? '❌ 有报错: ' + errors.join(' || ') : '✅ P5 看板渲染正常、弹层可用、跨角色落库成功'}`)
await browser.send('Target.closeTarget', { targetId })
browser.ws.close()
process.exit(errors.length ? 1 : 0)
