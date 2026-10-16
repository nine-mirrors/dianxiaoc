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
import UserAvatar from '@/components/common/UserAvatar.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import HealthBadge from '@/components/common/HealthBadge.vue'
// 编辑资料弹层（姓名 / 电话 / 辖区）——模板末尾使用，必须显式 import，
// 否则 Vue 运行时只会报「Failed to resolve component」，弹层点开是空的
import ProfileEditDialog from '@/components/business/ProfileEditDialog.vue'
import { getTodayRoute, getVisits, getTasks } from '@/api'
import { uploadAvatarImage, updateProfile } from '@/api/profile'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'
import { useStoreFavorites } from '@/composables/useStoreFavorites'
import { theme, toggleTheme } from '@/composables/useTheme'
import { isRealtimeConnected } from '@/realtime/client'
import type { HealthLevelKey } from '@/types'
import type { FavoriteStore } from '@/api/store-favorites'

const router = useRouter()
const session = useSessionStore()
const toast = useToast()

/** 当前业代 id（后端账号决定；缺省回退 U_REP，与既有页面口径一致） */
const repId = computed<string>(() => session.user?.id || 'U_REP')

/* ═══════════════ 重点关注门店（收藏，按登录账号隔离） ═══════════════ */

const favorites = useStoreFavorites()
/** 我的收藏门店（后端已聚合门店名/健康分/辖区/备注/最近巡店时间等真实字段） */
const favItems = computed<FavoriteStore[]>(() => favorites.items.value)
/** 首屏加载态：仅「尚未成功加载过」时显示骨架，避免刷新时闪骨架 */
const favLoading = computed<boolean>(() => favorites.loading.value && !favorites.loaded.value)
const favCount = computed<number>(() => favItems.value.length)

/** 后端下发的是档位 key 字符串；无分时回落到 good 档（Badge 只做展示，不臆造分数） */
function levelKeyOf(level: string | null): HealthLevelKey {
  return (level ?? 'good') as HealthLevelKey
}

/** 点击门店 → 项目已有路由：业代端门店详情 / 诊断入口（拍照诊断页） */
function gotoStore(fav: FavoriteStore): void {
  router.push(`/rep/capture/${fav.storeId}`)
}

/** 编辑关注备注（≤ 60 字，PATCH /store-favorites/:storeId 落库） */
function editNote(fav: FavoriteStore): void {
  const input = window.prompt(`给「${fav.storeName}」写一句重点关注备注（≤ 60 字）`, fav.note || '')
  if (input === null) return
  void favorites.updateNote(fav.storeId, input)
}

/** 取消关注（二次确认沿用项目惯例 window.confirm） */
async function unfav(fav: FavoriteStore): Promise<void> {
  if (!window.confirm(`取消关注「${fav.storeName}」？`)) return
  await favorites.removeFavorite(fav)
}

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
  // 重点关注门店：进入「我的」时拉取我的收藏（后端按登录账号隔离）
  void favorites.load(true)
  online.value = isRealtimeConnected()
  pollTimer = window.setInterval(() => {
    online.value = isRealtimeConnected()
  }, 4000)
})
onUnmounted(() => {
  if (pollTimer !== null) window.clearInterval(pollTimer)
})

/**
 * 所属区域文案：优先「编辑资料」里手填的辖区文字；其次账号自带的职责副信息
 * （后端真实字段 sub，如「辖区 128 家 · 今日待巡 5 家」）；最后才回落到内部区域 id
 * —— 尽量不把 `R_EAST` 这种内部编号直接露给评委看。
 */
const regionText = computed<string>(
  () => session.user?.region || session.user?.sub || session.user?.regionId || '未分配区域',
)

/* ── 编辑资料弹层（姓名 / 电话 / 辖区） ── */
const showProfile = ref<boolean>(false)
function openProfile(): void {
  showProfile.value = true
}

/* ── 头像更换：选本地图片 → 校验 → 上传 → 绑定 → 全端同步 ── */

/** 隐藏的头像文件选择器 */
const avatarInput = ref<HTMLInputElement | null>(null)
/** 上传中（loading 态，防重复提交） */
const uploadingAvatar = ref<boolean>(false)
/** 大小上限 2MB */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024
/** 允许的图片类型（与后端上传白名单一致：jpg/jpeg/png/webp） */
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** 点击头像：唤起文件选择（同一文件可重复选择，见 onAvatarChange 里清空 value） */
function pickAvatar(): void {
  if (uploadingAvatar.value) return
  avatarInput.value?.click()
}

/** 把本地文件读成 base64 data URL（走后端统一上传通道） */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * 选图后的完整链路：
 *   类型 / 大小校验 → base64 → POST /api/v1/uploads 落盘拿 URL
 *   → PATCH /api/v1/auth/profile 绑定 → session.setAvatar（Pinia 响应式全端即时同步）。
 * 失败给明确提示，不静默。
 */
async function onAvatarChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  // ★ 立即清空 value：否则再次选择「同一个文件」不会触发 change 事件
  input.value = ''
  if (!file) return
  if (!AVATAR_TYPES.includes(file.type)) {
    toast.error('仅支持 JPG / PNG / WebP 格式的图片')
    return
  }
  if (file.size > AVATAR_MAX_BYTES) {
    toast.error('图片超过 2MB，请换一张更小的')
    return
  }
  if (uploadingAvatar.value) return
  uploadingAvatar.value = true
  try {
    const dataUrl = await readAsDataUrl(file)
    const { url } = await uploadAvatarImage(dataUrl, file.name || 'avatar.jpg')
    const updated = await updateProfile(url)
    // 立即更新全局会话：所有头像展示位无需刷新即同步
    session.setAvatar(updated?.avatarUrl || url)
    toast.success('头像已更新')
  } catch {
    toast.error('头像上传没成功，请稍后重试')
  } finally {
    uploadingAvatar.value = false
  }
}

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
      <!-- 头像＝更换入口：点击唤起本地选图（键盘可达，role=button） -->
      <button
        type="button"
        class="me-card__avatar mot-tap"
        role="button"
        aria-label="更换头像"
        :aria-busy="uploadingAvatar"
        :disabled="uploadingAvatar"
        @click="pickAvatar"
      >
        <UserAvatar
          :url="session.avatarUrl"
          :name="session.user?.name"
          :text="session.avatarText"
          :size="54"
          variant="glass"
        />
        <span v-if="uploadingAvatar" class="me-card__avatar-loading" aria-hidden="true">
          <AppIcon name="refresh" :size="20" color="#fff" />
        </span>
      </button>
      <input ref="avatarInput" class="me-card__file" type="file" accept="image/*" @change="onAvatarChange" />
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

    <!-- 重点关注门店（收藏，按账号隔离）：首屏骨架 → 空态 → 列表级联入场 -->
    <div class="me-group me-favs">
      <div class="me-favs__head">
        <span class="me-favs__icon"><AppIcon name="star-filled" :size="16" color="var(--gold)" /></span>
        <span class="me-favs__title">重点关注门店</span>
        <span v-if="favCount" class="me-favs__count">{{ favCount }}</span>
      </div>

      <div v-if="favLoading" class="me-favs__skeleton">
        <SkeletonBlock v-for="i in 2" :key="i" height="64px" radius="12px" />
      </div>

      <EmptyState
        v-else-if="!favCount"
        icon="star"
        title="还没有重点关注的门店"
        desc="在门店卡上点一下星标，就能把重点门店收进这里随时盯"
        action-text="去看看今日门店"
        @action="router.push('/rep/today')"
      />

      <div v-else class="me-favs__list mot-stagger">
        <div v-for="f in favItems" :key="f.storeId" class="me-fav">
          <button
            type="button"
            class="me-fav__main mot-tap"
            :aria-label="`查看门店详情：${f.storeName}`"
            @click="gotoStore(f)"
          >
            <p class="me-fav__name u-ellipsis">{{ f.storeName }}</p>
            <p class="me-fav__meta">
              <span class="me-fav__score">{{ f.healthScore ?? '—' }}分</span>
              <HealthBadge v-if="f.level" :level="levelKeyOf(f.level)" />
              <span class="me-fav__region">
                <AppIcon name="map-pin" :size="11" color="var(--text-3)" />{{ f.regionName }}
              </span>
            </p>
            <p class="me-fav__note" :class="{ 'is-empty': !f.note }">
              {{ f.note || '点「备注」补充关注原因' }}
            </p>
            <p class="me-fav__visit">最近巡店：{{ f.lastVisitAt || '暂无记录' }}</p>
          </button>
          <div class="me-fav__ops">
            <button type="button" class="me-fav__op mot-tap" @click="editNote(f)">备注</button>
            <button
              type="button"
              class="me-fav__op me-fav__op--off mot-tap"
              :aria-label="`取消关注门店：${f.storeName}`"
              @click="unfav(f)"
            >
              取消关注
            </button>
          </div>
        </div>
      </div>
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
      <button type="button" class="me-row mot-tap" @click="openProfile">
        <span class="me-row__icon"><AppIcon name="user" :size="18" color="var(--mn-green)" /></span>
        <span class="me-row__text">
          <span class="me-row__label">编辑资料</span>
          <span class="me-row__desc">姓名 · 电话 · 辖区</span>
        </span>
        <AppIcon name="chevron-right" :size="16" color="var(--text-3)" />
      </button>

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

    <!-- 编辑资料弹层（姓名 / 电话 / 辖区） -->
    <ProfileEditDialog :visible="showProfile" @close="showProfile = false" />
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

/* 头像＝更换入口按钮（视觉由 UserAvatar 统一负责，这里只管热区与 loading 遮罩） */
.me-card__avatar {
  flex: none;
  position: relative;
  width: 54px;
  height: 54px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}

.me-card__avatar:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

.me-card__avatar:disabled {
  cursor: default;
}

.me-card__avatar-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
}

.me-card__avatar-loading :deep(svg) {
  animation: me-avatar-spin 0.9s linear infinite;
}

@keyframes me-avatar-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 隐藏的文件选择器：不参与布局 */
.me-card__file {
  display: none;
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

/* ── 重点关注门店 ── */
.me-favs__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 10px;
}

.me-favs__icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--gold) 20%, transparent);
}

.me-favs__title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.me-favs__count {
  flex: none;
  min-width: 20px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--bg-page);
  color: var(--text-3);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.me-favs__skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 14px 12px;
}

.me-favs__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 12px 12px;
}

.me-fav {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 12px;
  background: var(--bg-page);
}

.me-fav__main {
  display: block;
  width: 100%;
  padding: 10px 12px 8px;
  border: none;
  background: transparent;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
}

.me-fav__name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.me-fav__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--text-2);
}

.me-fav__score {
  font-weight: 700;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.me-fav__region {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--text-3);
}

.me-fav__note {
  margin-top: 5px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-2);
}

.me-fav__note.is-empty {
  color: var(--text-3);
}

.me-fav__visit {
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.me-fav__ops {
  display: flex;
  gap: 8px;
  padding: 0 12px 10px;
}

.me-fav__op {
  flex: 1;
  min-height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
}

.me-fav__op--off {
  color: var(--danger-fg);
  border-color: var(--danger-fg);
}

.me-fav__main:focus-visible,
.me-fav__op:focus-visible {
  outline: 2px solid var(--mn-green);
  outline-offset: 2px;
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
