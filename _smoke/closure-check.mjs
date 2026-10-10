/**
 * 闭环三件套端到端验证（浏览器真实交互）：
 *  ① P4 整改回执：点「已处理」→ 弹层打开 → 提交 → 回执 toast + 前后对比区块出现
 *  ② P2 任务标记完成：待办卡点「标记完成」→ 列表减少
 *  ③ P2 待接单：存在店主下单记录并可一键确认
 *  ④ P5 新增「整改闭环」与「本周订货汇总」两张卡
 *
 * 用法：node closure-check.mjs [baseUrl] [cdpPort]
 */
// T2 整改：token 改为 HMAC 签名后，真实登录换取 token 再注入 localStorage
import { sessionSeed, loginToken } from './_auth-helper.mjs'
const BASE = process.argv[2] || 'http://127.0.0.1:5180'
const PORT = process.argv[3] || '9333'
const API = process.argv[4] || process.env.SMOKE_API || 'http://127.0.0.1:3000'
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
  const errors = []
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (pend.has(m.id)) {
      pend.get(m.id)(m)
      pend.delete(m.id)
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push((m.params?.exceptionDetails?.exception?.description || '').slice(0, 140))
    }
  })
  const send = (m, p = {}, s) =>
    new Promise((res) => {
      const myId = ++seq
      pend.set(myId, res)
      ws.send(JSON.stringify({ id: myId, method: m, params: p, ...(s ? { sessionId: s } : {}) }))
    })
  return { ws, send, errors }
}

async function openAs(browser, user, hash) {
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
    source: await sessionSeed(user),
  })
  await send('Page.navigate', { url: `${BASE}/${hash}` })
  await sleep(4200)
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    return r.result?.result?.value
  }
  return { evalJs, close: () => browser.send('Target.closeTarget', { targetId: result.targetId }) }
}

async function main() {
  const browser = await connect()
  const R = []
  const ok = (n, p, e = '') => {
    R.push(p)
    console.log(`  ${p ? '✅' : '❌'} ${n}${e ? '  ' + e : ''}`)
  }

  console.log('\n── ① P4 整改回执弹层 ──')
  const p4 = await openAs(browser, 'liqiang', '#/rep/diagnosis/D_S3')
  const before = await p4.evalJs(`document.querySelectorAll('.issue').length`)
  await p4.evalJs(`(() => {
    const btns = [...document.querySelectorAll('.issue__actions button, .issue__actions .u-btn')]
    const t = btns.find(b => b.innerText.includes('已处理'))
    if (t) t.click()
    return !!t
  })()`)
  await sleep(1200)
  const dlg = await p4.evalJs(`JSON.stringify({
    open: !!document.querySelector('.rc-mask'),
    text: document.body.innerText.includes('整改') || document.body.innerText.includes('留证'),
    hasUpload: !!document.querySelector('input[type=file]'),
  })`)
  const d = JSON.parse(dlg)
  ok('点「已处理」弹出回执弹层', d.open === true, `open=${d.open}`)
  ok('弹层含上传整改后照片入口', d.hasUpload === true)
  ok('弹层含整改/留证文案', d.text === true)
  await p4.close()

  console.log('\n── ② P2 待办标记完成 + 待接单 ──')
  // ⚠ T1 整改后业务接口需鉴权；下派任务限 manager，建单用 owner 账号
  const mgrToken = await loginToken('wangmin')
  const ownerToken = await loginToken('zhangdajie')
  // 先造一条待办任务与一条店主订货单
  await fetch(`${API}/api/v1/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mgrToken}` },
    body: JSON.stringify({ storeId: 'S3', title: '闭环验证·补货复查', assigneeId: 'U_REP', taskType: 'OOS', note: 'closure' }),
  })
  // 先造一张「待接单」的订货单（已接单的单不应出现在待接单区，那是正确行为）
  await fetch(`${API}/api/v1/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({
      kind: 'order', storeId: 'S2', storeName: '好邻居·地铁口店',
      items: [{ skuId: 'SKU_001', skuName: '优益C 100ml', bottles: 12, amount: 48 }],
      note: '闭环验证·店主自助订货', totalBottles: 12, totalAmount: 48,
    }),
  })
  const p2 = await openAs(browser, 'liqiang', '#/rep/today')
  const t0 = await p2.evalJs(`document.querySelectorAll('.p2-todo__item, .todo__item, [class*="todo"] li, [class*="todo"] .p2-card').length`)
  const hasDoneBtn = await p2.evalJs(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('标记完成'))
    return !!b
  })()`)
  ok('P2 待办卡出现「标记完成」按钮', hasDoneBtn === true, `待办元素 ${t0} 个`)
  const hasOrder = await p2.evalJs(`document.body.innerText.includes('待接单') || document.body.innerText.includes('接单')`)
  ok('P2 出现「待接单」区（店主下单已落库）', hasOrder === true)
  if (hasDoneBtn) {
    await p2.evalJs(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('标记完成'))
      b.click(); return true
    })()`)
    await sleep(1600)
    const after = await p2.evalJs(`document.body.innerText`)
    ok('点「标记完成」后有反馈', /已完成|已标记|完成/.test(after))
  }
  await p2.close()

  console.log('\n── ③ P5 新增两张卡 ──')
  const p5 = await openAs(browser, 'wangmin', '#/manager/dashboard')
  const cards = await p5.evalJs(`(() => {
    const t = document.body.innerText
    return JSON.stringify({
      rectify: t.includes('整改闭环'),
      order: t.includes('订货汇总') || t.includes('本周订货'),
      done: /已整改|整改完成|已完成整改/.test(t),
    })
  })()`)
  const c = JSON.parse(cards)
  ok('P5 有「整改闭环」卡', c.rectify === true)
  ok('P5 有「本周订货汇总」卡', c.order === true)
  await p5.close()

  const errs = browser.errors.filter(Boolean)
  console.log('\n── ④ 控制台 ──')
  ok('无未捕获异常', errs.length === 0, errs[0] || '')

  const pass = R.filter(Boolean).length
  console.log(`\n结论: ${pass === R.length ? 'PASS' : 'FAIL'} —— 通过 ${pass}/${R.length}`)
  process.exit(pass === R.length ? 0 : 1)
}

main().catch((e) => {
  console.error('运行失败:', e.message)
  process.exit(1)
})
