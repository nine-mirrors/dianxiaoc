/** 补充业代端三页截图（P12 演示页素材） */
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://127.0.0.1:5180'
const PORT = '9333'
const OUT = 'C:/Users/21820/Desktop/蒙牛/03_产品Demo/_screenshots'

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
let mid = 3e6
const sendTo = (method, params = {}) => new Promise((r) => {
  const i = ++mid
  const on = (ev) => { const m = JSON.parse(ev.data); if (m.id === i) { browser.ws.removeEventListener('message', on); r(m) } }
  browser.ws.addEventListener('message', on)
  browser.ws.send(JSON.stringify({ id: i, method, params, sessionId: sid }))
})
const evaluate = async (e) => (await sendTo('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value

await sendTo('Runtime.enable')
await sendTo('Page.enable')
await sendTo('Emulation.setDeviceMetricsOverride', { width: 560, height: 960, deviceScaleFactor: 2, mobile: false })

async function nav(hash, waitMs) {
  await sendTo('Page.navigate', { url: `${BASE}/#${hash}` })
  await new Promise((r) => setTimeout(r, waitMs))
}
async function shot(name) {
  const r = await sendTo('Page.captureScreenshot', { format: 'png', fromSurface: true })
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64'))
  console.log(`📸 ${name}`)
}

// 先清 localStorage 保证干净演示态
await nav('/role', 1400)
await evaluate('localStorage.clear()')
await nav('/rep/today', 1800)
await shot('p2-today.png')
await nav('/rep/capture/S3', 1800)
await shot('p3-capture.png')
await nav('/rep/diagnosis/D_S3', 3200)
await shot('p4-diagnosis.png')

await browser.send('Target.closeTarget', { targetId })
browser.ws.close()
console.log('完成')
