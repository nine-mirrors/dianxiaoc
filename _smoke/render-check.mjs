/**
 * 无头浏览器渲染校验（Node 22 内置 WebSocket + CDP）。
 *
 * 用途：逐个打开页面，捕获 console 报错 / Vue warn / 未捕获异常，
 * 并对关键文案做 DOM 断言，确认 dev 模式真实可跑。
 *
 * 用法：node render-check.mjs [baseUrl] [cdpPort]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:5173'
const PORT = process.argv[3] || '9333'

/** 建立浏览器级 CDP 连接 */
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

/** 打开页面并采集日志 + 文本 */
// T2 整改：token 改为 HMAC 签名后，真实登录换取 token 再注入 localStorage
import { sessionSeed } from './_auth-helper.mjs'

/** 页面路径 → 演示账号（对应后端 data/accounts.json） */
const TOKEN_USER = { '/rep': 'liqiang', '/manager': 'wangmin', '/owner': 'zhangdajie' }

async function inspect(browser, hashPath, waitMs = 3000) {
  const url = `${BASE}/#${hashPath}`
  const username =
    hashPath === '/login'
      ? '__anonymous__'
      : (Object.entries(TOKEN_USER).find(([p]) => hashPath.startsWith(p))?.[1] ?? 'liqiang')
  const { result } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const targetId = result.targetId
  const { result: attach } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
  const sessionId = attach.sessionId

  const logs = []
  let text = ''
  const events = new Map()

  browser.ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.sessionId !== sessionId) return
    if (msg.method === 'Runtime.consoleAPICalled') {
      const kind = msg.params.type
      const body = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')
      events.set(`c-${msg.params.executionContextId}-${logs.length}`, `[console.${kind}] ${body}`)
      if (kind === 'error' || kind === 'warning') logs.push(`[console.${kind}] ${body}`)
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      logs.push(`[exception] ${d.exception?.description ?? d.text}`)
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry
      if (e.level === 'error' || e.level === 'warning') logs.push(`[log.${e.level}] ${e.text}`)
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
  await sendTo('Page.enable')
  // ★ 在页面脚本执行前注入会话（否则应用启动时 restore() 读不到 token，
  //   守卫会把页面拦回 /login；同源多标签共享 localStorage，改完必须整页重载）
  await sendTo('Page.addScriptToEvaluateOnNewDocument', {
    source:
      username === '__anonymous__'
        ? `try { localStorage.removeItem('store-app:session') } catch (e) {}`
        : await sessionSeed(username),
  })
  await sendTo('Page.navigate', { url })
  await new Promise((r) => setTimeout(r, waitMs))
  const evalRes = await sendTo('Runtime.evaluate', {
    expression: 'document.body ? document.body.innerText.replace(/\\s+/g, " ") : ""',
    returnByValue: true,
  })
  text = evalRes.result?.result?.value ?? ''
  await browser.send('Target.closeTarget', { targetId })
  return { logs, text }
}

const CASES = [
  { path: '/rep/today', wait: 2500, keys: ['李强', '今日门店', '平均健康分', '今日拜访线路', '48', '80'] },
  { path: '/rep/capture/S3', wait: 2500, keys: ['巡店拍照', '拍摄类型', '拍摄类型', '开始 AI 诊断', '已打卡'] },
  { path: '/rep/diagnosis/D_S3', wait: 4000, keys: ['健康分', '问题清单', '行动方案', '缺货'] },
  { path: '/rep/diagnosis/D_S3?readonly=1', wait: 3500, keys: ['健康分', '问题清单', '行动方案'] },
  { path: '/rep/history', wait: 2500, keys: ['历史'] },
  { path: '/manager/dashboard', wait: 2500, keys: ['门店明细'] },
  { path: '/owner', wait: 2500, keys: [] },
  { path: '/login', wait: 3000, keys: ['账号登录', '演示账号', 'liqiang'] },
]

const browser = await connectBrowser()
const results = []
for (const c of CASES) {
  try {
    const { logs, text } = await inspect(browser, c.path, c.wait)
    const errors = logs.filter((l) => /exception|console\.error|\[log\.error\]/.test(l))
    const warns = logs.filter((l) => /\[log\.warning\]|console\.warning/.test(l))
    const missing = c.keys.filter((k) => !text.includes(k))
    results.push({ path: c.path, errors, missing })
    console.log(`\n=== ${c.path}`)
    console.log(`  文本长度=${text.length}  缺失关键词=${missing.length ? missing.join(',') : '无'}`)
    console.log(`  错误=${errors.length ? errors.join(' || ') : '无'}`)
    if (warns.length) console.log(`  警告=${warns.join(' || ')}`)
  } catch (e) {
    results.push({ path: c.path, errors: [`脚本异常: ${e.message}`], missing: c.keys })
    console.log(`\n=== ${c.path}\n  脚本异常: ${e.message}`)
  }
}

const bad = results.filter((r) => r.errors.length || r.missing.length)
console.log(`\n\n汇总：${results.length - bad.length}/${results.length} 页面无报错且关键文案齐全`)
if (bad.length) {
  console.log('失败页面：' + bad.map((b) => b.path).join(', '))
  process.exitCode = 1
}
browser.ws.close()
