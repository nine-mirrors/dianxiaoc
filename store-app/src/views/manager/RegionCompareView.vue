<script setup lang="ts">
/**
 * RegionCompareView（/manager/regions）—— 区域对比（W3 经理端）。
 *
 * 数据：`GET /api/v1/region-compare`（对比行 + 聚焦区域详情，一次请求取全）。
 * ★ 口径同源：后端每个区域指标都取自 dashboard.js 的 buildDashboardOverview(regionId)，
 *   与「区域经营看板」页同一函数 —— 对比页与看板页对同一区域不会出现两个数。
 *
 * 结构：顶部区域分段选择 → 区域关键指标对比表（点击行/分段切换聚焦）→
 *       近 8 周趋势（复用 TrendLine，指标切换自带 ECharts 过渡动画）+ 门店排行（按健康分降序）。
 *
 * 真实数据边界：周环比 = 区域门店 weekDelta 均值；巡店完成数 = 区域门店真实巡店记录条数；
 *   整改闭环率 / 任务完成率为 null 时显式显示「—」（不伪造 0）。后端无去年同期数据，故不做同比。
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import DesktopHeader from '@/components/layout/DesktopHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import HealthBadge from '@/components/common/HealthBadge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import TrendLine from '@/components/business/charts/TrendLine.vue'
import { useApi } from '@/composables/useApi'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'
import { getRegionCompare } from '@/api/region-compare'
import type { RegionCompareData, RegionStoreRank } from '@/api/region-compare'
import { levelOf } from '@/domain/constants'
import type { HealthLevelKey } from '@/types'

const router = useRouter()
const session = useSessionStore()
const toast = useToast()

/** 当前聚焦区域 id（默认第一个区域 R_EAST） */
const regionId = ref<string>('R_EAST')

const { data, loading, error, run } = useApi<RegionCompareData>(
  () => getRegionCompare(regionId.value),
  { initial: null as unknown as RegionCompareData },
)

/** 首屏加载骨架（尚未拿到数据且未出错时展示；区域切换时保留旧数据不闪骨架） */
const showSkeleton = computed<boolean>(() => !data.value && !error.value)
/** 真正拿不到数据（首屏失败 / 后端不可用）→ 错误态 */
const hasError = computed<boolean>(() => !!error.value && !data.value)
/** 区域切换失败但仍有旧数据 → 内联提示（不静默展示过期数据） */
const refreshError = computed<boolean>(() => !!error.value && !!data.value)

const rows = computed(() => data.value?.regions ?? [])
const focus = computed(() => data.value?.focus ?? null)
const regionIds = computed(() => rows.value.map((r) => ({ id: r.regionId, name: r.regionName })))

/** 门店排行展示数量（默认 10 条，可展开全部） */
const showAllStores = ref<boolean>(false)
const RANK_PREVIEW = 10
const rankedStores = computed<RegionStoreRank[]>(() => focus.value?.stores ?? [])
const visibleStores = computed<RegionStoreRank[]>(() =>
  showAllStores.value ? rankedStores.value : rankedStores.value.slice(0, RANK_PREVIEW),
)

/** 切换聚焦区域（分段控件 / 对比表行 / 顶栏区域下拉 共用） */
async function changeFocus(id: string): Promise<void> {
  if (!id || id === regionId.value) return
  regionId.value = id
  showAllStores.value = false
  await run()
  if (!error.value) toast.info('已切换对比区域')
}

function switchAccount(): void {
  session.logout()
  toast.info('请重新登录目标账号')
  void router.push('/login')
}

/** 平均健康分分档（用于色条与数字着色） */
function regionLevel(score: number): HealthLevelKey {
  return levelOf(score)
}

/** 环比正负语义：健康分上升为好（绿），下降为好（红） */
function deltaClass(v: number): string {
  if (v > 0) return 'is-up'
  if (v < 0) return 'is-down'
  return 'is-flat'
}

function fmtDelta(v: number): string {
  return `${v > 0 ? '+' : ''}${v}`
}

/** 比率型指标：null 显式「—」，不伪造 0 */
function fmtRate(v: number | null): string {
  return v === null || v === undefined ? '—' : `${v}%`
}
</script>

<template>
  <div class="rc">
    <h1 class="u-sr-only">区域对比</h1>

    <DesktopHeader
      :region-ids="regionIds"
      :region-id="regionId"
      :user-name="session.user?.name ?? ''"
      :role-label="session.roleLabel"
      @change-region="changeFocus"
      @switch-role="switchAccount"
    />

    <div class="rc__body">
      <!-- ────────── 首屏骨架 ────────── -->
      <template v-if="showSkeleton">
        <div class="rc__skel-tabs">
          <SkeletonBlock v-for="i in 3" :key="i" width="120px" height="30px" radius="999px" />
        </div>
        <div class="u-card rc__table-card">
          <SkeletonBlock width="180px" height="16px" shape="text" />
          <div class="rc__skel-rows">
            <SkeletonBlock v-for="i in 3" :key="i" height="44px" radius="10px" />
          </div>
        </div>
        <div class="rc__detail">
          <div class="u-card rc__chart-card">
            <SkeletonBlock width="150px" height="16px" shape="text" />
            <SkeletonBlock height="200px" radius="12px" style="margin-top: 12px" />
          </div>
          <div class="u-card rc__rank-card">
            <SkeletonBlock width="140px" height="16px" shape="text" />
            <div class="rc__skel-rows">
              <SkeletonBlock v-for="i in 5" :key="i" height="38px" radius="10px" />
            </div>
          </div>
        </div>
      </template>

      <!-- ────────── 错误态（后端不可用，如实提示，不假数据兜底） ────────── -->
      <EmptyState
        v-else-if="hasError || !data"
        icon="warning"
        title="区域数据暂时不可用"
        desc="后端未连接或服务异常，请确认服务已启动后重试。"
        action-text="重新加载"
        @action="run"
      />

      <!-- ────────── 空态 ────────── -->
      <EmptyState
        v-else-if="!rows.length"
        icon="bar-chart"
        title="暂无区域数据"
        desc="当前账号可见区域为空，等门店数据接入后这里会自动生成对比。"
        action-text="重新加载"
        @action="run"
      />

      <template v-else>
        <!-- 顶部区域分段选择（可点切换聚焦；选中态品牌绿） -->
        <nav class="rc__segments mot-fade-up" role="group" aria-label="选择聚焦区域">
          <button
            v-for="r in rows"
            :key="r.regionId"
            type="button"
            class="rc__segment mot-tap"
            :class="{ 'is-active': r.regionId === regionId }"
            :aria-pressed="r.regionId === regionId"
            :aria-label="`聚焦 ${r.regionName}`"
            @click="changeFocus(r.regionId)"
          >
            {{ r.regionName }}
            <em class="rc__segment-score">{{ r.avgScore }}</em>
          </button>
          <!-- 区域切换中：转圈提示（保留旧数据，不闪骨架） -->
          <span v-if="loading" class="rc__refreshing mot-press-loading" role="status">刷新中</span>
        </nav>

        <div v-if="refreshError" class="rc__inline-warn" role="alert">
          <AppIcon name="warning" :size="13" /> 最新数据刷新失败，以下为上次成功加载的结果
        </div>

        <!-- ────────── 区域关键指标对比表 ────────── -->
        <section class="u-card rc__table-card mot-fade-up" aria-labelledby="rc-table-title">
          <header class="rc__card-head">
            <h2 id="rc-table-title" class="rc__card-title">
              <AppIcon name="bar-chart" :size="15" color="var(--mn-green-dark)" /> 区域关键指标对比
            </h2>
            <span>点击区域行即可切换下方聚焦详情</span>
          </header>
          <div class="rc__table-wrap">
            <table class="rc__table">
              <thead>
                <tr>
                  <th scope="col">区域</th>
                  <th scope="col">门店数</th>
                  <th scope="col">平均健康分</th>
                  <th scope="col">周环比</th>
                  <th scope="col">巡店完成数</th>
                  <th scope="col">整改闭环率</th>
                  <th scope="col">任务完成率</th>
                </tr>
              </thead>
              <tbody class="mot-stagger">
                <tr
                  v-for="r in rows"
                  :key="r.regionId"
                  class="rc__row"
                  :class="{ 'is-focus': r.regionId === regionId }"
                >
                  <td class="rc__cell-region">
                    <button
                      type="button"
                      class="rc__region-btn"
                      :aria-pressed="r.regionId === regionId"
                      :aria-label="`聚焦 ${r.regionName}，平均健康分 ${r.avgScore}`"
                      @click="changeFocus(r.regionId)"
                    >
                      <span
                        class="rc__region-bar"
                        :style="{ background: `var(--level-${regionLevel(r.avgScore)})` }"
                        aria-hidden="true"
                      />
                      {{ r.regionName }}
                    </button>
                  </td>
                  <td>{{ r.storeCount }}</td>
                  <td>
                    <b class="rc__score" :style="{ color: `var(--level-${regionLevel(r.avgScore)})` }">
                      {{ r.avgScore }}
                    </b>
                  </td>
                  <td>
                    <span class="rc__delta" :class="deltaClass(r.weekDelta)">
                      <AppIcon
                        v-if="r.weekDelta > 0"
                        name="arrow-up"
                        :size="11"
                      />
                      <AppIcon
                        v-else-if="r.weekDelta < 0"
                        name="arrow-down"
                        :size="11"
                      />
                      {{ fmtDelta(r.weekDelta) }}
                    </span>
                  </td>
                  <td>{{ r.visitCount }}</td>
                  <td :title="`已完成 ${r.rectificationDone} · 待复查 ${r.rectificationOpen}`">
                    {{ fmtRate(r.rectificationRate) }}
                  </td>
                  <td :title="`已完成 ${r.taskDone} / 共 ${r.taskTotal}，逾期 ${r.taskOverdue}`">
                    {{ fmtRate(r.taskRate) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="rc__caliber">{{ data.method }}</p>
        </section>

        <!-- ────────── 聚焦详情：趋势图 + 门店排行（区域切换走淡入过渡） ────────── -->
        <transition name="rc-swap" mode="out-in">
          <div v-if="focus" :key="focus.regionId" class="rc__detail">
            <!-- 近 8 周趋势 -->
            <section class="u-card rc__chart-card" aria-labelledby="rc-trend-title">
              <header class="rc__card-head">
                <h2 id="rc-trend-title" class="rc__card-title">
                  <AppIcon name="trending-up" :size="15" color="var(--mn-green)" />
                  近 8 周趋势 · {{ focus.regionName }}
                </h2>
                <span>指标可切换，数据与看板同源</span>
              </header>
              <TrendLine v-if="focus.trend.length" :series="focus.trend" />
              <EmptyState
                v-else
                icon="trending-up"
                title="暂无趋势数据"
                desc="该区域还没有可用的多周趋势记录。"
              />
            </section>

            <!-- 门店排行（按健康分降序） -->
            <section class="u-card rc__rank-card" aria-labelledby="rc-rank-title">
              <header class="rc__card-head">
                <h2 id="rc-rank-title" class="rc__card-title">
                  <AppIcon name="layers" :size="15" color="var(--mn-green-dark)" />
                  门店排行 · {{ focus.regionName }}
                </h2>
                <span>共 {{ focus.storeTotal }} 家 · 按健康分降序</span>
              </header>

              <ol v-if="rankedStores.length" class="rc__rank mot-stagger">
                <li v-for="(s, i) in visibleStores" :key="s.storeId" class="rc__rank-item">
                  <span
                    class="rc__rank-no"
                    :class="{ 'rc__rank-no--top': i < 3 }"
                    :aria-label="`第 ${i + 1} 名`"
                  >{{ i + 1 }}</span>
                  <div class="rc__rank-main">
                    <p class="rc__rank-name">{{ s.storeName }}</p>
                    <p class="rc__rank-issue">{{ s.mainIssue || '无重大问题' }}</p>
                  </div>
                  <span class="rc__delta rc__rank-delta" :class="deltaClass(s.weekDelta)">
                    {{ fmtDelta(s.weekDelta) }}
                  </span>
                  <span class="rc__rank-score" :style="{ color: `var(--level-${s.level})` }">{{ s.score }}</span>
                  <HealthBadge :level="s.level" />
                </li>
              </ol>
              <EmptyState
                v-else
                icon="store"
                title="该区域暂无门店"
                desc="待门店数据接入后会按健康分上榜。"
              />

              <button
                v-if="rankedStores.length > RANK_PREVIEW"
                type="button"
                class="rc__rank-toggle u-btn u-btn--ghost"
                :aria-expanded="showAllStores"
                @click="showAllStores = !showAllStores"
              >
                {{ showAllStores ? '收起' : `展开全部 ${rankedStores.length} 家` }}
                <AppIcon :name="showAllStores ? 'chevron-up' : 'chevron-down'" :size="14" />
              </button>
            </section>
          </div>
        </transition>
      </template>
    </div>
  </div>
</template>

<style scoped>
.rc {
  min-height: 100vh;
  background: var(--bg-page);
}

.rc__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 1760px;
  margin: 0 auto;
  padding: 16px 24px 28px;
}

/* ── 顶部区域分段选择 ── */
.rc__segments {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.rc__segment {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 6px 16px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard);
}

.rc__segment:hover {
  border-color: var(--mn-green);
  color: var(--mn-green-dark);
}

.rc__segment.is-active {
  border-color: var(--mn-green);
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
}

.rc__segment:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.rc__segment-score {
  font-style: normal;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text-1);
}

.rc__segment.is-active .rc__segment-score {
  color: var(--mn-green-dark);
}

/* 「刷新中」转圈提示（.mot-press-loading 提供 currentColor 旋转环） */
.rc__refreshing {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  color: var(--mn-green-dark);
}

.rc__inline-warn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 8px;
  background: var(--warning-bg);
  color: var(--warning-fg);
  font-size: 12px;
  font-weight: 600;
}

/* ── 卡片头 ── */
.rc__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.rc__card-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  font-size: clamp(13px, 0.94vw, 15px);
  font-weight: 700;
  color: var(--text-1);
}

.rc__card-head span {
  font-size: 11.5px;
  color: var(--text-3);
}

/* ── 对比表 ── */
.rc__table-card {
  padding: 14px 16px;
}

.rc__table-wrap {
  overflow-x: auto;
}

.rc__table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
  font-size: 12.5px;
}

.rc__table th {
  padding: 7px 10px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-3);
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
}

.rc__table td {
  padding: 10px;
  border-bottom: 1px dashed var(--border-color);
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.rc__row {
  transition: background var(--dur-fast) var(--ease-standard);
}

.rc__row:hover td {
  background: var(--bg-page);
}

/* 聚焦行：左侧品牌绿强调 + 轻底 */
.rc__row.is-focus td {
  background: var(--mn-green-light);
}

.rc__cell-region {
  width: 190px;
}

.rc__region-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  color: var(--text-1);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-standard);
}

.rc__region-btn:hover {
  background: var(--bg-page);
}

.rc__row.is-focus .rc__region-btn {
  background: var(--bg-card);
  border-color: var(--mn-green);
}

.rc__region-btn:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.rc__region-bar {
  flex: none;
  width: 4px;
  height: 18px;
  border-radius: 999px;
}

.rc__score {
  font-size: 15px;
  font-weight: 800;
}

.rc__delta {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-weight: 700;
}

.rc__delta.is-up {
  color: var(--mn-green);
}

.rc__delta.is-down {
  color: var(--level-risk);
}

.rc__delta.is-flat {
  color: var(--text-3);
}

.rc__caliber {
  margin: 10px 0 0;
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--text-3);
}

/* ── 聚焦详情两列 ── */
.rc__detail {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 14px;
  align-items: start;
}

.rc__chart-card,
.rc__rank-card {
  padding: 14px 16px;
}

/* ── 门店排行 ── */
.rc__rank {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}

.rc__rank-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-bottom: 1px dashed var(--border-color);
}

.rc__rank-item:last-child {
  border-bottom: none;
}

.rc__rank-no {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  font-weight: 800;
  color: var(--text-3);
  background: var(--bg-page);
}

.rc__rank-no--top {
  background: var(--mn-green);
  color: #fff;
}

.rc__rank-main {
  flex: 1;
  min-width: 0;
}

.rc__rank-name {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rc__rank-issue {
  margin: 1px 0 0;
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rc__rank-delta {
  flex: none;
  font-size: 12px;
}

.rc__rank-score {
  flex: none;
  font-size: 17px;
  font-weight: 800;
  min-width: 30px;
  text-align: right;
}

.rc__rank-toggle {
  margin-top: 12px;
  width: 100%;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

/* ── 区域切换过渡（进出场仅动 opacity/transform） ── */
.rc-swap-enter-active {
  transition:
    opacity var(--dur-base) var(--ease-decel),
    transform var(--dur-base) var(--ease-decel);
}

.rc-swap-leave-active {
  transition: opacity var(--dur-fast) var(--ease-standard);
}

.rc-swap-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.rc-swap-leave-to {
  opacity: 0;
}

/* ── 骨架 ── */
.rc__skel-tabs {
  display: flex;
  gap: 8px;
}

.rc__skel-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}

/* ── 响应式：窄窗纵向堆叠，不溢出 ── */
@media (max-width: 1024px) {
  .rc__detail {
    grid-template-columns: 1fr;
  }

  .rc__body {
    padding: 12px 16px 24px;
  }
}

@media (max-width: 768px) {
  .rc__body {
    padding: 12px;
  }

  .rc__segment {
    flex: 1 1 auto;
    justify-content: center;
  }
}
</style>
