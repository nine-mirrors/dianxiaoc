<script setup lang="ts">
/**
 * 业代端 · 智能排线（/rep/route）。
 *
 * 今日门店线路：Leaflet 地图（按健康分着色）+ 门店卡列表 + 上下箭头手动重排 + 完成进度。
 * 数据来自 getTodayRoute(repId)（routeStores 数组，真实线路）；重排仅在本地生效（演示体验），
 * 点「开始巡店」跳八步骤流 `/rep/steps/{storeId}`，已完成门店可查看只读诊断。
 *
 * 数据只走 @/api；失败一律 try/catch + Toast，绝不白屏。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import MapView from '@/components/business/MapView.vue'
import type { MapMarker } from '@/components/business/MapView.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useToast } from '@/composables/useToast'
import { useHaptics } from '@/composables/useHaptics'
import { useSessionStore } from '@/stores/session'
import { getTodayRoute } from '@/api'
import { levelOf, DEMO_WEATHER } from '@/domain/constants'
import type { RouteStore } from '@/types'

const router = useRouter()
const session = useSessionStore()
const toast = useToast()
const haptics = useHaptics()

const repId = computed<string>(() => session.user?.id || 'U_REP')

/* ─────────────── 线路数据 ─────────────── */

const loading = ref<boolean>(true)
const date = ref<string>('')
const weather = ref<string>(DEMO_WEATHER)
const list = ref<RouteStore[]>([])

async function load(): Promise<void> {
  loading.value = true
  try {
    const route = await getTodayRoute(repId.value)
    date.value = route.date
    weather.value = route.weather
    // 复制一份保证重排可在本地生效
    list.value = (route.routeStores ?? []).map((r) => ({ ...r }))
  } catch {
    toast.error('线路加载失败，请稍后重试')
    list.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)

/* ─────────────── 进度 ─────────────── */

const total = computed<number>(() => list.value.length)
const doneCount = computed<number>(() => list.value.filter((r) => r.status === 'done').length)
const percent = computed<number>(() => (total.value ? Math.round((doneCount.value / total.value) * 100) : 0))

/* ─────────────── 地图标记 ─────────────── */

const markers = computed<MapMarker[]>(() =>
  list.value
    .filter((r) => r.store && r.store.lat != null && r.store.lng != null)
    .map((r) => ({
      lat: Number(r.store.lat),
      lng: Number(r.store.lng),
      name: r.store.name,
      score: r.store.lastScore,
      level: levelOf(r.store.lastScore),
    })),
)

/* ─────────────── 重排（本地） ─────────────── */

function move(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= list.value.length) return
  const next = [...list.value]
  const [picked] = next.splice(index, 1)
  next.splice(target, 0, picked)
  // 重排后重算序号
  list.value = next.map((r, i) => ({ ...r, order: i + 1 }))
  haptics.select()
}

/* ─────────────── 门店动作 ─────────────── */

const orderCn = (n: number): string => '①②③④⑤⑥⑦⑧⑨⑩'[n - 1] ?? String(n)

/** 导航：优先用真实坐标拉起高德网页版，无坐标则提示 */
function navigate(r: RouteStore): void {
  const { lat, lng } = r.store ?? {}
  if (lat == null || lng == null) {
    toast.info('该门店暂无坐标，无法导航')
    return
  }
  const url = `https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(r.store.name)}`
  window.open(url, '_blank', 'noopener')
}

/** 开始 / 继续巡店 → 八步骤流 */
function patrol(storeId: string): void {
  router.push(`/rep/steps/${storeId}`)
}

/** 已完成门店查看只读诊断 */
function viewHistory(r: RouteStore): void {
  const id = r.visitId ?? `D_${r.store.id}`
  router.push({ path: `/rep/diagnosis/${id}`, query: { readonly: '1' } })
}

function statusLabel(s: RouteStore['status']): string {
  if (s === 'done') return '已完成'
  if (s === 'alert') return '需重点复查'
  return '待巡店'
}
</script>

<template>
  <MobileLayout title="智能排线" :back="true" :content-padding-bottom="24" @back="router.push('/rep/today')">
    <!-- 进度概览 -->
    <div class="rp-pad">
      <div class="u-card rp-head">
        <div class="rp-head__row">
          <div>
            <p class="rp-head__date">{{ date || '今日线路' }}</p>
            <p class="rp-head__weather"><AppIcon name="refresh" :size="12" color="var(--text-3)" /> {{ weather }} · 按距离与健康分智能排序</p>
          </div>
          <div class="rp-head__stat">
            <b>{{ doneCount }}</b><span>/{{ total }}</span>
          </div>
        </div>
        <div class="rp-progress" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100">
          <span class="rp-progress__fill" :style="{ width: `${percent}%` }" />
        </div>
        <p class="rp-head__tip">已完成 {{ doneCount }} 家 · 完成度 {{ percent }}%</p>
      </div>
    </div>

    <!-- 地图 -->
    <div v-if="!loading && markers.length" class="rp-pad">
      <div class="u-card rp-map">
        <MapView :markers="markers" :height="228" />
      </div>
    </div>

    <!-- 门店列表 -->
    <div class="rp-pad">
      <p class="rp-sec-title">今日拜访线路（{{ total }}）</p>

      <SkeletonBlock v-if="loading" height="96px" radius="12px" />
      <template v-else-if="list.length">
        <div v-for="(r, i) in list" :key="r.store.id" class="u-card rp-store" :class="{ 'rp-store--done': r.status === 'done' }">
          <div class="rp-store__main">
            <div class="rp-store__order" :class="`rp-store__order--${r.status}`">
              <span v-if="r.status === 'done'">✓</span>
              <span v-else-if="r.status === 'alert'">!</span>
              <span v-else>{{ orderCn(r.order) }}</span>
            </div>
            <div class="rp-store__info">
              <p class="rp-store__name u-ellipsis">{{ r.store.name }}</p>
              <p class="rp-store__meta">
                {{ r.store.typeLabel }} · 距起点 {{ r.store.distanceKm }}km
                <span class="rp-store__badge" :class="`rp-store__badge--${r.status}`">{{ statusLabel(r.status) }}</span>
              </p>
              <p class="rp-store__score">
                上次健康分 <b :style="{ color: `var(--level-${levelOf(r.store.lastScore)})` }">{{ r.store.lastScore }}</b>
                <span v-if="r.isReview" class="rp-store__review">★整改复查</span>
              </p>
            </div>
            <!-- 上下箭头重排 -->
            <div class="rp-store__sort">
              <button
                type="button"
                class="rp-sort u-tap"
                :disabled="i === 0"
                aria-label="上移"
                @click="move(i, -1)"
              >
                <AppIcon name="chevron-up" :size="14" />
              </button>
              <button
                type="button"
                class="rp-sort u-tap"
                :disabled="i === list.length - 1"
                aria-label="下移"
                @click="move(i, 1)"
              >
                <AppIcon name="chevron-down" :size="14" />
              </button>
            </div>
          </div>

          <div class="rp-store__acts">
            <button type="button" class="rp-act u-tap" @click="navigate(r)">
              <AppIcon name="map-pin" :size="13" /> 导航
            </button>
            <button v-if="r.status === 'done'" type="button" class="rp-act rp-act--ghost u-tap" @click="viewHistory(r)">
              <AppIcon name="history" :size="13" /> 查看
            </button>
            <button v-else type="button" class="rp-act rp-act--primary u-tap" @click="patrol(r.store.id)">
              <AppIcon name="camera" :size="13" color="#fff" /> 开始巡店
            </button>
          </div>
        </div>
      </template>

      <EmptyState
        v-else
        icon="store"
        title="今日暂无线路"
        desc="经理尚未排线，可先刷新或联系主管"
        action-text="重新加载"
        @action="load"
      />
    </div>
  </MobileLayout>
</template>

<style scoped>
.rp-pad {
  padding: 14px 12px 0;
}

/* 进度概览 */
.rp-head {
  padding: 14px;
  border-left: 4px solid var(--mn-green);
}

.rp-head__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.rp-head__date {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

.rp-head__weather {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--text-3);
}

.rp-head__stat {
  flex: none;
  font-variant-numeric: tabular-nums;
}

.rp-head__stat b {
  font-size: 24px;
  font-weight: 800;
  color: var(--mn-green);
}

.rp-head__stat span {
  font-size: 14px;
  color: var(--text-3);
}

.rp-progress {
  position: relative;
  height: 8px;
  margin-top: 12px;
  border-radius: 999px;
  background: var(--bg-page);
  overflow: hidden;
}

.rp-progress__fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--mn-green) 0%, var(--mn-green-dark) 100%);
  transition: width var(--dur-base) var(--ease-standard);
}

.rp-head__tip {
  margin-top: 7px;
  font-size: 11px;
  color: var(--text-3);
}

/* 地图 */
.rp-map {
  padding: 8px;
  overflow: hidden;
}

/* 门店卡 */
.rp-sec-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}

.rp-store {
  margin-bottom: 10px;
  padding: 12px;
}

.rp-store--done {
  background: linear-gradient(180deg, var(--mn-green-light) 0%, var(--bg-card) 62%);
}

.rp-store__main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rp-store__order {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--text-3);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.rp-store__order--done {
  background: var(--mn-green);
}

.rp-store__order--pending {
  background: var(--border-strong, #c9d1cd);
  color: var(--text-2);
}

.rp-store__order--alert {
  background: var(--level-risk);
}

.rp-store__info {
  flex: 1;
  min-width: 0;
}

.rp-store__name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.rp-store__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-2);
}

.rp-store__badge {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
}

.rp-store__badge--done {
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
}

.rp-store__badge--pending {
  background: var(--bg-page);
  color: var(--text-3);
}

.rp-store__badge--alert {
  background: var(--danger-bg);
  color: var(--danger-fg);
}

.rp-store__score {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-2);
}

.rp-store__score b {
  font-size: 13px;
}

.rp-store__review {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--ai-purple-light, #f1ebff);
  color: var(--ai-purple);
  font-size: 10px;
  font-weight: 600;
}

/* 上下箭头 */
.rp-store__sort {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rp-sort {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 26px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-2);
}

.rp-sort:disabled {
  opacity: 0.35;
}

.rp-store__acts {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.rp-act {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 40px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
}

.rp-act--primary {
  border-color: var(--mn-green);
  background: var(--mn-green);
  color: #fff;
}

.rp-act--ghost {
  color: var(--mn-green-dark);
  border-color: var(--mn-green);
}
</style>
