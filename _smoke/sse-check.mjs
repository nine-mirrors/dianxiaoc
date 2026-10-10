/**
 * SSE 改造交互校验：P4 的「生成巡店小结」按钮 + 追问 chips。
 * 默认 .env 为 http 且后端未起 → 走降级（mock）路径，验证不报错且能产出文本。
 * 用 NO_PROXY=127.0.0.1,localhost 避免 Node/Chrome 把 localhost 走代理。
 */
// T1 整改：业务接口需鉴权，先真实登录换取 token 再注入 localStorage
import { sessionSeed } from './_auth-helper.mjs'
const BASE = process.argv[2] || 'http://127.0.0.1:5180'
const PORT = process.argv[3] || '9333'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const v = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json())
const ws = new WebSocket(v.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))

let id = 0
const pend = new Map()
const logs = []
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exc] ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text))
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('[console.error] ' + m.params.args.map((a) => a.value ?? a.description).join(' '))
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push('[log.error] ' + m.params.entry.text)
})
const send = (method, params = {}, sid) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId: sid })) })

const { result } = await send('Target.createTarget', { url: 'about:blank' })
const tid = result.targetId
const { result: at } = await send('Target.attachToTarget', { targetId: tid, flatten: true })
const sid = at.sessionId
await send('Runtime.enable', {}, sid)
await send('Log.enable', {}, sid)
await send('Page.enable', {}, sid)
// T1 整改后业务接口需鉴权：先真实登录换 token 并注入 localStorage，
// 否则路由守卫会把页面弹回 /login（表现为「按钮 NOT_FOUND」）。
await send('Page.addScriptToEvaluateOnNewDocument', { source: await sessionSeed('liqiang') }, sid)
await send('Page.navigate', { url: `${BASE}/#/rep/diagnosis/D_S3` }, sid)
await sleep(4500)

const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }, sid); return r.result?.result?.value }
const click = async (t) => ev(`(() => { const ns=[...document.querySelectorAll('button')]; const w=ns.find(n=>(n.innerText||'').replace(/\\s+/g,'').includes(${JSON.stringify(t.replace(/\\s+/g,''))})); if(!w) return 'NOT_FOUND'; w.scrollIntoView({block:'center'}); w.click(); return 'CLICKED '+${JSON.stringify(t)} })()`)

console.log('== 生成巡店小结 ==')
console.log(await click('生成巡店小结'))
await sleep(3500)
console.log('小结文本含「健康分」:', await ev(`document.body.innerText.includes('健康分')`))
console.log('小结文本含「美宜佳」:', await ev(`document.body.innerText.includes('美宜佳')`))
console.log('仍显示按钮? ', await ev(`!!Array.from(document.querySelectorAll('button')).find(n=>(n.innerText||'').includes('生成巡店小结'))`))

console.log('== 追问 chips ==')
console.log(await click('该补多少？'))
await sleep(3500)
console.log('AI 气泡数量:', await ev(`document.querySelectorAll('.chat__row--ai').length`))
console.log('出现 AI 巡检助手:', await ev(`document.body.innerText.includes('AI 巡检助手')`))

console.log('== 控制台错误 ==')
console.log(logs.length ? logs.join('\n') : '无')
await send('Target.closeTarget', { targetId: tid })
ws.close()
