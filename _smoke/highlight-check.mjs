/**
 * 双向高亮（T05.5 #1）运行期校验：确认「问题清单 ↔ 标注框」两个方向都能联动点亮。
 *
 * 方向一（正）：悬停 .issue → 对应 .anno__box 出现 --on
 * 方向二（反）：悬停 .anno__box → 对应 .issue 出现 --on（本任务新增链路）
 *
 * 用法：node highlight-check.mjs [baseUrl] [cdpPort]
 */
// T2 整改：token 改为 HMAC 签名后，真实登录换取 token 再注入 localStorage
import { sessionSeed } from './_auth-helper.mjs'
const BASE = process.argv[2] || 'http://127.0.0.1:4173'
const PORT = process.argv[3] || '9335'

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

async function runInPage(browser, hashPath, waitMs) {
  const url = `${BASE}/#${hashPath}`
  const { result } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const targetId = result.targetId
  const { result: attach } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
  const sessionId = attach.sessionId

  const logs = []
  browser.ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.sessionId !== sessionId) return
    if (msg.method === 'Runtime.consoleAPICalled') {
      const kind = msg.params.type
      if (kind === 'error' || kind === 'warning') {
        const body = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')
        logs.push(`[console.${kind}] ${body}`)
      }
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
  // ★ 登录强制后，页面脚本执行前先注入演示会话（否则守卫会拦回 /login）
  await sendTo('Page.addScriptToEvaluateOnNewDocument', {
    source: await sessionSeed(process.env.PROBE_USER || 'liqiang'),
  })
  await sendTo('Page.enable')
  await sendTo('Page.navigate', { url })
  await new Promise((r) => setTimeout(r, waitMs))

  const expr = `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = { issueCount: document.querySelectorAll('.issue').length, boxCount: document.querySelectorAll('.anno__box').length, tagCount: document.querySelectorAll('.anno__tag').length };
    // 方向一：悬停第一个问题 → 标注框点亮
    const issue = document.querySelector('.issue');
    out.hasIssue = !!issue;
    if (issue) {
      issue.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
      await sleep(350);
      out.boxOnAfterIssueHover = document.querySelectorAll('.anno__box--on').length + document.querySelectorAll('.anno__tag--on').length;
      issue.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
      await sleep(250);
    }
    // 方向二：逐个悬停标注框，找到能反向点亮问题清单的那个
    out.issueOnAfterBoxHover = 0;
    out.triggeredBoxIndex = -1;
    const boxes = Array.from(document.querySelectorAll('.anno__box'));
    for (let i = 0; i < boxes.length; i++) {
      boxes[i].dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
      await sleep(120);
      const n = document.querySelectorAll('.issue--on').length;
      if (n > 0) { out.issueOnAfterBoxHover = n; out.triggeredBoxIndex = i; break; }
      boxes[i].dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
      await sleep(60);
    }
    return JSON.stringify(out);
  })()`

  const evalRes = await sendTo('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  })
  const value = evalRes.result?.result?.value ?? '{}'
  let parsed = {}
  try {
    parsed = JSON.parse(value)
  } catch {
    parsed = { raw: value }
  }
  await browser.send('Target.closeTarget', { targetId })
  return { logs, parsed }
}

const browser = await connectBrowser()
const { logs, parsed } = await runInPage(browser, '/rep/diagnosis/D_S3', 5000)
browser.ws.close()

console.log('页面状态:', JSON.stringify(parsed, null, 2))
console.log('运行期日志(错误/警告):', logs.length ? logs.join(' || ') : '无')

const fwdOk = (parsed.boxOnAfterIssueHover ?? 0) > 0
const revOk = (parsed.issueOnAfterBoxHover ?? 0) > 0
console.log(`\n方向一 问题→标注 高亮: ${fwdOk ? 'PASS' : 'FAIL'} (boxOn=${parsed.boxOnAfterIssueHover})`)
console.log(`方向二 标注→问题 高亮: ${revOk ? 'PASS' : 'FAIL'} (issueOn=${parsed.issueOnAfterBoxHover}, box#${parsed.triggeredBoxIndex})`)

if (logs.length || !fwdOk || !revOk) {
  console.log('\n结论: FAIL')
  process.exitCode = 1
} else {
  console.log('\n结论: PASS —— 双向高亮两个方向均生效，无报错')
}
