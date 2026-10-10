/**
 * _smoke 公共鉴权助手（T2 整改配套）。
 *
 * 背景：token 改为 HMAC 签名后，脚本里硬编码的 `demo-token-<user>-xxx` 全部失效（401）。
 * 本助手通过**真实登录接口**换取可用 token，脚本再把它注入 localStorage，
 * 走的是和生产完全一致的鉴权路径（而不是绕过）。
 *
 * 用法：
 *   import { loginToken, API_BASE } from './_auth-helper.mjs'
 *   const token = await loginToken('liqiang')
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** 后端地址：可用 SMOKE_API 覆盖，默认与 store-app/.env 的 3000 一致 */
export const API_BASE = process.env.SMOKE_API || 'http://127.0.0.1:3000'

/** 三个演示账号（后端 data/accounts.json 的默认值） */
export const ACCOUNTS = {
  liqiang: { password: '123456', role: 'rep' },
  wangmin: { password: '123456', role: 'manager' },
  zhangdajie: { password: '123456', role: 'owner' },
}

/**
 * 真实登录换取 token。
 *
 * @param {keyof typeof ACCOUNTS} [username] 账号名
 * @param {string} [apiBase] 后端地址（默认 API_BASE）
 * @returns {Promise<string>} 可用的签名 token
 * @throws 登录失败时抛错（附后端返回的 message）
 */
export async function loginToken(username = 'liqiang', apiBase = API_BASE) {
  const acc = ACCOUNTS[username]
  if (!acc) throw new Error(`未知演示账号：${username}`)
  const res = await fetch(`${apiBase}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: acc.password }),
  })
  const json = await res.json().catch(() => null)
  const token = json?.data?.token
  if (!token) {
    throw new Error(`登录失败（${username}）：${json?.message ?? `HTTP ${res.status}`}`)
  }
  return token
}

/**
 * 生成注入 localStorage 的脚本片段（把真实 token 写进会话）。
 *
 * 刻意用函数拼串而不是模板里直接内插，避免 token 里的字符被当成 JS 字面量。
 *
 * @param {string} token 有效 token
 * @returns {string} 可在 CDP Runtime.evaluate 里执行的表达式
 */
export function sessionSeedScript(token) {
  return (
    `try { localStorage.setItem('store-app:session', ` +
    `JSON.stringify({ token: ${JSON.stringify(token)} })) } catch (e) {}`
  )
}

/**
 * 一步到位：登录 + 生成注入片段。
 *
 * @param {keyof typeof ACCOUNTS} [username]
 * @returns {Promise<string>} 注入表达式
 */
export async function sessionSeed(username = 'liqiang') {
  return sessionSeedScript(await loginToken(username))
}
