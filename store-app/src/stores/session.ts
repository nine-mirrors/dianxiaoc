/**
 * 会话 store（账号密码登录 · 身份由后端账号决定）。
 *
 * ★ 2026-10-09 改造（对应需求「不允许再有 mock、只留账号密码、凭证由后端给」）：
 *  - 移除「按角色登录 / 手机号验证码 / 跳过登录」三条旁路，**唯一入口是账号密码登录**；
 *  - 凭证与角色绑定全在后端：前端只提交账号密码，角色与落地页由服务端下发；
 *  - 会话 token 落 localStorage，刷新时用 `GET /api/v1/auth/me` 向后端恢复身份，
 *    后端不认这个 token 就强制回登录页（前端不自行推断角色）。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Role, User } from '@/types'
import { getRoles, loginWithAccount as apiLoginWithAccount, authMe } from '@/api'
import { ApiError } from '@/api/error'
import { connectRealtime, disconnectRealtime } from '@/realtime/client'
import type { AuthSession } from '@/api'

const SESSION_KEY = 'store-app:session'

/**
 * 会话代数（epoch）。
 *
 * ★ 每次「手动登录 / 主动登出」+1。启动时的 `restore()` 是异步的（要请求
 * /auth/me），若它的响应迟到——例如后端重启后旧 token 被判 401——绝不能让
 * 「上一代会话」的恢复结果冲掉刚刚登录成功的新会话，否则会出现：
 * 登录接口 200、Toast 已提示欢迎回来，随后迟到的 401 执行 logout()，
 * 路由守卫立刻把人弹回登录页（实测复现：token 100 字符 → 被清空为 0）。
 * restore 在落任何结果前先比对代数与当前 token，发现已换代即放弃结果。
 */
let sessionEpoch = 0

export const useSessionStore = defineStore('session', () => {
  /** 当前用户（后端返回，未登录时为 null） */
  const user = ref<User | null>(null)
  /** 会话 token（后端签发） */
  const token = ref<string>('')
  /** 是否已登录 */
  const logged = ref<boolean>(false)
  /** 服务端裁定的落地页 */
  const home = ref<string>('')
  /** 登录失败 / 后端不可用的提示 */
  const authError = ref<string>('')
  /** 后端未连接（断网时保留登录态，只提示） */
  const offlineNotice = ref<boolean>(false)

  /** 当前角色（由后端下发，前端不自选） */
  const role = computed<Role>(() => user.value?.role ?? 'rep')
  /** 头像首字 */
  const avatarText = computed<string>(() => user.value?.avatarText ?? '—')
  /** 角色中文名 */
  const roleLabel = computed<string>(() => {
    const map: Record<Role, string> = { rep: '业代', manager: '区域经理', owner: '店员/店主', admin: '平台管理员' }
    return map[role.value] ?? '业代'
  })
  /** 当前身份应去的页面（登录后由服务端裁定） */
  const homePath = computed<string>(() => home.value || '/rep/today')

  function applySession(s: AuthSession): void {
    offlineNotice.value = false
    token.value = s.token
    user.value = s.user
    home.value = s.home
    logged.value = true
    authError.value = ''
    persist()
    connectRealtime(s.user.role, s.user.name)
  }

  function persist(): void {
    try {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ token: token.value, user: user.value }),
      )
    } catch {
      /* 隐私模式下 localStorage 不可用时静默忽略 */
    }
  }

  /**
   * 账号密码登录。角色与落地页由后端决定，前端不做任何角色选择。
   *
   * @param username 账号
   * @param password 密码
   * @returns 成功返回会话，失败抛错（调用方提示）
   */
  async function login(username: string, password: string): Promise<AuthSession> {
    const s = await apiLoginWithAccount(username, password)
    // ★ 登录成功即换代：任何仍在飞行中的旧 restore() 结果就此作废
    sessionEpoch += 1
    applySession(s)
    return s
  }

  /**
   * 刷新页面后恢复身份：用本地 token 向后端换取会话。
   * 后端不认（重启/过期/被清）→ 静默回到未登录态，由路由守卫送去登录页。
   */
  async function restore(): Promise<void> {
    // 本次恢复所属的会话代数（await 期间若已登录/登出，结果必须作废）
    const epoch = sessionEpoch
    let savedToken = ''
    let cachedUser: User | null = null
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        savedToken = parsed?.token ?? ''
        cachedUser = parsed?.user ?? null
      }
    } catch {
      savedToken = ''
    }
    if (!savedToken) return
    /**
     * 先把本地 token 与「上次身份」恢复出来，再向���端验证。
     * ★ 为什么要在验证前恢复：断网时验证必然失败，若只清 token 不恢复身份，
     *   页面里session.user 为 null → 模板读 .name 直接抛错 → **整页白屏**
     *   （实测踩过：TypeError reading 'name'）。断网时应显示"数据暂不可用"，
     *   而不是崩溃。
     */
    token.value = savedToken
    if (cachedUser) user.value = cachedUser
    try {
      const s = await authMe(savedToken)
      // ★ 等待校验期间用户已手动登录（代数+1、token 已换成新的）→ 旧结果作废，
      //   绝不能 applySession(旧身份) 把新会话覆盖回去
      if (sessionEpoch !== epoch || token.value !== savedToken) return
      applySession(s)
    } catch (e) {
      // 同上：迟到的错误（含 401）属于上一代会话，直接丢弃
      if (sessionEpoch !== epoch || token.value !== savedToken) return
      /**
       * ★ 断网 ≠ 登录失效（实测踩过：后端不可达时一律 logout()，
       *   守卫把用户踢回登录页，现场断网 = 直接演示中断）。
       *   仅当后端明确答复「token 无效」（401）才清登录态；
       *   网络故障（code = -1）保留 token，等恢复后自然重试。
       */
      /**
       * ⚠ 用鸭子类型取 code，不要用 instanceof：
       *   client.ts 与本模块可能持有 ApiError 的不同副本/不同加载路径，
       *   instanceof 会失效（实测踩过：断网时走进不了 401 分支以外的处理）。
       */
      const code = typeof e === 'object' && e !== null && 'code' in e
        ? Number((e as { code?: unknown }).code)
        : undefined
      if (code === 401) {
        logout()
      } else {
        // 保留本地 token 与身份，仅标记「后端未连接」并广播事件（界面据此显示提示条）
        offlineNotice.value = true
        window.dispatchEvent(new CustomEvent('api:offline'))
      }
    }
  }

  /** 登出：清 token、断实时推送、回到登录页 */
  function logout(): void {
    // 主动登出即换代：仍在飞行中的 restore() 不得再把旧身份写回
    sessionEpoch += 1
    disconnectRealtime()
    token.value = ''
    user.value = null
    home.value = ''
    logged.value = false
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
  }

  /** 角色清单（保留旧接口，登录页已不再用于自选角色） */
  async function fetchRoles() {
    try {
      const res = await getRoles()
      return res.roles
    } catch {
      return []
    }
  }

  /**
   * 首屏恢复会话的 Promise。
   *
   * ★ 路由守卫必须 await 它 —— 否则刷新或深链进来时，守卫会在恢复完成前
   *   判定「未登录」把人弹到登录页；而登录页的「已登录则跳工作台」判断
   *   已经跑完，导致会话恢复成功后用户仍卡在登录页（真实用户必然踩到）。
   */
  const ready: Promise<void> = restore()

  /** 等待会话恢复完成（路由守卫调用） */
  function ensureRestored(): Promise<void> {
    return ready
  }

  return {
    user,
    role,
    roleLabel,
    avatarText,
    logged,
    token,
    home: homePath,
    authError,
    offlineNotice,
    login,
    logout,
    restore,
    ensureRestored,
    fetchRoles,
  }
})
