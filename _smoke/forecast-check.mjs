/**
 * 验证 P4「补货算法推导」卡片：点开后能拉到后端算式并渲染。
 * 用法：node forecast-check.mjs [baseUrl] [cdpPort]
 */
// T2 整改：token 改为 HMAC 签名后，真实登录换取 token 再注入 localStorage
import { sessionSeed } from './_auth-helper.mjs'
const BASE = process.argv[2] || 'http://127.0.0.1:5180'
const PORT = process.argv[3] || '9333'

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
  const send = (method, params = {}, sessionId) =>
    new Promise((res) => {
      const myId = ++seq
      pend.set(myId, res)
      ws.send(JSON.stringify({ id: myId, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  return { ws, send }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await connect()
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
  await send('Page.navigate', { url: `${BASE}/#/rep/diagnosis/D_S3` })
  await sleep(4500)

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    return r.result?.result?.value
  }

  const results = []
  const ok = (name, pass, extra = '') => {
    results.push(pass)
    console.log(`  ${pass ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`)
  }

  console.log('\n── ① 卡片存在 ──')
  const hasCard = await evalJs(`document.body.innerText.includes('补货算法推导')`)
  ok('P4 显示「补货算法推导」卡片', hasCard === true)

  console.log('\n── ② 点开加载算式 ──')
  await evalJs(`(() => {
    const btns = [...document.querySelectorAll('.p4-ai-btn')];
    const t = btns.find(b => b.innerText.includes('怎么算出来'));
    if (t) t.click();
    return true;
  })()`)
  await sleep(2500)
  const detail = await evalJs(`JSON.stringify({
    steps: document.querySelectorAll('.p4-fc__steps li').length,
    params: (document.querySelector('.p4-fc__params')||{}).innerText || '',
    summary: (document.querySelector('.p4-fc__summary')||{}).innerText || '',
    title: (document.querySelector('.p4-fc__title')||{}).innerText || '',
  })`)
  const d = JSON.parse(detail)
  ok('渲染出逐步算式', d.steps >= 5, `步骤数 ${d.steps}`)
  ok('显示算法参数', /z=1\.28/.test(d.params) && /σ=0\.3/.test(d.params), d.params.slice(0, 60))
  ok('显示 SKU 与建议瓶数', /建议\s*\d+\s*瓶/.test(d.title), d.title)
  ok('显示与业务基准的对比', /算法复核/.test(d.summary), d.summary.slice(0, 70))

  console.log('\n── ③ 收起/再展开不重复请求 ──')
  await evalJs(`(() => {
    const btns = [...document.querySelectorAll('.p4-ai-btn')];
    const t = btns.find(b => b.innerText.includes('收起推导过程'));
    if (t) t.click();
    return true;
  })()`)
  await sleep(600)
  const closed = await evalJs(`document.querySelectorAll('.p4-fc').length`)
  await evalJs(`(() => {
    const btns = [...document.querySelectorAll('.p4-ai-btn')];
    const t = btns.find(b => b.innerText.includes('怎么算出来'));
    if (t) t.click();
    return true;
  })()`)
  await sleep(1200)
  const reopened = await evalJs(`document.querySelectorAll('.p4-fc__steps li').length`)
  ok('收起后内容隐藏', closed === 0)
  ok('再展开内容仍在（走缓存不重复请求）', reopened >= 5, `步骤数 ${reopened}`)

  const pass = results.filter(Boolean).length
  console.log(`\n结论: ${pass === results.length ? 'PASS' : 'FAIL'} —— 通过 ${pass}/${results.length}`)
  process.exit(pass === results.length ? 0 : 1)
}

main().catch((e) => {
  console.error('运行失败:', e.message)
  process.exit(1)
})
