/**
 * 账号鉴权（演示环境但走真接口 + 真签名）。
 *
 * 设计要点：
 *  1. **凭证只存在后端**：`data/accounts.json`，前端拿不到密码（登录页展示用的演示
 *     清单由 `GET /api/v1/auth/demo-accounts` 下发，来源仍是后端）；
 *  2. **账号决定身份**：登录成功后服务端返回该账号绑定的角色与落地页，
 *     前端不允许自行选择角色（角色由 token 解析）；
 *  3. **token 必须防伪造**（T2 整改）：HMAC-SHA256 签名 + 8 小时过期，
 *     验签用 `timingSafeEqual` 防时序攻击；密钥来自 `AUTH_SECRET`（见 .env），
 *     未配置时随机生成并打印警告（重启即失效，属安全兜底而非静默降级）；
 *  4. **业务接口必须鉴权**（T1 整改）：`requireAuth` / `requireRole` 中间件。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from './env.js'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { findUserByRole } from './db.js'
import { getAvatar, setAvatar, getProfile } from './ext.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ACCOUNTS_FILE = join(__dirname, '../data/accounts.json')

/** token 有效期：8 小时（够一天演示，过期须重新登录） */
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000

/**
 * ⚠ .env 读取（必须在此之前加载）。
 *
 * 【为什么必须放在本文件、且在 SECRET 之前】
 * ESM 的 `import` 会**先于模块体执行**：`index.js` 顶部的 `import './auth.js'`
 * 在它自己的模块体（里面才有 .env 加载代码）之前就跑完了。
 * 若 .env 只在 index.js 加载，本模块顶层求值的
 * `const SECRET = process.env.AUTH_SECRET || randomBytes(32)…`
 * 读到的必然是 `undefined` → 每次重启都换随机密钥 → 全员 token 失效
 * （实际踩过：.env 里配了 AUTH_SECRET，启动仍打印「未配置」警告）。
 *
 * 因此凡是「模块顶层就要读环境变量」的模块都必须自己先加载 .env
 * （`vision.js` 的 VL 配置是同样处理，此处与其保持一致）。
 */
// .env 加载统一到 env.js（见该文件顶部注释：为什么必须各模块自载）
loadEnv()

/**
 * ⚠ 签名密钥。
 * 优先取 `AUTH_SECRET`（写在 server/.env，不进仓库）；未配置时随机生成一把进程级密钥，
 * 并打印警告 —— 这样重启后旧 token 全部失效（安全侧正确），演示前应配置固定密钥。
 */
const SECRET = process.env.AUTH_SECRET || randomBytes(32).toString('hex')
if (!process.env.AUTH_SECRET) {
  console.warn('[auth] ⚠ 未配置 AUTH_SECRET，已启用进程级随机密钥；重启后所有 token 失效。')
  console.warn('[auth]   请在 server/.env 设置 AUTH_SECRET（参见 server/.env.example）。')
}

/** 四个演示账号（首次启动时落盘，之后以文件为准） */
const DEFAULT_ACCOUNTS = [
  { username: 'liqiang', password: '123456', role: 'rep' },
  { username: 'wangmin', password: '123456', role: 'manager' },
  { username: 'zhangdajie', password: '123456', role: 'owner' },
  { username: 'admin', password: '123456', role: 'admin' },
]

/** 账号 → 落地页（服务端裁定，前端不可自选） */
const ROLE_HOME = {
  rep: '/rep/today',
  manager: '/manager/dashboard',
  owner: '/owner',
  admin: '/admin',
}

/** 账号 → 该角色能访问的页面清单（服务端下发，用于前端路由守卫与文案说明） */
const ROLE_SCOPE = {
  rep: ['今日巡店', '拍照诊断', 'AI 方案', '整改留证'],
  manager: ['区域看板', '风险预警', '下派任务'],
  owner: ['自助诊断', '一键补货'],
  admin: ['平台总控', '账号派发', '黑名单', '知识库', '公告', '审计日志'],
}

function loadAccounts() {
  try {
    if (!existsSync(ACCOUNTS_FILE)) {
      mkdirSync(dirname(ACCOUNTS_FILE), { recursive: true })
      writeFileSync(ACCOUNTS_FILE, JSON.stringify({ accounts: DEFAULT_ACCOUNTS }, null, 2), 'utf8')
    }
    const raw = JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf8'))
    return Array.isArray(raw.accounts) ? raw.accounts : DEFAULT_ACCOUNTS
  } catch {
    return DEFAULT_ACCOUNTS
  }
}

const ACCOUNTS = loadAccounts()

/**
 * 计算 HMAC-SHA256 十六进制签名。
 *
 * @param payload 待签名内容（`<username>.<ts>.<exp>`）
 * @returns 十六进制摘要
 */
function hmacHex(payload) {
  return createHmac('sha256', SECRET).update(payload).digest('hex')
}

/**
 * 定长安全比较：长度不等直接返回 false，等长用 timingSafeEqual（防时序攻击）。
 *
 * @param a 字符串 a
 * @param b 字符串 b
 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** 登录校验：账号存在 + 密码匹配 */
export function verifyAccount(username, password) {
  const u = String(username ?? '').trim().toLowerCase()
  const hit = ACCOUNTS.find((a) => String(a.username).toLowerCase() === u)
  if (!hit) return { ok: false, reason: '账号不存在' }
  if (String(password) !== String(hit.password)) return { ok: false, reason: '密码不正确' }
  return { ok: true, account: hit }
}

/**
 * 签发 token：`<username>.<ts>.<exp>.<hmac>`。
 *
 * 前三段是明文载荷（供解析），第四段是前��段的 HMAC 签名；
 * 攻击者即使知道用户名也无法伪造出可验证的第四段。
 *
 * @param username 账号名
 * @param ttlMs 有效期（默认 8 小时）
 * @returns 签名后的 token
 */
export function sign(username, ttlMs = TOKEN_TTL_MS) {
  const ts = Date.now()
  const exp = ts + ttlMs
  const payload = `${username}.${ts}.${exp}`
  return `${payload}.${hmacHex(payload)}`
}

/** 登录成功：返回 token + 该账号绑定的用户与落地页（身份由账号决定） */
export function issueSession(account) {
  const user = findUserByRole(account.role)
  if (!user) return null
  /* 登录账号维度的个人资料覆盖：
     - avatarUrl：账号头像（空串无头像）
     - name：若在「编辑资料」里填过姓名则以之为准，否则回落到账号绑定用户的原姓名
     - phone / region：个人资料自带字段（未填为空串，便于前端如实展示「未填写」）
     这样登录响应与 GET /auth/me 都能一并带出，刷新后资料不丢。 */
  const profile = getProfile(account.username)
  const displayName = profile.name || user.name
  return {
    token: sign(account.username),
    user: {
      ...user,
      name: displayName,
      avatarText: displayName.slice(0, 1) || user.avatarText,
      avatarUrl: getAvatar(account.username),
      phone: profile.phone,
      region: profile.region,
    },
    role: account.role,
    home: ROLE_HOME[account.role] ?? '/rep/today',
    scope: ROLE_SCOPE[account.role] ?? [],
  }
}

/* ───────────────────────────── 头像（按登录账号维度） ───────────────────────────── */

/** 取某登录账号当前头像 URL（无则空串） */
export function avatarUrlOf(username) {
  return getAvatar(username)
}

/**
 * 按角色取对应登录账号的头像（供会话列表展示「对方」头像）。
 * 演示环境每个角色仅一个登录账号；若有多个，取第一个命中的账号。
 */
export function avatarUrlForRole(role) {
  const acc = ACCOUNTS.find((a) => String(a.role) === String(role))
  return acc ? getAvatar(acc.username) : ''
}

/**
 * 保存当前登录账号头像。
 *
 * @param username  登录账号名（大小写不敏感）
 * @param avatarUrl 头像 URL；空串表示清除
 * @returns 更新后的头像 URL；账号不存在返回 null（由调用方抛 404）
 */
export function saveAvatar(username, avatarUrl) {
  const u = String(username ?? '').trim().toLowerCase()
  const hit = ACCOUNTS.find((a) => String(a.username).toLowerCase() === u)
  if (!hit) return null
  setAvatar(hit.username, avatarUrl)
  return getAvatar(hit.username)
}

/**
 * 由 token 反查账号（T2：改为验签 + 查过期）。
 *
 * 保留原函数名与签名（index.js 多处在用），内部逻辑已从「正则取用户名即信任」
 * 改为「HMAC 验签通过 + 未过期 + 账号仍存在」三重校验。
 *
 * ⚠ 旧的 `demo-token-<username>-<ts>` 格式**不再被接受**（无签名即可冒充角色）。
 *
 * @param token 客户端带来的 token
 * @returns 账号对象；无效或过期返回 null
 */
export function accountFromToken(token) {
  const raw = String(token ?? '').trim()
  if (!raw) return null
  // 格式：username.ts.exp.sig（4 段）
  const parts = raw.split('.')
  if (parts.length !== 4) return null
  const [username, ts, exp, sig] = parts
  if (!username || !ts || !exp || !sig) return null
  // ① 验签（签名覆盖前三段，任何一段被改都会失配）
  const expected = hmacHex(`${username}.${ts}.${exp}`)
  if (!safeEqual(expected, sig)) return null
  // ② 查过期
  const expMs = Number(exp)
  if (!Number.isFinite(expMs) || Date.now() > expMs) return null
  // ③ 账号仍存在
  const hit = ACCOUNTS.find((a) => String(a.username).toLowerCase() === username.toLowerCase())
  return hit ?? null
}

/**
 * 从请求中提取 token。
 *
 * 优先 `Authorization: Bearer <token>`（标准做法）；
 * 兼容回退 `?token=` query —— SSE 的 EventSource 与图片 `<img src>` 无法自定义请求头，
 * 只能走 query（这是浏览器限制，不是鉴权绕过：token 本身仍需验签）。
 *
 * @param req Express 请求对象
 * @returns token 字符串；没带返回空串
 */
export function readToken(req) {
  const auth = String(req?.headers?.authorization ?? '')
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  if (m) return m[1].trim()
  return String(req?.query?.token ?? '')
}

/** 从请求中取账号（校验失败返回 null），供中间件与 SSE 端点复用 */
export function accountOf(req) {
  return accountFromToken(readToken(req))
}

/**
 * ★ 统一鉴权中间件（T1）：校验失败 401，成功则把账号挂到 `req.account`。
 *
 * 用现有 `fail` 信封返回（code/message/data），不自定义响应格式。
 *
 * @param req Express 请求对象
 * @param res Express 响应对象
 * @param next 下一个中间件
 */
export function requireAuth(req, res, next) {
  const account = accountOf(req)
  if (!account) {
    res.status(401).json({ code: 401, message: '登录已失效，请重新登录', data: null })
    return
  }
  req.account = account
  next()
}

/**
 * ★ 角色鉴权中间件（T1）：`req.account.role` 不在白名单里则 403。
 *
 * 必须挂在 `requireAuth` 之后（依赖 req.account）。
 *
 * @param roles 允许的角色数组
 * @returns Express 中间件
 */
export function requireRole(...roles) {
  const allow = roles.flat().map((r) => String(r))
  return function roleGuard(req, res, next) {
    const role = req.account?.role
    if (!role || !allow.includes(String(role))) {
      res.status(403).json({ code: 403, message: '当前角色无权执行该操作', data: null })
      return
    }
    next()
  }
}

/**
 * 演示账号清单（供登录页一键填入）。
 * ⚠ 密码随清单下发仅限校园演示环境 —— 真实系统绝不会回传密码。
 */
export function demoAccountList() {
  return ACCOUNTS.map((a) => {
    const user = findUserByRole(a.role)
    return {
      username: a.username,
      password: a.password,
      role: a.role,
      person: user?.name ?? '',
      roleLabel: { rep: '业代', manager: '区域经理', owner: '店员/店主', admin: '平台管理员' }[a.role] ?? a.role,
      scope: ROLE_SCOPE[a.role] ?? [],
      home: ROLE_HOME[a.role] ?? '/rep/today',
    }
  })
}

export { TOKEN_TTL_MS }
export default { verifyAccount, issueSession, accountFromToken, requireAuth, requireRole, avatarUrlForRole, saveAvatar }
