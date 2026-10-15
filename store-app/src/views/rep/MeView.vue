<script setup lang="ts">
/**
 * 业代端 · 我的（Tab4）。
 *
 * 头像 / 姓名 / 角色 / 所属区域 + 真实数据卡（今日完成 / 累计巡店 / 待办）
 * + 功能列表 + 设置（日/夜主题、实时推送连接状态）+ 退出登录 + 版权行。
 * 数据全部走 @/api（getTodayRoute / getVisits / getTasks），失败静默降级不白屏。
 */
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import { getTodayRoute, getVisits, getTasks } from '@/api'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'
import { theme, toggleTheme } from '@/composables/useTheme'
import { isRealtimeConnected } from '@/realtime/client'

const router = useRouter()
const session = useSessionStore()
const toast = useToast()

/** 当前业代 id（后端账号决定；缺省回退 U_REP，与既有页面口径一致） */
const repId = computed<string>(() => session.user?.id || 'U_REP')

const todayDone = ref<number>(0)
const todayTotal = ref<number>(0)
const totalVisits = ref<number>(0)
const openTasks = ref<number>(0)
const loading = ref<boolean>(true)

/** 实时推送连接状态（非响应式探测，定时刷新） */
const online = ref<boolean>(false)
let pollTimer: number | null = null

/* ── 连续巡店打卡（真实依据：getTodayRoute 的 summary.done；仅本地存储，不碰后端） ── */
const VISIT_DAYS_KEY = 'dxc:visit-days'
const VISIT_DAYS_LIMIT = 60
const visitStreak = ref<number>(0)

/** 本地时区 YYYY-MM-DD（不用 toISOString：东八区深夜会被 UTC 偏移写成前一天） */
function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 读打卡数组：脏数据 / 解析失败一律当空数组，绝不让坏 localStorage 白屏 */
function readVisitDays(): string[] {
  try {
    const raw = window.localStorage.getItem(VISIT_DAYS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))
  } catch {
    return []
  }
}

/**
 * 到今天为止连续有巡店记录的天数：
 * 今天有记录则从今天往回数；今天还没记录也允许从昨天往回数历史连续（今天完成后会自动续上）。
 */
function streakFrom(days: Set<string>): number {
  const cursor = new Date()
  if (!days.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let n = 0
  while (days.has(localDateKey(cursor))) {
    n += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return n
}

/**
 * 同步打卡并刷新连续天数。markToday 只在今日 summary.done>0 时为 true；
 * 接口失败 / done=0 不写今天。数组去重后只保留最近 60 天（YYYY-MM-DD 字典序即时间序）。
 * 任何异常静默降级，卡片最多停在 X=0，不弹错。
 */
function syncVisitStreak(markToday: boolean): void {
  try {
    const days = new Set(readVisitDays())
    if (markToday) days.add(localDateKey(new Date()))
    const recent = Array.from(days).sort().reverse().slice(0, VISIT_DAYS_LIMIT)
    window.localStorage.setItem(VISIT_DAYS_KEY, JSON.stringify(recent))
    visitStreak.value = streakFrom(new Set(recent))
  } catch {
    /* localStorage 不可用等：保持当前值（初始 0） */
  }
}

/** 连续天数对应的鼓励副文案（不夸收益，只给情绪价值） */
const streakCheer = computed<string>(() => {
  const x = visitStreak.value
  if (x <= 0) return '今天还没开始，跑第一家就点亮'
  if (x === 1) return '第一天，开个好头'
  if (x < 7) return '继续保持，已经成习惯了'
  return '一周全勤，片区有你真稳'
})

async function loadStats(): Promise<void> {
  loading.value = true
  try {
    const res = await getTodayRoute(repId.value)
    todayDone.value = res.summary?.done ?? 0
    todayTotal.value = res.summary?.total ?? 0
    // 今日确有完成的巡店才打卡；失败走 catch，不会误写今天
    syncVisitStreak(todayDone.value > 0)
  } catch {
    /* 静默降级：单项失败不影响其余卡片；连续天数仍可展示本地历史，无历史则为 0 */
  }
  try {
    const res = await getVisits({ limit: 300 })
    totalVisits.value = res.visits?.length ?? 0
  } catch {
    /* ignore */
  }
  try {
    const res = await getTasks(repId.value)
    openTasks.value = (res.tasks ?? []).filter((t) => t.status === 'open').length
  } catch {
    /* ignore */
  }
  loading.value = false
}

onMounted(() => {
  // 先用本地打卡记录渲染连续天数（接口未返回 / 失败时也有真实历史可看，无记录即 0）
  syncVisitStreak(false)
  void loadStats()
  online.value = isRealtimeConnected()
  pollTimer = window.setInterval(() => {
    online.value = isRealtimeConnected()
  }, 4000)
})
onUnmounted(() => {
  if (pollTimer !== null) window.clearInterval(pollTimer)
})

/** 所属区域（后端 user 对象仅带 regionId；无则如实标注） */
const regionText = computed<string>(() => session.user?.regionId || '未分配区域')

interface MenuItem {
  icon: string
  label: string
  desc: string
  to: string
}

const menus: MenuItem[] = [
  { icon: 'sliders', label: '智能排线', desc: '按距离优化今日门店拜访顺序', to: '/rep/route' },
  { icon: 'sparkles', label: '知识库', desc: '陈列标准与终端执行问答', to: '/rep/knowledge' },
  { icon: 'message', label: '消息中心', desc: '经理下派与门店消息通知', to: '/messages' },
  { icon: 'history', label: '巡店记录', desc: '历史巡店与诊断留证', to: '/rep/history' },
  { icon: 'home', label: '今日巡店', desc: '今日线路与待办任务', to: '/rep/today' },
]

function go(to: string): void {
  router.push(to)
}

/** 日 / 夜主题切换（从点击坐标扩散涟漪，由 useTheme 内部按能力降级） */
function onToggleTheme(e: MouseEvent): void {
  toggleTheme({ x: e.clientX, y: e.clientY })
}

/** 退出登录：二次确认后清会话并回登录页 */
function doLogout(): void {
  if (!window.confirm('退出后需重新登录，确认退出当前账号？')) return
  session.logout()
  toast.info('已退出登录')
  router.push('/login')
}
</script>

<template>
  <MobileLayout title="我的" :show-tab-bar="true" :content-padding-bottom="72">
    <!-- 个人名片 -->
    <div class="me-card u-animate-in">
      <div class="me-card__avatar">{{ session.avatarText }}</div>
      <div class="me-card__info">
        <p class="me-card__name">{{ session.user?.name ?? '未登录' }}</p>
        <p class="me-card__meta">
          <span class="me-card__role">{{ session.roleLabel }}</span>
          <span class="me-card__region">
            <AppIcon name="map-pin" :size="12" color="var(--text-3)" />
            {{ regionText }}
          </span>
        </p>
      </div>
    </div>

    <!-- 连续巡店：天数来自本地真实打卡记录（仅今日 summary.done>0 才记入今天） -->
    <div class="me-streak u-animate-in">
      <span class="me-streak__icon">
        <AppIcon name="zap" :size="18" :color="todayDone > 0 ? 'var(--mn-green-dark)' : 'var(--text-4)'" />
      </span>
      <span class="me-streak__text">
        <span class="me-streak__title">连续巡店 <b>{{ visitStreak }}</b> 天</span>
        <span class="me-streak__sub">{{ streakCheer }}</span>
      </span>
    </div>

    <!-- 数据卡：今日完成 / 累计巡店 / 待办 -->
    <div class="me-stats">
      <template v-if="loading">
        <SkeletonBlock v-for="i in 3" :key="i" height="64px" radius="12px" width="100%" />
      </template>
      <template v-else>
        <div class="me-stat">
          <p class="me-stat__num">{{ todayDone }}<em>/{{ todayTotal }}</em></p>
          <p class="me-stat__cap">今日巡店完成</p>
        </div>
        <div class="me-stat">
          <p class="me-stat__num">{{ totalVisits }}</p>
          <p class="me-stat__cap">累计巡店</p>
        </div>
        <div class="me-stat" :class="{ 'me-stat--alert': openTasks > 0 }">
          <p class="me-stat__num">{{ openTasks }}</p>
          <p class="me-stat__cap">待办任务</p>
        </div>
      </template>
    </div>

    <!-- 功能列表 -->
    <div class="me-group">
      <button
        v-for="m in menus"
        :key="m.to"
        type="button"
        class="me-row mot-tap"
        @click="go(m.to)"
      >
        <span class="me-row__icon"><AppIcon :name="m.icon" :size="18" color="var(--mn-green)" /></span>
        <span class="me-row__text">
          <span class="me-row__label">{{ m.label }}</span>
          <span class="me-row__desc">{{ m.desc }}</span>
        </span>
        <AppIcon name="chevron-right" :size="16" color="var(--text-3)" />
      </button>
    </div>

    <!-- 设置 -->
    <div class="me-group">
      <button type="button" class="me-row mot-tap" @click="onToggleTheme">
        <span class="me-row__icon"><AppIcon name="refresh" :size="18" color="var(--mn-green)" /></span>
        <span class="me-row__text">
          <span class="me-row__label">夜间模式</span>
          <span class="me-row__desc">{{ theme === 'dark' ? '当前：夜间，点击切回日间' : '当前：日间，点击切换夜间' }}</span>
        </span>
        <span class="me-switch" :class="{ 'me-switch--on': theme === 'dark' }">
          <span class="me-switch__dot" />
        </span>
      </button>

      <div class="me-row me-row--static">
        <span class="me-row__icon"><AppIcon name="zap" :size="18" color="var(--mn-green)" /></span>
        <span class="me-row__text">
          <span class="me-row__label">实时推送</span>
          <span class="me-row__desc">经理下派任务秒级到岗</span>
        </span>
        <span class="me-status" :class="online ? 'is-on' : 'is-off'">
          <i class="me-status__dot" />
          {{ online ? '已连接' : '未连接' }}
        </span>
      </div>
    </div>

    <!-- 退出登录 -->
    <div class="me-group">
      <button type="button" class="me-row me-row--danger mot-tap" @click="doLogout">
        <span class="me-row__icon"><AppIcon name="close" :size="18" color="var(--danger-fg)" /></span>
        <span class="me-row__text">
          <span class="me-row__label">退出登录</span>
        </span>
      </button>
    </div>

    <!-- 版权行 -->
    <p class="me-foot">版本 1.0.0 · 蒙牛 × 店小C</p>
    <p class="me-foot me-foot--sub">© 2026 蒙牛乳业 · AI 巡店助手演示版</p>
  </MobileLayout>
</template>

<style scoped>
/* 个人名片 */
.me-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 12px 0;
  padding: 16px 14px;
  border-radius: var(--radius-card);
  background: var(--grad-brand);
  color: #fff;
  box-shadow: var(--sh-brand);
}

.me-card__avatar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.65);
  font-size: 22px;
  font-weight: 700;
}

.me-card__info {
  flex: 1;
  min-width: 0;
}

.me-card__name {
  font-size: 18px;
  font-weight: 700;
}

.me-card__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.me-card__role {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  font-size: 11px;
  font-weight: 600;
}

.me-card__region {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11.5px;
  opacity: 0.9;
}

/* 连续巡店打卡卡（u-card 风格：与本页其他卡片同一套令牌） */
.me-streak {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 12px 0;
  padding: 12px 14px;
  border-radius: var(--radius-card);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
}

.me-streak__icon {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--mn-green-light);
}

.me-streak__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.me-streak__title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.me-streak__title b {
  font-size: 17px;
  color: var(--mn-green-dark);
  font-variant-numeric: tabular-nums;
}

.me-streak__sub {
  font-size: 11.5px;
  color: var(--text-3);
}

/* 数据卡 */
.me-stats {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin: 12px 12px 0;
}

.me-stat {
  padding: 12px 4px;
  border-radius: var(--radius-card);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  text-align: center;
}

.me-stat--alert {
  background: var(--warning-bg);
}

.me-stat__num {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-1);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.me-stat__num em {
  font-style: normal;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
}

.me-stat--alert .me-stat__num {
  color: var(--warning-fg);
}

.me-stat__cap {
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-3);
}

/* 分组列表 */
.me-group {
  margin: 12px 12px 0;
  border-radius: var(--radius-card);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.me-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 54px;
  padding: 10px 14px;
  border: none;
  border-bottom: 1px solid var(--border-color);
  background: transparent;
  color: inherit;
  text-align: left;
  font-family: inherit;
}

.me-group .me-row:last-child {
  border-bottom: none;
}

.me-row--static {
  cursor: default;
}

.me-row__icon {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--mn-green-light);
}

.me-row__text {
  flex: 1;
  min-width: 0;
}

.me-row__label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
}

.me-row__desc {
  display: block;
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--text-3);
}

.me-row--danger .me-row__label {
  color: var(--danger-fg);
}

.me-row--danger .me-row__icon {
  background: var(--danger-bg);
}

/* 主题开关 */
.me-switch {
  flex: none;
  position: relative;
  width: 40px;
  height: 24px;
  border-radius: 999px;
  background: var(--border-strong);
  transition: background-color var(--dur-fast) var(--ease-standard);
}

.me-switch--on {
  background: var(--mn-green);
}

.me-switch__dot {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--bg-card);
  box-shadow: var(--sh-1);
  transition: transform var(--dur-fast) var(--ease-standard);
}

.me-switch--on .me-switch__dot {
  transform: translateX(16px);
}

/* 连接状态 */
.me-status {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
}

.me-status__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-4);
}

.me-status.is-on {
  color: var(--mn-green-dark);
}

.me-status.is-on .me-status__dot {
  background: var(--mn-green);
}

.me-status.is-off {
  color: var(--text-3);
}

/* 版权行 */
.me-foot {
  margin: 20px 0 0;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-3);
}

.me-foot--sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-4);
}
</style>
