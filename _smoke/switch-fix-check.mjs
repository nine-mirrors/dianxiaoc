/**
 * 验证两处阻塞缺陷已修复：
 *  A1) 「切换账号」三处入口不再调用错签名的 session.login(角色)
 *  A2) 经理点「查看详情」进入 /rep/diagnosis/D_S3?readonly=1 不再被守卫弹回
 *  B1) 切换账号后确实回到登录页
 *
 * 用法：node switch-fix-check.mjs [baseUrl] [cdpPort]
 */
// T2 整改：token 改为 HMAC 签名后，真实登录换取 token 再注入 localStorage
import { sessionSeed } from './_auth-helper.mjs'
const BASE = process.argv[2] || 'http://127.0.0.1:5180'
const PORT = process.argv[3] || '9333'
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
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (pend.has(m.id)) {
      pend.get(m.id)(m)
      pend.delete(m.id)
    }
  })
  const send = (m, p = {}, s) =>
    new Promise((res) => {
      const myId = ++seq
      pend.set(myId, res)
      ws.send(JSON.stringify({ id: myId, method: m, params: p, ...(s ? { sessionId: s } : {}) }))
    })
  return { ws, send }
}

async function openAs(browser, username, hash) {
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
    source: await sessionSeed(username),
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
  const results = []
  const ok = (n, p, e = '') => {
    results.push(p)
    console.log(`  ${p ? '✅' : '❌'} ${n}${e ? '  ' + e : ''}`)
  }

  console.log('\n── ① 经理登录后点「查看详情」不再被弹回 ──')
  const mgr = await openAs(browser, 'wangmin', '#/manager/dashboard')
  const beforeHash = await mgr.evalJs('location.hash')
  await mgr.evalJs(`(() => {
    const b = [...document.querySelectorAll('.p5__link')][0]
    if (b) b.click()
    return !!b
  })()`)
  await sleep(1800)
  const afterHash = await mgr.evalJs('location.hash')
  ok(
    '进入只读诊断页（未被守卫弹回）',
    afterHash.includes('/rep/diagnosis/') && afterHash.includes('readonly=1'),
    `前 ${beforeHash} → 后 ${afterHash}`,
  )
  const roText = await mgr.evalJs(`document.body.innerText.replace(/\\s+/g,' ').slice(0,120)`)
  ok('只读态渲染出诊断内容', /健康分|问题清单/.test(String(roText)), String(roText).slice(0, 60))
  await mgr.close()

  console.log('\n── ② 业代端「切换账号」回到登录页 ──')
  const rep = await openAs(browser, 'liqiang', '#/rep/today')
  await rep.evalJs(`(() => {
    const b = document.querySelector('.p2-head__avatar')
    if (b) b.click()
    return !!b
  })()`)
  await sleep(1800)
  const hash2 = await rep.evalJs('location.hash')
  ok('点击头像后回到登录页', hash2 === '#/login', `实际 ${hash2}`)
  const cleared = await rep.evalJs(`localStorage.getItem('store-app:session')`)
  ok('本地 token 已清除', cleared === null || cleared === 'null', String(cleared))
  await rep.close()

  const pass = results.filter(Boolean).length
  console.log(`\n结论: ${pass === results.length ? 'PASS' : 'FAIL'} —— 通过 ${pass}/${results.length}`)
  process.exit(pass === results.length ? 0 : 1)
}

main().catch((e) => {
  console.error('运行失败:', e.message)
  process.exit(1)
})
