/**
 * WebSocket 端到端验证（**浏览器真实客户端**）。
 *
 * 为什么不用 ws-check.mjs：那个脚本用 Node 直连协议层，绕过了前端
 * `realtime/client.ts`。2026-10-09 曾出现「isOfflineMock() 恒返回 true 导致
 * 浏览器端从不连接」的缺陷，协议层测试依然 PASS —— 因此必须补这个
 * 「页面真实连接」维度的验证。
 *
 * 验证：
 *  1) 打开业代端页面 → 后端 /health 的 realtime.clients 应 ≥ 1
 *  2) 经理下派任务 → 业代页面应出现「收到新任务」toast
 *
 * 用法：node ws-e2e-check.mjs [baseUrl] [cdpPort] [apiBase]
 */
// T2 整改：token 改为 HMAC 签名后，真实登录换取 token 再注入 localStorage
import { sessionSeed, loginToken } from './_auth-helper.mjs'
const BASE = process.argv[2] || 'http://127.0.0.1:5180'
const PORT = process.argv[3] || '9333'
const API = process.argv[4] || 'http://127.0.0.1:3000'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect() {
  const v = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json())
  const ws = new WebSocket(v.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  let seq = 0
  const pend = new Map()
  const logs = []
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (pend.has(m.id)) {
      pend.get(m.id)(m)
      pend.delete(m.id)
    }
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push(m.params?.exceptionDetails?.exception?.description?.slice(0, 160) ?? '')
    }
  })
  const send = (m, p = {}, s) =>
    new Promise((res) => {
      const myId = ++seq
      pend.set(myId, res)
      ws.send(JSON.stringify({ id: myId, method: m, params: p, ...(s ? { sessionId: s } : {}) }))
    })
  return { ws, send, logs }
}

async function main() {
  const browser = await connect()
  const results = []
  const ok = (n, p, e = '') => {
    results.push(p)
    console.log(`  ${p ? '✅' : '❌'} ${n}${e ? '  ' + e : ''}`)
  }

  // ① 打开业代端（注入 liqiang 会话）
  const { result } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const { result: attach } = await browser.send('Target.attachToTarget', {
    targetId: result.targetId,
    flatten: true,
  })
  const sid = attach.sessionId
  const send = (m, p = {}) => browser.send(m, p, sid)
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: (await sessionSeed('liqiang')),
  })
  await send('Page.navigate', { url: `${BASE}/#/rep/today` })
  await sleep(5000)

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    return r.result?.result?.value
  }

  console.log('\n── ① 浏览器端是否真的连上 WS ──')
  const health = await (await fetch(`${API}/health`)).json()
  ok('后端记录到页面 WS 连接', health.realtime.clients >= 1, `clients=${health.realtime.clients}`)

  const wsState = await evalJs(`(() => {
    const s = window.__wsDebug
    return JSON.stringify({ hasGlobal: !!s })
  })()`)
  void wsState

  console.log('\n── ② 经理下派 → 业代页面实时收到 ──')
  const before = await evalJs(`document.body.innerText.length`)
  // ⚠ T1 整改后该接口需要鉴权 + 限 manager 角色，故用经理账号的真实 token
  const mgrToken = await loginToken('wangmin')
  await fetch(`${API}/api/v1/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${mgrToken}`,
    },
    body: JSON.stringify({
      storeId: 'S3',
      title: 'WS端到端验证·缺货补货',
      assigneeId: 'U_REP',
      note: 'ws-e2e',
    }),
  })
  await sleep(2500)
  const after = await evalJs(`document.body.innerText`)
  const gotToast = /收到新任务|王敏经理/.test(String(after))
  ok('页面出现「收到新任务 / 王敏经理」', gotToast)
  const todo = /待办提醒（\d+）/.exec(String(after))
  ok('待办数量已刷新', !!todo, todo ? todo[0] : '未找到待办提醒')
  void before

  console.log('\n── ③ 控制台无异常 ──')
  const errs = browser.logs.filter(Boolean)
  ok('无未捕获异常', errs.length === 0, errs[0] || '')

  const pass = results.filter(Boolean).length
  console.log(`\n结论: ${pass === results.length ? 'PASS' : 'FAIL'} —— 通过 ${pass}/${results.length}`)
  process.exit(pass === results.length ? 0 : 1)
}

main().catch((e) => {
  console.error('运行失败:', e.message)
  process.exit(1)
})
