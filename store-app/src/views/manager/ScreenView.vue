<script setup lang="ts">
/**
 * ScreenView（/manager/screen）—— 大屏投屏模式。
 *
 * 设计约束（硬要求）：全屏**固定深绿/近黑底**，不随日间主题切换而变化，
 * 因此本页的颜色为局部常量（不引用 --bg-card 等会随主题翻转的令牌）。
 *
 * 数据：`GET /dashboard/overview`（KPI / 门店健康分 / 红灯门店）+ `GET /performance/leaderboard`
 *        + `GET /visits?limit=`（实时巡店动态）。每 15 秒自动刷新，卸载时清定时器。
 * 退出：右上角按钮（回 /manager/dashboard）+ 全屏 API；键盘 Esc 退出。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { useToast } from '@/composables/useToast'
import { getDashboardOverview, getVisits } from '@/api'
import { getLeaderboard } from '@/api/insights'
import type { DashboardOverview, Kpi, Visit } from '@/types'
import type { LeaderboardRow } from '@/api/insights'

/** 后端看板实际返回比共享类型多 regionName（本页仅用于顶栏标题） */
type OverviewExt = DashboardOverview & { regionName?: string; regionStoreTotal?: number }

const router = useRouter()
const { error: toastError } = useToast()

const REFRESH_MS = 15_000
const ROTATE_MS = 5_000

const overview = ref<OverviewExt | null>(null)
const leaderboard = ref<LeaderboardRow[]>([])
const visits = ref<Visit[]>([])
const kpiIndex = ref<number>(0)

let refreshTimer: number | null = null
let rotateTimer: number | null = null

const kpis = computed<Kpi[]>(() => overview.value?.kpis ?? [])
const activeKpi = computed<Kpi | null>(() => kpis.value[kpiIndex.value] ?? null)

/** 门店健康分排行榜（按分数降序，取前 8） */
const topStores = computed(() =>
  [...(overview.value?.storeRows ?? [])].sort((a, b) => b.score - a.score).slice(0, 8),
)

/** 红灯门店列表 */
const redStores = computed(() => overview.value?.riskTop5 ?? [])

/** 前 5 业代（红榜，展示综合分） */
const topReps = computed(() => leaderboard.value.slice(0, 5))

async function load(): Promise<void> {
  try {
    const ov = await getDashboardOverview('R_EAST')
    overview.value = ov.overview
  } catch {
    /* 保留旧数据，避免投屏闪空 */
  }
  try {
    const lb = await getLeaderboard()
    leaderboard.value = lb.list ?? []
  } catch {
    /* 排行榜失败不影响主屏 */
  }
  try {
    const vs = await getVisits({ limit: 15 })
    visits.value = vs.visits ?? []
  } catch {
    /* 动态失败不影响主屏 */
  }
}

function exitScreen(): void {
  void router.push('/manager/dashboard')
}

function toggleFullscreen(): void {
  try {
    const doc = document as Document & { webkitFullscreenElement?: Element }
    if (!document.fullscreenElement && !doc.webkitFullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => {})
    } else {
      void document.exitFullscreen?.().catch(() => {})
    }
  } catch {
    /* 全屏失败静默 */
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') exitScreen()
}

/** 巡店动态格式：HH:mm */
function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--:--'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(() => {
  void load().catch(() => toastError('大屏数据加载失败，请检查后端服务'))
  refreshTimer = window.setInterval(() => void load(), REFRESH_MS)
  rotateTimer = window.setInterval(() => {
    if (kpis.value.length) kpiIndex.value = (kpiIndex.value + 1) % kpis.value.length
  }, ROTATE_MS)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  if (refreshTimer !== null) window.clearInterval(refreshTimer)
  if (rotateTimer !== null) window.clearInterval(rotateTimer)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="sc">
    <h1 class="u-sr-only">大屏投屏模式</h1>

    <!-- 顶栏 -->
    <header class="sc__head">
      <div class="sc__brand">
        <AppIcon name="milk" :size="24" color="#46e092" />
        <div>
          <p class="sc__title">{{ overview?.regionName ?? '区域' }}经营总览</p>
          <p class="sc__sub">店小C · 蒙牛 AI 巡店助手 · 大屏投屏</p>
        </div>
      </div>
      <div class="sc__head-actions">
        <button type="button" class="sc__btn" @click="toggleFullscreen">
          <AppIcon name="compare" :size="15" /> 全屏
        </button>
        <button type="button" class="sc__btn" @click="exitScreen">
          <AppIcon name="close" :size="15" /> 退出投屏
        </button>
      </div>
    </header>

    <!-- 主体三列 -->
    <div class="sc__grid">
      <!-- 左：KPI 轮播 + 门店健康分排行榜 -->
      <section class="sc__col">
        <div class="sc__panel sc__panel--kpi">
          <p class="sc__panel-cap">核心指标 · 轮播</p>
          <template v-if="activeKpi">
            <p class="sc__kpi-label">{{ activeKpi.label }}</p>
            <p class="sc__kpi-value" :class="{ 'is-danger': activeKpi.danger }">{{ activeKpi.value }}</p>
            <p class="sc__kpi-delta" :class="activeKpi.trend === 'down' ? 'is-down' : 'is-up'">
              {{ activeKpi.delta }}
            </p>
            <p v-if="activeKpi.target" class="sc__kpi-target">{{ activeKpi.target }}</p>
            <div class="sc__dots">
              <span v-for="(k, i) in kpis" :key="k.key" class="sc__dot" :class="{ 'is-on': i === kpiIndex }" />
            </div>
          </template>
          <p v-else class="sc__empty">指标数据加载中…</p>
        </div>

        <div class="sc__panel">
          <p class="sc__panel-cap">门店健康分 · 排行</p>
          <ul class="sc__rank">
            <li v-for="(s, i) in topStores" :key="s.storeId" class="sc__rank-item">
              <span class="sc__rank-no">{{ i + 1 }}</span>
              <span class="sc__rank-name">{{ s.storeName }}</span>
              <span class="sc__rank-score" :style="{ color: `var(--level-${s.level})` }">{{ s.score }}</span>
            </li>
            <li v-if="!topStores.length" class="sc__empty">暂无门店数据</li>
          </ul>
        </div>
      </section>

      <!-- 中：红灯门店 + 业代红榜 -->
      <section class="sc__col sc__col--mid">
        <div class="sc__panel sc__panel--risk">
          <p class="sc__panel-cap">风险门店 · 红灯优先</p>
          <ul class="sc__risk">
            <li v-for="r in redStores" :key="r.storeId" class="sc__risk-item">
              <span class="sc__risk-score">{{ r.score }}</span>
              <div class="sc__risk-main">
                <p class="sc__risk-name">{{ r.storeName }}</p>
                <p class="sc__risk-reason">{{ r.reason }}</p>
              </div>
            </li>
            <li v-if="!redStores.length" class="sc__empty">当前无红灯门店</li>
          </ul>
        </div>

        <div class="sc__panel">
          <p class="sc__panel-cap">业代红榜 · 综合分</p>
          <ul class="sc__rank">
            <li v-for="r in topReps" :key="r.repId" class="sc__rank-item">
              <span class="sc__rank-no">{{ r.rank }}</span>
              <span class="sc__rank-name">{{ r.name }}</span>
              <span class="sc__rank-score sc__rank-score--rep">{{ r.score }}</span>
            </li>
            <li v-if="!topReps.length" class="sc__empty">暂无业代数据</li>
          </ul>
        </div>
      </section>

      <!-- 右：实时巡店动态滚动 -->
      <section class="sc__col">
        <div class="sc__panel sc__panel--live">
          <p class="sc__panel-cap">实时巡店动态 · 自动滚动</p>
          <div class="sc__ticker">
            <ul class="sc__ticker-list">
              <li v-for="v in visits" :key="v.id" class="sc__ticker-item">
                <span class="sc__ticker-time">{{ fmtTime(v.visitedAt) }}</span>
                <span class="sc__ticker-store">{{ v.storeName }}</span>
                <span class="sc__ticker-score" :style="{ color: v.score >= 70 ? '#46e092' : '#ff8a5c' }">
                  {{ v.score }} 分
                </span>
              </li>
              <!-- 复制一份用于无缝循环 -->
              <li v-for="v in visits" :key="`dup-${v.id}`" class="sc__ticker-item">
                <span class="sc__ticker-time">{{ fmtTime(v.visitedAt) }}</span>
                <span class="sc__ticker-store">{{ v.storeName }}</span>
                <span class="sc__ticker-score" :style="{ color: v.score >= 70 ? '#46e092' : '#ff8a5c' }">
                  {{ v.score }} 分
                </span>
              </li>
              <li v-if="!visits.length" class="sc__empty">暂无巡店动态</li>
            </ul>
          </div>
        </div>
        <p class="sc__foot">数据每 15 秒自动刷新 · 口径与区域经营看板一致 · 按 Esc 退出投屏</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 固定深绿/近黑底：本页不引用会随主题翻转的令牌，保证投屏恒为暗色 */
.sc {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background:
    radial-gradient(120% 90% at 12% 0%, #123026 0%, #0a1712 42%, #060e0a 100%);
  color: #e8f5ec;
  overflow: hidden;
}

.sc__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 28px;
  border-bottom: 1px solid rgba(70, 224, 146, 0.16);
}

.sc__brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sc__title {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #eafff2;
}

.sc__sub {
  font-size: 12px;
  color: rgba(180, 214, 195, 0.66);
  letter-spacing: 2px;
}

.sc__head-actions {
  display: flex;
  gap: 10px;
}

.sc__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid rgba(70, 224, 146, 0.35);
  border-radius: 999px;
  background: rgba(70, 224, 146, 0.08);
  color: #b8f0d0;
  font-size: 13px;
  font-weight: 600;
}

.sc__btn:hover {
  background: rgba(70, 224, 146, 0.18);
}

.sc__grid {
  display: grid;
  grid-template-columns: 1fr 1.15fr 1fr;
  gap: 16px;
  flex: 1;
  min-height: 0;
  padding: 18px 24px 20px;
}

.sc__col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.sc__panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  padding: 16px 18px;
  border: 1px solid rgba(70, 224, 146, 0.16);
  border-radius: 18px;
  background: rgba(12, 30, 22, 0.7);
}

.sc__panel--kpi {
  align-items: center;
  justify-content: center;
  text-align: center;
  flex: 1.05;
}

.sc__panel-cap {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgba(150, 226, 186, 0.85);
  text-transform: uppercase;
}

.sc__panel--kpi .sc__panel-cap {
  align-self: flex-start;
}

.sc__kpi-label {
  margin-top: 10px;
  font-size: 20px;
  color: rgba(214, 238, 224, 0.9);
}

.sc__kpi-value {
  font-size: 96px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: #5ff0a3;
  text-shadow: 0 0 34px rgba(70, 224, 146, 0.35);
}

.sc__kpi-value.is-danger {
  color: #ff8a5c;
  text-shadow: 0 0 34px rgba(255, 138, 92, 0.35);
}

.sc__kpi-delta {
  margin-top: 8px;
  font-size: 20px;
  font-weight: 700;
}

.sc__kpi-delta.is-up { color: #5ff0a3; }
.sc__kpi-delta.is-down { color: #ff8a5c; }

.sc__kpi-target {
  margin-top: 6px;
  font-size: 13px;
  color: rgba(180, 214, 195, 0.7);
}

.sc__dots {
  display: flex;
  gap: 6px;
  margin-top: 20px;
}

.sc__dot {
  width: 20px;
  height: 4px;
  border-radius: 999px;
  background: rgba(70, 224, 146, 0.2);
}

.sc__dot.is-on {
  background: #46e092;
}

.sc__rank {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
  overflow: hidden;
}

.sc__rank-item {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(70, 224, 146, 0.06);
}

.sc__rank-no {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: rgba(70, 224, 146, 0.16);
  font-size: 13px;
  font-weight: 800;
  color: #b8f0d0;
}

.sc__rank-name {
  font-size: 16px;
  font-weight: 600;
  color: #e8f5ec;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc__rank-score {
  font-size: 24px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.sc__rank-score--rep {
  color: #5ff0a3;
}

.sc__risk {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  overflow: hidden;
}

.sc__risk-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 106, 82, 0.1);
  border-left: 3px solid #ff6a52;
}

.sc__risk-score {
  font-size: 34px;
  font-weight: 800;
  color: #ff8a5c;
  font-variant-numeric: tabular-nums;
}

.sc__risk-name {
  font-size: 17px;
  font-weight: 700;
  color: #ffd9cd;
}

.sc__risk-reason {
  margin-top: 2px;
  font-size: 12.5px;
  color: rgba(255, 200, 185, 0.75);
}

/* 实时动态滚动 */
.sc__panel--live {
  flex: 1;
}

.sc__ticker {
  position: relative;
  flex: 1;
  min-height: 0;
  margin-top: 10px;
  overflow: hidden;
}

.sc__ticker-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  animation: sc-roll 30s linear infinite;
}

@keyframes sc-roll {
  from { transform: translateY(0); }
  to { transform: translateY(-50%); }
}

.sc__ticker-item {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(70, 224, 146, 0.06);
}

.sc__ticker-time {
  font-size: 13px;
  color: rgba(150, 226, 186, 0.8);
  font-variant-numeric: tabular-nums;
}

.sc__ticker-store {
  font-size: 15px;
  color: #e8f5ec;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc__ticker-score {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.sc__foot {
  font-size: 12px;
  color: rgba(150, 226, 186, 0.6);
  text-align: center;
}

.sc__empty {
  padding: 14px;
  color: rgba(180, 214, 195, 0.6);
  font-size: 13px;
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .sc__ticker-list {
    animation: none;
  }
}
</style>
