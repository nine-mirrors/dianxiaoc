/**
 * 主链路点击流校验：P2 今日巡店 → P3 拍照 → AI 加载动画 → P4 诊断结果 → 生成整改单。
 *
 * 用法：node flow-check.mjs [baseUrl] [cdpPort]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:5173'
const PORT = process.argv[3] || '9333'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json())
const ws = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))

let id = 0
const pending = new Map()
const logs = []
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails
    logs.push(`[exception] ${d.exception?.description ?? d.text}`)
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    logs.push(`[console.error] ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`)
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    logs.push(`[log.error] ${m.params.entry.text}`)
  }
})
const send = (method, params = {}, sessionId) =>
  new Promise((res) => {
    const i = ++id
    pending.set(i, res)
    ws.send(JSON.stringify({ id: i, method, params, sessionId }))
  })

const { result } = await send('Target.createTarget', { url: 'about:blank' })
const tid = result.targetId
const { result: at } = await send('Target.attachToTarget', { targetId: tid, flatten: true })
const sid = at.sessionId
await send('Runtime.enable', {}, sid)
await send('Log.enable', {}, sid)
await send('Page.enable', {}, sid)
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid)
  return r.result?.result?.value
}

await send('Page.navigate', { url: `${BASE}/#/rep/today` }, sid)
await sleep(600)
// 清空本地镜像并强制整页重载，保证每次跑的都是「第 1 家未巡店」的干净演示态
await evaluate(`localStorage.clear(); 'cleared'`)
await send('Page.reload', { ignoreCache: true }, sid)
await sleep(2600)

/**
 * 按可见文本点击元素。
 * 只匹配 button / a，且优先「精确相等」，避免点到外层容器（点容器不会触发 Vue 事件）。
 */
const clickText = (text) =>
  evaluate(`(() => {
    const want = ${JSON.stringify(text.replace(/\s+/g, ''))};
    const nodes = Array.from(document.querySelectorAll('button, a'));
    const hit =
      nodes.find((n) => (n.innerText || '').replace(/\\s+/g, '') === want) ||
      nodes.find((n) => (n.innerText || '').replace(/\\s+/g, '').includes(want));
    if (!hit) return 'NOT_FOUND:' + want;
    hit.scrollIntoView({ block: 'center' });
    hit.click();
    return 'CLICKED:' + want;
  })()`)

const steps = []
const record = async (label, value) => {
  steps.push(`${label}: ${value}`)
  console.log(`${label}: ${value}`)
}

await sleep(2600)
await record('P2 门店数', await evaluate(`document.querySelectorAll('[id^="store-card-"]').length`))

console.log(await clickText('去巡店'))
await sleep(2200)
await record('P3 URL', await evaluate(`location.hash`))
await record('P3 已选', await evaluate(`(document.body.innerText.match(/已选 \\d+ 张/) || ['无'])[0]`))

console.log(await clickText('开始 AI 诊断'))
await sleep(1200)
await record('AI 加载中', await evaluate(`document.body.innerText.includes('AI') ? 'ok' : 'no'`))
await sleep(6000)
await record('P4 URL', await evaluate(`location.hash`))
await record('P4 分数', await evaluate(`(document.body.innerText.match(/AI 健康分/) ? '有' : '无')`))

// 追问 AI（点第一个推荐问题）
console.log(await clickText('该补多少？'))
await sleep(3000)
await record('追问后文本含36瓶', await evaluate(`document.body.innerText.includes('36')`))

// 生成整改单 → 预览
console.log(await clickText('生成整改单'))
await sleep(1500)
await record('整改单预览', await evaluate(`document.body.innerText.includes('确认提交') ? '已弹出' : '未弹出'`))
await record('预览含36瓶', await evaluate(`document.body.innerText.includes('36')`))

// 确认提交 → 成功页
console.log(await clickText('确认提交'))
await sleep(2500)
await record('成功页', await evaluate(`document.body.innerText.includes('整改单已生成') ? '已出现' : '未出现'`))
await record('单号', await evaluate(`(document.body.innerText.match(/单号 [A-Za-z0-9_-]+/) || ['无'])[0]`))
await record('成功页合计', await evaluate(`(document.body.innerText.match(/合计\\s*\\d+ 瓶 · ¥\\d+/) || ['无'])[0].replace(/\\s+/g,' ')`))

// 返回今日巡店 → P2 闪光回写
console.log(await clickText('返回今日巡店'))
await sleep(2200)
await record('回到 P2', await evaluate(`location.hash`))
await record('P2 含完成标记', await evaluate(`document.body.innerText.includes('今日已完成巡店')`))

console.log('\n--- 控制台错误 ---')
console.log(logs.length ? logs.join('\n') : '无')
await send('Target.closeTarget', { targetId: tid })
ws.close()
