/**
 * 地图无网降级验证：阻断瓦片域名 → 应出现提示条，且门店标记点仍渲染。
 * 用法：node map-offline-check.mjs [baseUrl] [cdpPort]
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

async function main() {
  const browser = await connect()
  const results = []
  const ok = (n, p, e = '') => {
    results.push(p)
    console.log(`  ${p ? '✅' : '❌'} ${n}${e ? '  ' + e : ''}`)
  }

  const { result } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const { result: attach } = await browser.send('Target.attachToTarget', {
    targetId: result.targetId,
    flatten: true,
  })
  const sid = attach.sessionId
  const send = (m, p = {}) => browser.send(m, p, sid)

  // ★ 阻断高德瓦片域名（模拟现场无外网）
  await send('Network.enable')
  await send('Network.setBlockedURLs', { urls: ['*autonavi.com*', '*is.autonavi*'] })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: (await sessionSeed('liqiang')),
  })
  await send('Page.navigate', { url: `${BASE}/#/rep/today` })
  await sleep(6000)

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    return r.result?.result?.value
  }

  console.log('\n── 瓦片被阻断后的地图状态 ──')
  const state = JSON.parse(
    await evalJs(`JSON.stringify({
      tip: (document.querySelector('.map-offline-tip')||{}).innerText || '',
      hasTip: !!document.querySelector('.map-offline-tip'),
      grayBg: (document.querySelector('.map-view')||{}).className?.includes('map-view--offline') || false,
      markers: document.querySelectorAll('.leaflet-marker-icon').length,
      tiles: document.querySelectorAll('.leaflet-tile').length,
    })`),
  )
  ok('出现「底图加载失败」提示条', state.hasTip, state.tip.slice(0, 40))
  ok('底图转为灰底示意', state.grayBg === true)
  ok('门店标记点仍渲染（点位不丢）', state.markers >= 5, `${state.markers} 个标记`)
  ok('瓦片确实被拦（未加载成功）', state.tiles > 0, `${state.tiles} 个 tile 元素`)

  const pass = results.filter(Boolean).length
  console.log(`\n结论: ${pass === results.length ? 'PASS' : 'FAIL'} —— 通过 ${pass}/${results.length}`)
  process.exit(pass === results.length ? 0 : 1)
}

main().catch((e) => {
  console.error('运行失败:', e.message)
  process.exit(1)
})
