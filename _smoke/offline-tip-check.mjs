/**
 * 断网提示验证：阻断后端请求 → 桌面看板与移动端都应出现「后端未连接」提示。
 * 用法：node offline-tip-check.mjs [baseUrl] [cdpPort]
 */
// T2 整改：token 改为 HMAC 签名后，真实登录换取 token 再注入 localStorage
import { sessionSeed, API_BASE } from './_auth-helper.mjs'
const BASE = process.argv[2] || 'http://127.0.0.1:5180'
const PORT = process.argv[3] || '9360'
/** 后端地址：与 _auth-helper 同源，供断网阻断 pattern 推导端口 */
const API = process.argv[4] || API_BASE
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

async function main() {
  const browser = await connect()
  const R = []
  const ok = (n, p, e = '') => {
    R.push(p)
    console.log(`  ${p ? '✅' : '❌'} ${n}${e ? '  ' + e : ''}`)
  }

  const { result } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const { result: attach } = await browser.send('Target.attachToTarget', {
    targetId: result.targetId,
    flatten: true,
  })
  const sid = attach.sessionId
  const send = (m, p = {}) => browser.send(m, p, sid)
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    return r.result?.result?.value
  }

  await send('Network.enable')
  await send('Page.enable')
  await send('Runtime.enable')

  // ★ 第一步：先在**联网状态真实登录一次**，让 localStorage 存下 token + 用户身份
  //   （断网降级依赖这份缓存；直接注入裸 token 不带 user，测的不是真实场景）
  await send('Page.navigate', { url: `${BASE}/#/login` })
  await sleep(4000)
  await evalJs(`(() => {
    const setVal = (el, v) => {
      const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
      d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setVal(document.querySelector('#lg-user'), 'wangmin');
    setVal(document.querySelector('#lg-pwd'), '123456');
    document.querySelector('.lg-submit').click();
    return true;
  })()`)
  await sleep(3000)
  const cached = await evalJs(`localStorage.getItem('store-app:session')`)
  ok('联网登录成功并缓存身份', !!cached && cached.includes('user'), String(cached).slice(0, 60))

  // 第二步：阻断后端（模拟现场断网 / 服务未起），并**刷新页面**——
  //   现场断网时通常会刷新或重新打开，这才会重新走 restore() 的离线分支
  // ⚠ 阻断 pattern 从 API 地址推导，避免换端口后阻断失效（那样就测不到断网分支）
  const apiPort = new URL(API).port || '80'
  await send('Network.setBlockedURLs', { urls: [`*127.0.0.1:${apiPort}*`] })
  await send('Page.reload', {})
  await sleep(5000)


  console.log('\n── 桌面看板（P5）断网提示 ──')
  await send('Page.navigate', { url: `${BASE}/#/manager/dashboard` })
  await sleep(5000)
  const desk = JSON.parse(
    await evalJs(`JSON.stringify({
      tip: (document.querySelector('.desk-header__offline')||{}).innerText || '',
      hasTip: !!document.querySelector('.desk-header__offline'),
      hash: location.hash,
    })`),
  )
  ok('桌面端出现「后端未连接」提示', desk.hasTip === true, desk.tip.slice(0, 46))
  ok('仍停留在看板（未被踢走）', desk.hash.includes('manager'), desk.hash)

  console.log('\n── 移动端（P2）断网提示 ──')
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: (await sessionSeed('liqiang')),
  })
  await send('Page.navigate', { url: `${BASE}/#/rep/today` })
  await sleep(5000)
  const mob = JSON.parse(
    await evalJs(`JSON.stringify({
      hasTip: !!document.querySelector('.p2-offline, [class*="offline"]'),
      text: document.body.innerText.includes('后端未连接'),
    })`),
  )
  ok('移动端有断网提示', mob.hasTip === true || mob.text === true)

  const pass = R.filter(Boolean).length
  console.log(`\n结论: ${pass === R.length ? 'PASS' : 'FAIL'} —— 通过 ${pass}/${R.length}`)
  process.exit(pass === R.length ? 0 : 1)
}

main().catch((e) => {
  console.error('运行失败:', e.message)
  process.exit(1)
})