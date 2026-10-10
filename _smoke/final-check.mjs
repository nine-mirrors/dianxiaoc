/**
 * 三任务综合验收：P1 / P6 / P5 无头实测 + 逐页截图。
 * 截图输出到 ../_screenshots/（相对 store-app 根）
 */
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://127.0.0.1:5180'
const PORT = '9333'
const OUT = 'C:/Users/21820/Desktop/蒙牛/03_产品Demo/_screenshots'
fs.mkdirSync(OUT, { recursive: true })

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
const targetId = result.targetId
const { result: attach } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
const sid = attach.sessionId
let mid = 2e6
const sendTo = (method, params = {}) => new Promise((r) => {
  const i = ++mid
  const on = (ev) => { const m = JSON.parse(ev.data); if (m.id === i) { browser.ws.removeEventListener('message', on); r(m) } }
  browser.ws.addEventListener('message', on)
  browser.ws.send(JSON.stringify({ id: i, method, params, sessionId: sid }))
})
const evaluate = async (e) => (await sendTo('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value

const logs = []
browser.ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.sessionId !== sid) return
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
    logs.push(`[${m.params.type}] ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`)
  } else if (m.method === 'Runtime.exceptionThrown') {
    logs.push(`[exception] ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`)
  }
})

await sendTo('Runtime.enable')
await sendTo('Page.enable')

/** 设 viewport */
async function setViewport(w, h) {
  await sendTo('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: false })
}

/** 导航并等待 */
async function nav(hash, waitMs) {
  await sendTo('Page.navigate', { url: `${BASE}/#${hash}` })
  await new Promise((r) => setTimeout(r, waitMs))
}

/** 截图 */
async function shot(name) {
  const r = await sendTo('Page.captureScreenshot', { format: 'png', fromSurface: true })
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64'))
  console.log(`  📸 已截图 ${name}`)
}

/** 取正文文本 */
async function text() {
  return (await evaluate('document.body ? document.body.innerText.replace(/\\s+/g," ") : ""')) || ''
}

/** 点击指定文案按钮 */
async function clickBtn(label) {
  return evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('${label}')); if (b) { b.click(); return true } return false })()`)
}

/** 当前 hash */
async function hash() {
  return evaluate('location.hash')
}

const report = []

/* ───────────────── 清空旧 localStorage，保证干净演示态 ───────────────── */
await setViewport(560, 960)
await nav('/role', 1400)
await evaluate('localStorage.clear()')
await nav('/role', 1500)

/* ═══════════════ 任务二：P1 角色选择 ═══════════════ */
console.log('\n=== P1 角色选择 ===')
const p1Text = await text()
for (const k of ['店小C', '蒙牛 AI 巡店助手', '拍一张货架照，AI 告诉你该怎么卖', '推荐', '演示模式 · 无需注册登录', '本地演示数据 · 不依赖网络']) {
  const ok = p1Text.includes(k)
  report.push(`P1「${k}」: ${ok ? '✅' : '❌'}`)
  console.log(`  「${k}」: ${ok ? '✅' : '❌'}`)
}
await shot('p1-role.png')

// 三角色可进
await clickBtn('业代 · 李强'); await new Promise((r) => setTimeout(r, 800))
const hRep = await hash()
console.log(`  点业代卡 → ${hRep} ${hRep.includes('/rep/today') ? '✅' : '❌'}`)
await nav('/role', 1000)
await clickBtn('区域经理 · 王敏'); await new Promise((r) => setTimeout(r, 800))
const hMgr = await hash()
console.log(`  点经理卡 → ${hMgr} ${hMgr.includes('/manager/dashboard') ? '✅' : '❌'}`)
await setViewport(560, 960)
await nav('/role', 1000)
await clickBtn('店员/店主 · 张大姐'); await new Promise((r) => setTimeout(r, 800))
const hOwn = await hash()
console.log(`  点店员卡 → ${hOwn} ${hOwn.includes('/owner') ? '✅' : '❌'}`)

/* ═══════════════ 任务三：P6 店员端四步 ═══════════════ */
console.log('\n=== P6 店员端 ===')
await setViewport(560, 960)
await nav('/owner', 1500)
let t = await text()
console.log(`  ① 引导页「3 步看好你的货架」: ${t.includes('3 步看好你的货架') ? '✅' : '❌'}`)
await shot('p6-guide.png')

await clickBtn('开始自助诊断'); await new Promise((r) => setTimeout(r, 700))
t = await text()
console.log(`  ② 拍照页「开始 AI 看」: ${t.includes('开始 AI 看') ? '✅' : '❌'}`)
await shot('p6-capture.png')

await clickBtn('开始 AI 看'); await new Promise((r) => setTimeout(r, 2200))
t = await text()
console.log(`  ③ 结果页「AI 帮你发现」: ${t.includes('AI 帮你发现') ? '✅' : '❌'}`)
console.log(`  ③ 结果页「建议补这些货」: ${t.includes('建议补这些货') ? '✅' : '❌'}`)
console.log(`  ③ 结果页无「健康分/六维度」术语: ${!/健康分|六维度|雷达/.test(t) ? '✅' : '❌'}`)
await shot('p6-result.png')

await clickBtn('一键订货'); await new Promise((r) => setTimeout(r, 1500))
t = await text()
console.log(`  ④ 成功页「订货成功」: ${t.includes('订货成功') ? '✅' : '❌'}`)
console.log(`  ④ 成功页「李强将在 2 小时内」: ${t.includes('2 小时内与你联系') ? '✅' : '❌'}`)
await shot('p6-success.png')

/* ═══════════════ 任务一：P5 delta 口径 ═══════════════ */
console.log('\n=== P5 KPI delta ===')
await setViewport(1440, 900)
await nav('/manager/dashboard', 2600)
t = await text()
for (const k of ['↑0.8', '↓1.1pt', '↑1.9pt', '↓5']) {
  const ok = t.includes(k)
  report.push(`P5 delta「${k}」: ${ok ? '✅' : '❌'}`)
  console.log(`  delta「${k}」: ${ok ? '✅' : '❌'}`)
}
await shot('p5-dashboard.png')

/* ───────────────── 汇总 ───────────────── */
const errs = logs.filter((l) => /exception|console\.error/.test(l))
console.log(`\n控制台错误: ${errs.length ? errs.join(' || ') : '无'}`)
console.log(`\n截图目录: ${OUT}`)
await browser.send('Target.closeTarget', { targetId })
browser.ws.close()
process.exit(errs.length ? 1 : 0)
