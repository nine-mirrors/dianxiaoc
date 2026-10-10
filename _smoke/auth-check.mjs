/**
 * 登录 + 身份由账号决定 + 权限隔离 验证（2026-10-09 新流程）。
 *
 * 用法：node auth-check.mjs [baseUrl] [cdpPort]
 *  1) 未登录访问业务页 → 被送去 /login
 *  2) 登录页的演示账号清单来自后端（含账号密码），点击可一键填入
 *  3) 三账号分别登录 → 落到各自落地页（前端无角色自选入口）
 *  4) 错误密码被拒
 *  5) 刷新页面用 token 恢复身份
 *  6) 跨端访问被守卫送回本角色落地页
 */
const BASE = process.argv[2] || 'http://127.0.0.1:5180'
const PORT = process.argv[3] || '9333'

async function connectBrowser() {
  const version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json())
  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let seq = 0
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
      const myId = ++seq
      pending.set(myId, resolve)
      ws.send(JSON.stringify({ id: myId, method, params }))
    })
  return { ws, send }
}

async function newPage(browser, url = `${BASE}/#/login`) {
  const { result } = await browser.send('Target.createTarget', { url })
  const { result: attach } = await browser.send('Target.attachToTarget', {
    targetId: result.targetId,
    flatten: true,
  })
  const sessionId = attach.sessionId
  let seq = 0
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const myId = ++seq
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
  await send('Page.enable')
  await send('Runtime.enable')
  return { sessionId, send }
}

/** 用 CDP 导航（hash 变化不会整页刷新） */
async function goto(page, hash) {
  await page.send('Page.navigate', { url: `${BASE}/${hash}` })
  await sleep(1200)
}

/** 清空登录态并回到登录页 */
async function resetToLogin(page) {
  await evalJs(page, `localStorage.clear(); true`)
  await goto(page, '#/login')
  await page.send('Page.reload', {})
  await sleep(1600)
}

async function evalJs(page, expression) {
  const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return r.result?.result?.value
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const SET_VALUE = `
  const setVal = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    d.set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
`

async function main() {
  const browser = await connectBrowser()
  const results = []
  const ok = (name, pass, extra = '') => {
    results.push(pass)
    console.log(`  ${pass ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`)
  }

  const page = await newPage(browser)

  console.log('\n── ① 未登录访问业务页 → 应被送去登录页 ──')
  // ⚠ 顺序要点：必须先清库再跳转。原写法先 goto('/login')，此时页面已用旧 token
  // 恢复成「已登录」身份，session 缓存在内存里，之后清库再跳转也不会重读 → 断言失真。
  await evalJs(page, `localStorage.clear(); true`)
  await goto(page, '#/rep/today')
  const h1 = await evalJs(page, 'location.hash')
  ok('未登录被拦截到 /login', h1 === '#/login', `实际 ${h1}`)

  console.log('\n── ② 演示账号清单来自后端 ──')
  const info = await evalJs(
    page,
    `JSON.stringify({
      accounts: document.querySelectorAll('.lg-account').length,
      firstUser: (document.querySelector('.lg-account__user')||{}).innerText || '',
      inputs: !!document.querySelector('#lg-user') && !!document.querySelector('#lg-pwd'),
      hasRoleCards: document.querySelectorAll('.role__card').length,
      hasSkip: !!document.querySelector('.login__skip'),
      hasPhone: !!document.querySelector('#login-phone'),
    })`,
  )
  const infoObj = JSON.parse(info)
  ok('账号清单已渲染（3 个）', infoObj.accounts === 3, `实际 ${infoObj.accounts}`)
  // ⚠ 2026-10-09 队长要求：登录页不再展示明文密码。
  //    账号仍由后端下发，但界面只显示账号名 —— 这里断言「只显示账号、不含密码」。
  ok('账号清单来自后端（且界面不露密码）', /^\w+$/.test(infoObj.firstUser), infoObj.firstUser)
  ok('界面未展示明文密码', !/\d{4,}/.test(infoObj.firstUser), infoObj.firstUser)
  ok('只有账号密码两个输入框', infoObj.inputs)
  ok('已移除角色自选卡', infoObj.hasRoleCards === 0)
  ok('已移除跳过登录', infoObj.hasSkip === false)
  ok('已移除手机号验证码', infoObj.hasPhone === false)

  console.log('\n── ③ 三账号登录 → 各自落地页（身份由账号决定）──')
  const cases = [
    ['liqiang', '#/rep/today'],
    ['wangmin', '#/manager/dashboard'],
    ['zhangdajie', '#/owner'],
  ]
  for (const [u, expect] of cases) {
    await resetToLogin(page)
    await evalJs(
      page,
      `(() => { ${SET_VALUE}
        const cards = [...document.querySelectorAll('.lg-account')];
        const idx = ${JSON.stringify(cases.findIndex((c) => c[0] === u))};
        if (cards[idx]) cards[idx].click();
        return true })()`,
    )
    await sleep(200)
    await evalJs(page, `(() => { document.querySelector('.lg-submit').click(); return true })()`)
    await sleep(1600)
    const hash = await evalJs(page, 'location.hash')
    ok(`账号 ${u} → ${expect}`, hash === expect, `实际 ${hash}`)
  }

  console.log('\n── ④ 错误密码被拒 ──')
  await resetToLogin(page)
  await evalJs(
    page,
    `(() => { ${SET_VALUE}
      setVal(document.querySelector('#lg-user'), 'wangmin');
      setVal(document.querySelector('#lg-pwd'), 'wrong-pwd');
      document.querySelector('.lg-submit').click();
      return true })()`,
  )
  await sleep(1500)
  const bad = await evalJs(page, 'location.hash')
  ok('错误密码停留在登录页', bad === '#/login', `实际 ${bad}`)

  console.log('\n── ⑤ 刷新后用 token 恢复身份 ──')
  await evalJs(
    page,
    `(() => { ${SET_VALUE}
      const cards = [...document.querySelectorAll('.lg-account')];
      cards[1].click();
      return true })()`,
  )
  await sleep(200)
  await evalJs(page, `(() => { document.querySelector('.lg-submit').click(); return true })()`)
  await sleep(1500)
  await evalJs(page, `location.reload(); true`)
  await sleep(2000)
  const afterReload = await evalJs(page, 'location.hash')
  ok('刷新后仍停留在看板（未回登录页）', afterReload === '#/manager/dashboard', `实际 ${afterReload}`)

  console.log('\n── ⑥ 跨端访问：经理可只读查看诊断，但不可进入业代工作台 ──')
  await evalJs(page, `(() => { location.hash = '#/rep/diagnosis/D_S3?readonly=1'; return true })()`)
  await sleep(1000)
  const roOK = await evalJs(page, 'location.hash')
  ok('经理可只读查看业代诊断页', roOK.includes('readonly=1'), `实际 ${roOK}`)
  await evalJs(page, `(() => { location.hash = '#/rep/today'; return true })()`)
  await sleep(1000)
  const guarded = await evalJs(page, 'location.hash')
  ok('经理进入业代工作台被拦回看板', guarded === '#/manager/dashboard', `实际 ${guarded}`)

  const passCount = results.filter(Boolean).length
  console.log(`\n结论: ${passCount === results.length ? 'PASS' : 'FAIL'} —— 通过 ${passCount}/${results.length}`)
  process.exit(passCount === results.length ? 0 : 1)
}

main().catch((e) => {
  console.error('运行失败:', e.message)
  process.exit(1)
})
