/**
 * 演示模式 store（功能10 · 一键演示）。
 *
 * 职责：管理「分镜演示」的开关、当前步骤与折叠态，供：
 *  - 入口开关（<DemoModeToggle>，桌面侧栏底部 / 移动顶栏 / 经理顶栏 / 管理端侧栏）；
 *  - 常驻分镜控制器浮层（<DemoMode>，App.vue 顶层挂载）读取与操作。
 *
 * 分镜步骤按「当前登录角色」提供，且都是**已存在的真实路由**（见 router/index.ts）。
 * 经理 / 管理员在移动形态下会被路由守卫分流到移动门户 /m，故这两类角色在移动形态
 * 使用一套移动可用的步骤，避免「点了下一步却跳不到」。
 *
 * 持久化：开启状态 + 当前步序 + 开启前的路由存 sessionStorage，刷新后自动恢复；
 * 退出时清除并把用户送回开启前的路由（由 <DemoMode> 执行回归导航）。
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useDeviceType } from '@/composables/useDeviceType'
import type { Role } from '@/types'

/** 会话级状态键：开启态 + 步序 + 回归路径 */
const STATE_KEY = 'dxc:demo-mode'
/** 首次进入说明卡已读标记（每会话一次即可） */
const INTRO_KEY = 'dxc:demo-mode-intro'

/** 一个分镜步骤：标题 + 说明文案 + 目标路由（可带 query） */
export interface DemoStep {
  title: string
  desc: string
  path: string
  query?: Record<string, string>
}

/* ═══════════════ 分镜脚本（按角色） ═══════════════ */

/** 业代（李强）：围绕「跑线 → 到店 → 标准执行 → 拍货架 → AI 诊断 → 记录」的闭环 */
const REP_STEPS: DemoStep[] = [
  {
    title: '今日巡店 · 拜访线路',
    desc: '按距离排好今天要跑的 5 家门店，今日完成进度、平均健康分与经理下派待办一屏看清。',
    path: '/rep/today',
  },
  {
    title: '到店签到 · 水印留证',
    desc: '进店先定位签到，拍下带时间与门店水印的到店凭证，证明真实到岗。',
    path: '/rep/checkin',
  },
  {
    title: '标准巡店八步骤',
    desc: '照着一线标准八步走：陈列、价签、堆头、库存……不漏项、不返工。',
    path: '/rep/steps',
  },
  {
    title: '巡店拍照 · AI 诊断入口',
    desc: '拍下货架 / 价签 / 冰柜照片，点「开始 AI 诊断」交给视觉大模型识别陈列问题。',
    path: '/rep/capture',
  },
  {
    title: 'AI 诊断结果',
    desc: '健康分、六大维度、问题清单与整改行动方案，AI 一眼看出陈列问题并给出动作。',
    path: '/rep/diagnosis/D_S3',
  },
  {
    title: '盘点与临期',
    desc: '录入库存、标记临期商品，缺货与临期预警在店里当场处理掉。',
    path: '/rep/inventory',
  },
  {
    title: '巡店记录 · 健康分趋势',
    desc: '历史巡店与健康分变化留档，改没改、进步多少都有记录。',
    path: '/rep/history',
  },
  {
    title: '终端执行知识库',
    desc: '陈列、价签、缺货处理的标准答案随问随查，新人也能照着做。',
    path: '/rep/knowledge',
  },
]

/** 店主（张大姐）：自助体检 → 补货 → 下单 → 报告 */
const OWNER_STEPS: DemoStep[] = [
  {
    title: '店主自助诊断',
    desc: '自己拍一张货架照，AI 告诉你问题出在哪、先做什么，不用等业务员上门。',
    path: '/owner',
  },
  {
    title: '智能补货模拟器',
    desc: '把「该补多少瓶」的算式摊开给你看，补得刚好，不压货也不断货。',
    path: '/owner/restock',
  },
  {
    title: '我的订单',
    desc: '诊断后确认订货单直接下单，业代接单、送达全程状态可查。',
    path: '/owner/orders',
  },
  {
    title: '经营报告',
    desc: 'AI 汇总本周门店健康分与整改情况，生成一页看得懂的经营报告。',
    path: '/owner/report',
  },
  {
    title: '店主知识库',
    desc: '陈列、补货、临期处理的标准做法，遇到问题随时查。',
    path: '/owner/knowledge',
  },
  {
    title: '消息中心',
    desc: '业代回访、订单状态与新公告都汇到消息中心，不错过任何一条。',
    path: '/messages',
  },
]

/** 区域经理（王敏）：看板 → 排行榜 → 价值 → 周报 → 问答 → 闭环沟通 */
const MANAGER_STEPS: DemoStep[] = [
  {
    title: '区域经营看板',
    desc: '全区门店健康分、风险 Top5 与 8 周趋势一屏掌握，风险门店可一键下派整改。',
    path: '/manager/dashboard',
  },
  {
    title: '业代排行榜',
    desc: '按健康分提升与整改完成率给业代排名，管理有抓手、激励有依据。',
    path: '/manager/leaderboard',
  },
  {
    title: 'AI 价值看板',
    desc: '把 AI 带来的到货率提升、整改时效与人工节省折算成可量化的经营价值。',
    path: '/manager/value',
  },
  {
    title: 'AI 周报',
    desc: 'AI 自动汇总本周区域经营表现，生成可直接下发的周报。',
    path: '/manager/report',
  },
  {
    title: 'AI 经营问答',
    desc: '用自然语言直接问经营问题，AI 基于真实数据作答，不用翻报表。',
    path: '/manager/ask',
  },
  {
    title: '经理端消息中心',
    desc: '整改下派与业代回执的闭环沟通都汇到这里，进度实时可见。',
    path: '/manager/messages',
  },
]

/** 管理员：总部运营控制台各模块 */
const ADMIN_STEPS: DemoStep[] = [
  {
    title: '运营总览',
    desc: '总部视角的运营总览，账号、知识、公告与审计一屏掌握全局。',
    path: '/admin',
  },
  {
    title: '账号派发',
    desc: '给业代、经理、店主派发账号，权限由后台统一管理。',
    path: '/admin/accounts',
  },
  {
    title: 'FAQ 知识库',
    desc: '维护终端常见问题与标准答案，供四端知识库统一取用。',
    path: '/admin/knowledge',
  },
  {
    title: '公告发布',
    desc: '发布全渠道公告，四端消息中心同步可见。',
    path: '/admin/announcements',
  },
  {
    title: '审计日志',
    desc: '关键操作留痕可追溯，平台侧合规有据可查。',
    path: '/admin/audit',
  },
]

/** 经理 / 管理员在移动形态下：路由守卫会把 /manager、/admin 分流到移动门户 /m */
const CONSOLE_STEPS: DemoStep[] = [
  {
    title: '移动工作台',
    desc: '手机 / 窄窗形态下，经理与管理员的看板、风险门店与 AI 问答都收进移动工作台。',
    path: '/m',
  },
  {
    title: '消息中心',
    desc: '下派与回执的闭环沟通在消息中心汇总，手机端随时处理。',
    path: '/messages',
  },
]

const STORY: Record<Role, DemoStep[]> = {
  rep: REP_STEPS,
  owner: OWNER_STEPS,
  manager: MANAGER_STEPS,
  admin: ADMIN_STEPS,
}

export const useDemoModeStore = defineStore('demo-mode', () => {
  const session = useSessionStore()
  const { isMobile } = useDeviceType()

  /** 演示模式是否开启 */
  const active = ref<boolean>(false)
  /** 当前步骤下标 */
  const index = ref<number>(0)
  /** 控制器是否折叠 */
  const collapsed = ref<boolean>(false)
  /** 首次进入说明卡是否展开 */
  const introOpen = ref<boolean>(false)
  /** 说明卡是否已看过（会话级） */
  const introSeen = ref<boolean>(false)
  /** 开启前的路由（退出时回归） */
  const returnPath = ref<string>('')
  /** 是否由「刷新恢复」进入（决定是否重新导航到当前步） */
  const restored = ref<boolean>(false)

  /** 当前角色对应的分镜脚本 */
  const steps = computed<DemoStep[]>(() => {
    const r = session.role
    if ((r === 'manager' || r === 'admin') && isMobile.value) return CONSOLE_STEPS
    return STORY[r] ?? REP_STEPS
  })

  /** 总步数 */
  const total = computed<number>(() => steps.value.length)

  /** 当前步骤（下标越界时收拢到最后一步） */
  const current = computed<DemoStep | undefined>(() => {
    const list = steps.value
    if (!list.length) return undefined
    const i = Math.min(Math.max(index.value, 0), list.length - 1)
    return list[i]
  })

  /* ── 持久化 ── */

  function readIntro(): boolean {
    try {
      return sessionStorage.getItem(INTRO_KEY) === '1'
    } catch {
      // 隐私模式无法读写 → 视为已看过，避免每次开演示都弹卡
      return true
    }
  }

  function persist(): void {
    try {
      if (active.value) {
        sessionStorage.setItem(
          STATE_KEY,
          JSON.stringify({ active: true, index: index.value, returnPath: returnPath.value }),
        )
      } else {
        sessionStorage.removeItem(STATE_KEY)
      }
    } catch {
      /* 隐私模式静默 */
    }
  }

  /** 刷新后恢复：会话里记录了「开启中」就自动回到演示态与当步 */
  function restore(): void {
    introSeen.value = readIntro()
    let raw = ''
    try {
      raw = sessionStorage.getItem(STATE_KEY) ?? ''
    } catch {
      raw = ''
    }
    if (!raw) return
    try {
      const saved = JSON.parse(raw) as { active?: boolean; index?: number; returnPath?: string }
      if (saved?.active) {
        active.value = true
        index.value = Number(saved.index) || 0
        returnPath.value = typeof saved.returnPath === 'string' ? saved.returnPath : ''
        restored.value = true
      }
    } catch {
      /* 损坏数据忽略 */
    }
  }

  /* ── 操作 ── */

  /** 开启演示：记录当前路由用于退出回归，重置到第一步 */
  function start(fromPath: string): void {
    if (active.value) return
    returnPath.value = fromPath
    index.value = 0
    collapsed.value = false
    active.value = true
    restored.value = false
    if (!introSeen.value) introOpen.value = true
    persist()
  }

  /** 退出演示：清状态（回归导航由浮层组件执行） */
  function stop(): void {
    if (!active.value) return
    active.value = false
    introOpen.value = false
    collapsed.value = false
    index.value = 0
    restored.value = false
    persist()
  }

  /** 切换开 / 关 */
  function toggle(fromPath: string): void {
    if (active.value) stop()
    else start(fromPath)
  }

  /** 下一步（到末步停住） */
  function next(): void {
    if (!active.value) return
    if (index.value >= total.value - 1) return
    index.value += 1
    persist()
  }

  /** 上一步（到首步停住） */
  function prev(): void {
    if (!active.value) return
    if (index.value <= 0) return
    index.value -= 1
    persist()
  }

  /** 跳到指定步 */
  function goTo(i: number): void {
    if (!active.value) return
    index.value = Math.min(Math.max(i, 0), total.value - 1)
    persist()
  }

  /** 折叠 / 展开控制器 */
  function toggleCollapse(): void {
    collapsed.value = !collapsed.value
  }

  /** 关闭首次说明卡并记为已读 */
  function dismissIntro(): void {
    introOpen.value = false
    introSeen.value = true
    try {
      sessionStorage.setItem(INTRO_KEY, '1')
    } catch {
      /* 静默 */
    }
  }

  // 形态 / 角色变化导致步骤集合变化时，收拢越界下标（避免 current 为空）
  watch(steps, (list) => {
    if (index.value > list.length - 1) index.value = Math.max(0, list.length - 1)
  })

  restore()

  return {
    active,
    index,
    collapsed,
    introOpen,
    introSeen,
    returnPath,
    restored,
    steps,
    total,
    current,
    start,
    stop,
    toggle,
    next,
    prev,
    goTo,
    toggleCollapse,
    dismissIntro,
  }
})
