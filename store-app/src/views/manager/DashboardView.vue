<script setup lang="ts">
/**
 * P5 区域经理看板（认知心理学 + 企业级交互改造）。
 *
 * 信息架构（米勒分块）：顶部分段控件组织「经营概览 / 门店明细 / 任务闭环」三区，
 * 默认概览，纯前端切换、不改任何接口；
 * - 概览：KPI、AI 晨报、健康分环图 + 8 周趋势、风险 Top5（行内可下派）；
 * - 明细：全量门店表，默认只看风险+预警，店名搜索 + 健康档筛选 + 10 条/页；
 * - 闭环：整改闭环 / 本周订货 / 任务完成率三张卡，口径小字合并为底部一处。
 *
 * 下派只有一个入口组件 TaskDispatchDialog：风险卡总入口、风险行内按钮、AI 晨报
 * 草稿都打开它（行内/草稿带预选门店与草稿预置）。成功全链路仅 1 条 toast。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import DesktopHeader from '@/components/layout/DesktopHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import HealthBadge from '@/components/common/HealthBadge.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import DonutChart from '@/components/business/charts/DonutChart.vue'
import TrendLine from '@/components/business/charts/TrendLine.vue'
import TaskDispatchDialog from '@/components/business/TaskDispatchDialog.vue'
import ManagerAiBrief from '@/components/business/ManagerAiBrief.vue'
import { useApi } from '@/composables/useApi'
import { getDashboardOverview } from '@/api'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'
import type { DashboardOverview, Kpi, StoreRow, Task, TaskType } from '@/types'

const router = useRouter()
const session = useSessionStore()
const toast = useToast()

/** 当前区域 id */
const regionId = ref<string>('R_EAST')

const { data, loading, run } = useApi(() => getDashboardOverview(regionId.value), {
  initial: null as unknown as { overview: DashboardOverview },
})
const overview = computed<DashboardOverview | null>(() => data.value?.overview ?? null)

/** 切换区域后同步刷新看板（订货汇总随 overview 一并带回） */
async function changeRegion(id: string): Promise<void> {
  regionId.value = id
  await run()
  toast.info('已切换区域')
}

/**
 * 切换账号（身份由后端账号决定，前端不允许自选角色）。
 * 原实现调 session.login('rep') 只传一个参数，与新签名 (username, password) 不匹配 → 必失败。
 */
function switchAccount(): Promise<void> {
  session.logout()
  toast.info('请重新登录目标账号')
  return router.push('/login')
}

/* ═══════════════ 米勒分块：看板三区（纯前端分段切换，不打接口） ═══════════════ */

type DashboardTab = 'overview' | 'detail' | 'loop'

const TABS: { key: DashboardTab; label: string }[] = [
  { key: 'overview', label: '经营概览' },
  { key: 'detail', label: '门店明细' },
  { key: 'loop', label: '任务闭环' },
]

const activeTab = ref<DashboardTab>('overview')

function switchTab(key: DashboardTab): void {
  activeTab.value = key
  // 图表在 v-show 面板里，切回概览等布局恢复后再触发 resize，防止 ECharts 宽度停在 0
  void nextTick(() => window.dispatchEvent(new Event('resize')))
}

/** tablist 左右方向键切换（roving tabindex：仅当前 tab 可 Tab 停靠） */
function onTabKeydown(event: KeyboardEvent): void {
  const idx = TABS.findIndex((t) => t.key === activeTab.value)
  if (idx < 0) return
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault()
    switchTab(TABS[(idx + 1) % TABS.length].key)
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault()
    switchTab(TABS[(idx - 1 + TABS.length) % TABS.length].key)
  }
}

/* ═══════════════ 下派：全看板唯一弹层实例 ═══════════════ */

/** 下派任务弹层开关 */
const showDispatch = ref<boolean>(false)

/** 打开弹层时的预置（风险行内按钮只带 storeId；AI 草稿带全量草稿字段） */
interface DispatchPreset {
  storeId?: string
  taskType?: TaskType
  dueAt?: string
  note?: string
}
const dispatchPreset = ref<DispatchPreset>({})

/** 风险卡总入口（无预选）与行内入口（带预选 storeId）共用这一个函数 */
function openDispatch(storeId?: string): void {
  dispatchPreset.value = storeId ? { storeId } : {}
  showDispatch.value = true
}

/** AI 晨报草稿 → 同一个下派弹层（AI 起草、经理在弹层内人工确认） */
function openDraftDispatch(p: { storeId: string; taskType: TaskType; dueAt: string; note: string }): void {
  dispatchPreset.value = { ...p }
  showDispatch.value = true
}

/** 下派可选门店：从本区域完整门店池派生，并带分数/档位（弹层内按健康分升序）。
 *  原实现复用 riskTop5（修复前只有 1–2 条），导致跨角色闭环的可选门店过少。
 *  改为 storeRows 后恢复为该区域全量门店（44/42/42），下派不再被风险清单宽度限制。*/
const dispatchStores = computed(() =>
  (overview.value?.storeRows ?? []).map((r) => ({
    storeId: r.storeId,
    storeName: r.storeName,
    score: r.score,
    level: r.level,
  })),
)

/** AI 晨报组件实例：下派成功后令其重新生成（已派门店不再重复出草稿） */
const briefRef = ref<InstanceType<typeof ManagerAiBrief> | null>(null)

/** 预置诊断数据的门店（S1–S5）。
 *  diagnoses.json 只覆盖这 5 家，其余 123 家点「查看详情」会走到后端 404，
 *  并弹出与「点错行」无关的报错文案（"未检测到蒙牛陈列区域，请重拍"）。
 *  演示期间随手点一行就穿帮，因此对无诊断数据的门店隐藏该入口 ——
 *  不用后端 fallback 兜，因为那等于为 123 家店编造诊断内容，与项目
 *  「数字可追问、不编造」的核心原则冲突。*/
const DIAGNOSIS_READY = new Set(['S1', 'S2', 'S3', 'S4', 'S5'])
function canViewDetail(storeId: string): boolean {
  return DIAGNOSIS_READY.has(storeId)
}

/** S1–S5 行点击 / 键盘 Enter 跳转只读诊断（保持既有跳转不变） */
function goDetail(storeId: string): void {
  if (canViewDetail(storeId)) {
    void router.push(`/rep/diagnosis/D_${storeId}?readonly=1`)
  }
}

/**
 * 下派成功回调（全链路唯一一条 toast）。
 *
 * 后端已在 `POST /api/v1/tasks` 里 `broadcast('task:new', {toRole:'rep'})`，
 * 业代端开着页面时会**实时**收到提醒；弹层内不再重复弹 toast。
 */
function onDispatched(task: Task): void {
  toast.success(`已实时下派：${task.storeName} · ${task.taskTypeLabel}，业代端开着页面即刻收到`)
  void run()
  briefRef.value?.reload()
}

/* ═══════════════ 警报疲劳：KPI 红点只在「确有恶化」时出现 ═══════════════ */

/** 计数型指标：数值上升才算恶化（红灯门店、缺货率）；其余指标无恶化口径不亮红点 */
const COUNT_METRICS_WORSE_WHEN_UP = new Set(['redStores', 'oosRate'])

function kpiWorsening(k: Kpi): boolean {
  if (!k.danger) return false
  if (COUNT_METRICS_WORSE_WHEN_UP.has(k.key)) return k.trend === 'up'
  return false
}

/* ═══════════════ 门店明细：搜索 + 健康档筛选 + 本地分页（明细区专用） ═══════════════ */

const PAGE_SIZE = 10
const searchTerm = ref<string>('')
/** 默认只看风险+预警（值班经理的注意力应优先放在这两档） */
const levelFilter = ref<string>('attention')
const page = ref<number>(1)

const filteredStoreRows = computed<StoreRow[]>(() => {
  const kw = searchTerm.value.trim()
  return (overview.value?.storeRows ?? []).filter((r) => {
    if (kw && !r.storeName.includes(kw)) return false
    if (levelFilter.value === 'attention') return r.level === 'risk' || r.level === 'warning'
    if (levelFilter.value !== 'all' && r.level !== levelFilter.value) return false
    return true
  })
})

const totalPages = computed<number>(() => Math.max(1, Math.ceil(filteredStoreRows.value.length / PAGE_SIZE)))

/* 表头本地排序（纯前端，不改接口）：默认健康分升序，与表题「按健康分升序」口径一致。
   仅对数值列开放（健康分 / 周变化），门店名与问题列不排序。 */
type StoreSortKey = 'score' | 'weekDelta'
const sortKey = ref<StoreSortKey>('score')
const sortAsc = ref<boolean>(true)

/** 点击排序表头：同列切换升降序，换列时健康分默认升序（差→好）、周变化默认降序（涨幅优先） */
function toggleSort(key: StoreSortKey): void {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = key === 'score'
  }
}

/** th[aria-sort] 读屏值（升序/降序/不参与排序） */
function ariaSortFor(key: StoreSortKey): 'ascending' | 'descending' | 'none' {
  if (sortKey.value !== key) return 'none'
  return sortAsc.value ? 'ascending' : 'descending'
}

/** 排序方向指示符：非激活列给中性双向箭头占位，避免激活时表头文字横向跳动 */
function sortIconFor(key: StoreSortKey): string {
  if (sortKey.value !== key) return '↕'
  return sortAsc.value ? '↑' : '↓'
}

/** 筛选结果先排序再分页，排序不丢任何行、不改变筛选口径 */
const sortedStoreRows = computed<StoreRow[]>(() => {
  const rows = [...filteredStoreRows.value]
  const factor = sortAsc.value ? 1 : -1
  rows.sort((a, b) => (a[sortKey.value] - b[sortKey.value]) * factor)
  return rows
})

const pagedStoreRows = computed<StoreRow[]>(() =>
  sortedStoreRows.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)

/** 筛选条件变化回第 1 页 */
watch([searchTerm, levelFilter], () => {
  page.value = 1
})
/** 当前页越界（如筛选后结果变少）时收回最后一页 */
watch(totalPages, (n) => {
  if (page.value > n) page.value = n
})

function goPage(p: number): void {
  page.value = Math.min(Math.max(1, p), totalPages.value)
}

/* ═══════════════ 本周订货汇总（订货三端打通 · 经理端） ═══════════════ */

/**
 * 订货汇总：**直接用 overview.orderSummary**，不再单独发请求
 * （team-lead 要求：看板一次请求拿全，避免多打一枪）。
 */
const orderSummary = computed(() => {
  const s = overview.value?.orderSummary
  return {
    count: s?.count ?? 0,
    bottles: s?.bottles ?? 0,
    amount: s?.amount ?? 0,
    accepted: s?.accepted ?? 0,
    pending: s?.pending ?? 0,
  }
})

/* ═══════════════ 任务完成率（闭环最后一环：派了 → 做了没有） ═══════════════ */

/**
 * 任务完成率：同样取自 overview.taskSummary（一次请求拿全）。
 * 完成率 = done / total（与「已完成 / 总数」两处数字同源，不会出现第二种口径）。
 */
const taskSummary = computed(() => {
  const t = overview.value?.taskSummary
  const done = t?.done ?? 0
  const total = t?.total ?? 0
  return {
    done,
    open: t?.open ?? 0,
    overdue: t?.overdue ?? 0,
    total,
    rate: t?.completionRate ?? (total ? Math.round((done / total) * 100) : 0),
  }
})
</script>

<template>
  <div class="p5">
    <h1 class="u-sr-only">区域经营看板</h1>

    <DesktopHeader
      :region-ids="overview?.regionIds ?? []"
      :region-id="overview?.regionId ?? ''"
      :user-name="session.user?.name ?? ''"
      :role-label="session.roleLabel"
      @change-region="changeRegion"
      @switch-role="switchAccount"
    />

    <div class="p5__body">
      <div v-if="loading" class="p5__kpis">
        <SkeletonBlock v-for="i in 4" :key="i" height="86px" radius="12px" />
      </div>

      <template v-else-if="overview">
        <!-- 米勒分块：三区分段控件（纯前端切换） -->
        <nav class="p5__tabs" role="tablist" aria-label="看板分区" @keydown="onTabKeydown">
          <button
            v-for="t in TABS"
            :key="t.key"
            type="button"
            role="tab"
            class="p5__tab"
            :class="{ 'is-active': activeTab === t.key }"
            :aria-selected="activeTab === t.key"
            :tabindex="activeTab === t.key ? 0 : -1"
            @click="switchTab(t.key)"
          >
            {{ t.label }}
          </button>
        </nav>

        <!-- ══════════ 区一：经营概览 ══════════ -->
        <div v-show="activeTab === 'overview'" class="p5__panel mot-fade-up" role="tabpanel" aria-label="经营概览">
          <h2 class="u-sr-only">核心指标与风险概览</h2>

          <!-- KPI -->
          <div class="p5__kpis">
            <div v-for="k in overview.kpis" :key="k.key" class="p5__kpi" tabindex="0">
              <p class="p5__kpi-label">
                {{ k.label }}
                <span v-if="kpiWorsening(k)" class="p5__kpi-dot" aria-label="指标恶化" />
              </p>
              <p class="p5__kpi-value" :class="{ 'is-danger': k.danger }">
                {{ k.value }}
                <em :class="k.trend === 'up' ? 'is-up' : k.trend === 'flat' ? 'is-flat' : 'is-down'">{{ k.delta }}</em>
              </p>
              <p v-if="k.target" class="p5__kpi-target">{{ k.target }}</p>
            </div>
          </div>

          <!-- AI 晨报：主动预警 + 一键拟派（下派打开看板唯一弹层，成功后刷新看板与晨报） -->
          <ManagerAiBrief ref="briefRef" :region-id="regionId" @dispatch="openDraftDispatch" />

          <!-- 环图 + 趋势 -->
          <div class="p5__charts">
            <section class="p5__card p5__card--donut">
              <header class="p5__card-head">
                <h2 class="p5__card-title">健康分四档分布</h2>
                <span>共 {{ overview.distribution.reduce((s, d) => s + d.count, 0) }} 家</span>
              </header>
              <DonutChart :data="overview.distribution" />
            </section>

            <section class="p5__card p5__card--trend">
              <header class="p5__card-head">
                <h2 class="p5__card-title">近 8 周趋势</h2>
                <span class="p5__trend-hint"><AppIcon name="trending-up" :size="14" /> 缺货率↓ 铺货率↑</span>
              </header>
              <TrendLine :series="overview.trend" />
            </section>
          </div>

          <!-- 风险 Top5（行内即可下派，按钮带预选 storeId） -->
          <section class="p5__card">
            <header class="p5__card-head">
              <h2 class="p5__card-title">
                <AppIcon name="alert-triangle" :size="14" /> 风险预警 Top5
              </h2>
              <button type="button" class="p5__dispatch" @click="openDispatch()">
                <AppIcon name="send" :size="13" /> 下派任务
              </button>
            </header>
            <div
              v-for="(r, i) in overview.riskTop5"
              :key="r.storeId"
              class="p5__risk"
              tabindex="0"
            >
              <span
                class="p5__risk-no"
                :style="{ background: `var(--level-${r.level})` }"
                :aria-label="`第 ${i + 1} 名`"
              >{{ i + 1 }}</span>
              <div class="p5__risk-main">
                <p class="p5__risk-name">{{ r.storeName }}</p>
                <p class="p5__risk-reason">{{ r.reason }}</p>
              </div>
              <span class="p5__risk-score" :style="{ color: `var(--level-${r.level})` }">{{ r.score }}</span>
              <button type="button" class="p5__risk-dispatch" @click="openDispatch(r.storeId)">
                <AppIcon name="send" :size="11" /> 下派
              </button>
            </div>
          </section>
        </div>

        <!-- ══════════ 区二：门店明细（搜索 + 筛选 + 分页） ══════════ -->
        <div v-show="activeTab === 'detail'" class="p5__panel" role="tabpanel" aria-label="门店明细">
          <section class="p5__card">
            <header class="p5__card-head">
              <h2 class="p5__card-title">门店明细（按健康分升序）</h2>
              <span>共 {{ overview.storeRows.length }} 家重点店</span>
            </header>

            <div class="p5__filters">
              <input
                v-model="searchTerm"
                type="search"
                class="p5__search"
                placeholder="搜索门店名"
                aria-label="按门店名搜索"
              />
              <select v-model="levelFilter" class="p5__select" aria-label="按健康档筛选">
                <option value="attention">风险 + 预警（默认）</option>
                <option value="all">全部健康档</option>
                <option value="risk">仅风险</option>
                <option value="warning">仅预警</option>
                <option value="good">仅良好</option>
                <option value="excellent">仅优秀</option>
              </select>
              <span class="p5__filter-count">当前 {{ filteredStoreRows.length }} 家</span>
            </div>

            <div class="p5__table-wrap">
              <table class="p5__table">
                <thead>
                  <tr>
                    <th class="p5__col-store">门店</th>
                    <th class="p5__col-sortable p5__col-score" :aria-sort="ariaSortFor('score')">
                      <button type="button" class="p5__sort" :class="{ 'is-active': sortKey === 'score' }" @click="toggleSort('score')">
                        健康分
                        <span class="p5__sort-icon" aria-hidden="true">{{ sortIconFor('score') }}</span>
                        <span class="u-sr-only">{{ sortKey === 'score' ? (sortAsc ? '升序' : '降序') : '点击按健康分排序' }}</span>
                      </button>
                    </th>
                    <th>主要问题</th>
                    <th class="p5__col-sortable p5__col-week" :aria-sort="ariaSortFor('weekDelta')">
                      <button type="button" class="p5__sort" :class="{ 'is-active': sortKey === 'weekDelta' }" @click="toggleSort('weekDelta')">
                        周变化
                        <span class="p5__sort-icon" aria-hidden="true">{{ sortIconFor('weekDelta') }}</span>
                        <span class="u-sr-only">{{ sortKey === 'weekDelta' ? (sortAsc ? '升序' : '降序') : '点击按周变化排序' }}</span>
                      </button>
                    </th>
                    <th class="p5__col-action" />
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="r in pagedStoreRows"
                    :key="r.storeId"
                    :class="{ 'is-clickable': canViewDetail(r.storeId) }"
                    :tabindex="canViewDetail(r.storeId) ? 0 : undefined"
                    @click="goDetail(r.storeId)"
                    @keydown.enter="goDetail(r.storeId)"
                  >
                    <td class="p5__col-store">
                      <span
                        class="p5__store-name"
                        :title="`${r.storeName}（周变化 ${r.weekDelta > 0 ? '+' : ''}${r.weekDelta}）`"
                        >{{ r.storeName }}</span
                      >
                      <!-- <1280 时「周变化」列收起，数据以次行保留（不丢数据），≥1280 隐藏 -->
                      <span
                        class="p5__week-inline"
                        :class="r.weekDelta > 0 ? 'is-up' : r.weekDelta < 0 ? 'is-down' : ''"
                      >
                        周变化 {{ r.weekDelta > 0 ? '+' : '' }}{{ r.weekDelta }}
                      </span>
                    </td>
                    <td class="p5__col-score">
                      <span class="p5__score" :style="{ color: `var(--level-${r.level})` }">{{ r.score }}</span>
                      <HealthBadge :level="r.level" />
                    </td>
                    <td :title="r.mainIssue">{{ r.mainIssue }}</td>
                    <td
                      class="p5__col-week"
                      :class="r.weekDelta > 0 ? 'is-up' : r.weekDelta < 0 ? 'is-down' : ''"
                    >
                      {{ r.weekDelta > 0 ? '+' : '' }}{{ r.weekDelta }}
                    </td>
                    <td class="p5__col-action">
                      <button
                        v-if="canViewDetail(r.storeId)"
                        type="button"
                        class="p5__link"
                        @click.stop="goDetail(r.storeId)"
                      >
                        查看详情
                      </button>
                      <span v-else class="p5__link-disabled" title="该门店仅有看板汇总数据，未采集货架实拍诊断">
                        仅看板数据
                      </span>
                    </td>
                  </tr>
                  <tr v-if="!pagedStoreRows.length">
                    <td colspan="5" class="p5__empty">没有符合筛选条件的门店</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <nav class="p5__pager" aria-label="门店明细表分页">
              <button type="button" class="p5__page-btn" :disabled="page <= 1" @click="goPage(page - 1)">
                上一页
              </button>
              <span class="p5__page-info">第 {{ page }} / {{ totalPages }} 页 · 每页 {{ PAGE_SIZE }} 条</span>
              <button
                type="button"
                class="p5__page-btn"
                :disabled="page >= totalPages"
                @click="goPage(page + 1)"
              >
                下一页
              </button>
            </nav>
          </section>
        </div>

        <!-- ══════════ 区三：任务闭环 ══════════ -->
        <div v-show="activeTab === 'loop'" class="p5__panel" role="tabpanel" aria-label="任务闭环">
          <div class="p5__loop">
            <!-- 整改闭环（已整改 / 进行中 / 平均提升分） -->
            <section class="p5__card">
              <header class="p5__card-head">
                <h2 class="p5__card-title">
                  <AppIcon name="check-circle" :size="14" /> 整改闭环
                </h2>
                <span>本区域</span>
              </header>
              <div class="p5__loop-stats">
                <div class="p5__loop-stat">
                  <p class="p5__loop-num">{{ overview.rectification?.done ?? 0 }}</p>
                  <p class="p5__loop-cap">已整改条目</p>
                </div>
                <div class="p5__loop-stat">
                  <p class="p5__loop-num" :class="{ 'is-warn': (overview.rectification?.open ?? 0) > 0 }">
                    {{ overview.rectification?.open ?? 0 }}
                  </p>
                  <p class="p5__loop-cap">进行中任务</p>
                </div>
                <div class="p5__loop-stat">
                  <p class="p5__loop-num is-up">+{{ overview.rectification?.avgGain ?? 0 }}</p>
                  <p class="p5__loop-cap">平均提升分</p>
                </div>
              </div>
            </section>

            <!-- 本周订货汇总（店主下单 → 业代接单 → 经理汇总） -->
            <section class="p5__card">
              <header class="p5__card-head">
                <h2 class="p5__card-title">
                  <AppIcon name="cart" :size="14" /> 本周订货汇总
                </h2>
                <span>店主自助下单</span>
              </header>
              <div class="p5__loop-stats">
                <div class="p5__loop-stat">
                  <p class="p5__loop-num">{{ orderSummary.count }}</p>
                  <p class="p5__loop-cap">订货笔数</p>
                </div>
                <div class="p5__loop-stat">
                  <p class="p5__loop-num">{{ orderSummary.bottles }}</p>
                  <p class="p5__loop-cap">订货瓶数</p>
                </div>
                <div class="p5__loop-stat">
                  <p class="p5__loop-num">¥{{ orderSummary.amount }}</p>
                  <p class="p5__loop-cap">订货金额</p>
                </div>
              </div>
              <!-- 已接单 / 待接单（来自 overview.orderSummary，接单状态真落库） -->
              <div class="p5__accept">
                <span class="p5__accept-item">
                  已接单 <b>{{ orderSummary.accepted }}</b>
                </span>
                <span class="p5__accept-sep">/</span>
                <span class="p5__accept-item">
                  待接单 <b :class="{ 'is-warn': orderSummary.pending > 0 }">{{ orderSummary.pending }}</b>
                </span>
              </div>
            </section>

            <!-- 任务完成率（派了 → 做了没有 → 闭环的最后一眼） -->
            <section class="p5__card">
              <header class="p5__card-head">
                <h2 class="p5__card-title">
                  <AppIcon name="check" :size="14" /> 任务完成率
                </h2>
                <span>经理下派任务的执行闭环</span>
              </header>
              <div class="p5__loop-stats">
                <div class="p5__loop-stat">
                  <p class="p5__loop-num">{{ taskSummary.done }}/{{ taskSummary.total }}</p>
                  <p class="p5__loop-cap">已完成 / 总数</p>
                </div>
                <div class="p5__loop-stat">
                  <p class="p5__loop-num">{{ taskSummary.rate }}<em>%</em></p>
                  <p class="p5__loop-cap">完成率</p>
                </div>
                <div class="p5__loop-stat">
                  <p class="p5__loop-num" :class="{ 'is-warn': taskSummary.overdue > 0 }">{{ taskSummary.overdue }}</p>
                  <p class="p5__loop-cap">逾期未完成</p>
                </div>
              </div>
              <!-- 完成率进度条：宽度 = done/total，与上方数字同源 -->
              <div class="p5__bar" role="img" :aria-label="`任务完成率 ${taskSummary.rate}%`">
                <div class="p5__bar-fill" :style="{ width: `${taskSummary.rate}%` }" />
              </div>
            </section>
          </div>

          <!-- 口径小字：三卡共用，全页只出现一次 -->
          <p class="p5__caliber p5__caliber--foot">
            口径：{{ overview.regionName }}全量 {{ overview.regionStoreTotal }}
            家门店（含预置样本 S1–S5，按健康分升序）；完成率 = 已完成 ÷（已完成 + 进行中），逾期按数据基准日
            2026-10-02 判定。
          </p>
        </div>
      </template>
    </div>

    <!-- 下派任务弹层：全看板唯一实例（风险卡 / 行内按钮 / AI 晨报共用） -->
    <TaskDispatchDialog
      :visible="showDispatch"
      :stores="dispatchStores"
      :initial-store-id="dispatchPreset.storeId"
      :initial-task-type="dispatchPreset.taskType"
      :initial-due-at="dispatchPreset.dueAt"
      :initial-note="dispatchPreset.note"
      @close="showDispatch = false"
      @dispatched="onDispatched"
    />
  </div>
</template>

<style scoped>
.p5 {
  min-height: 100vh;
  background: var(--bg-page);
}

/* 企业级内容容器：4K 不拉宽（max-width 锁定 1760 居中），窄屏自适应。
   纵向内边距随视口高度轻微伸缩：13 寸 800p 矮屏自动收紧，给首屏信息让位。 */
.p5__body {
  max-width: 1760px;
  margin: 0 auto;
  padding: clamp(12px, 1.7vh, 16px) 24px 24px;
}

/* ── 三区分段控件 ── */
.p5__tabs {
  display: inline-flex;
  gap: 2px;
  margin-bottom: var(--space-3, 12px);
  padding: 3px;
  border-radius: 999px;
  background: #e9ede9;
}

.p5__tab {
  min-height: 32px;
  padding: 5px 18px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast) ease, color var(--dur-fast) ease;
}

.p5__tab:hover {
  color: var(--text-1);
}

.p5__tab.is-active {
  background: #fff;
  color: var(--text-1);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

.p5__tab:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.p5__panel {
  display: flex;
  flex-direction: column;
  /* 区块间距随高度轻微收紧：800p 矮屏 10px，常规屏封顶 12px（不随 4K 拉大） */
  gap: clamp(10px, 1.4vh, 12px);
}

/* KPI */
.p5__kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  /* 大屏间距轻微放宽、封顶；13 寸保持紧凑密度 */
  gap: clamp(10px, 0.85vw, 16px);
}

.p5__kpi {
  padding: clamp(10px, 1.5vh, 14px) clamp(13px, 1vw, 16px);
  border-radius: var(--radius-card);
  background: #fff;
  box-shadow: var(--shadow-card);
  cursor: pointer;
  transition: transform var(--dur-fast) ease, background var(--dur-fast) ease;
}

.p5__kpi:hover {
  transform: translateY(-2px);
  background: #f7f9f7;
}

.p5__kpi:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.p5__kpi-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: clamp(12px, 0.88vw, 13px);
  color: var(--text-3);
}

.p5__kpi-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--level-risk);
  /* 警报疲劳：只播 2 次后停止，不再无限脉冲；且仅在指标确有恶化时渲染 */
  animation: pulse 1.4s ease 2;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.p5__kpi-value {
  margin-top: 4px;
  /* 大数字：1280 约 27px（13 寸略收紧保密度），1440 基准 30px 保持不变，
     1536 起封顶 32px；2K/4K 停在 32px，不等比放大成方块字 */
  font-size: clamp(26px, 2.08vw, 32px);
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.p5__kpi-value.is-danger {
  color: var(--level-risk);
}

.p5__kpi-value em {
  margin-left: 5px;
  font-size: 13px;
  font-style: normal;
  font-weight: 600;
}

.p5__kpi-value em.is-up {
  color: var(--mn-green);
}

.p5__kpi-value em.is-down {
  color: var(--level-risk);
}

/* 持平：中性灰。不定义时会被前一条 is-down 的红色兜住，语义错误 */
.p5__kpi-value em.is-flat {
  color: var(--text-3);
}

.p5__kpi-target {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--text-3);
}

/* 整改闭环三卡：auto-fit 修复三卡孤儿（窄屏自动降列） */
.p5__loop {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: clamp(10px, 0.85vw, 16px);
}

.p5__loop-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.p5__loop-stat {
  padding: 10px 8px;
  border-radius: 10px;
  background: var(--bg-page);
  text-align: center;
}

.p5__loop-num {
  font-size: 19px;
  font-weight: 800;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.p5__loop-num.is-up {
  color: var(--mn-green-dark);
}

.p5__loop-num.is-warn {
  color: var(--level-warning);
}

.p5__loop-cap {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
}

/* 已接单 / 待接单 */
.p5__accept {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 10px;
  padding: 7px 10px;
  border-radius: 10px;
  background: var(--bg-page);
  font-size: 12px;
  color: var(--text-2);
}

.p5__accept-item b {
  font-weight: 800;
  color: var(--mn-green-dark);
  font-variant-numeric: tabular-nums;
}

.p5__accept-item b.is-warn {
  color: var(--level-warning);
}

.p5__accept-sep {
  color: var(--text-3);
}

/* 任务完成率进度条 */
.p5__bar {
  height: 6px;
  margin: 10px 0 6px;
  border-radius: 999px;
  background: #eef1ef;
  overflow: hidden;
}

.p5__bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #009639, #8bc34a);
  transition: width 0.4s ease;
}

.p5__loop-num em {
  font-style: normal;
  font-size: 12px;
  margin-left: 1px;
}

/* 口径小字：三卡合并为闭环区底部一处 */
.p5__caliber {
  font-size: 10px;
  color: var(--text-3);
}

.p5__caliber--foot {
  margin: 2px 0 0;
  text-align: center;
  line-height: 1.7;
}

.p5__charts {
  display: grid;
  grid-template-columns: 0.9fr 1.6fr;
  gap: clamp(10px, 0.85vw, 14px);
}

.p5__trend-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--mn-green);
}

/* 下派：AI 动作统一紫色 */
.p5__dispatch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: 999px;
  background: var(--ai-purple);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast) ease;
}

.p5__dispatch:hover {
  background: var(--ai-purple-2);
}

.p5__card {
  padding: clamp(11px, 1.5vh, 14px) clamp(14px, 1vw, 16px);
  border-radius: var(--radius-card);
  background: #fff;
  box-shadow: var(--shadow-card);
}

.p5__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: clamp(8px, 1.2vh, 10px);
  font-size: 13.5px;
}

.p5__card-head span {
  font-size: 11.5px;
  color: var(--text-3);
}

/* 区块主标题（h2，视觉沿用原 <b> 字号）：1440 基准 13.5px 保持，clamp 封顶 15px，4K 不放大 */
.p5__card-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  font-size: clamp(13px, 0.94vw, 15px);
  font-weight: 700;
  color: var(--text-1);
}

/* ── 明细区：搜索 / 筛选 / 分页 ── */
.p5__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.p5__search,
.p5__select {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: #fff;
  color: var(--text-1);
  /* ≥14px：避免输入聚焦时 iOS 自动放大 */
  font-size: 14px;
}

.p5__search {
  width: 220px;
  max-width: 100%;
}

.p5__search:focus,
.p5__select:focus {
  outline: none;
  border-color: var(--mn-green);
  box-shadow: 0 0 0 2px var(--mn-green-light);
}

.p5__filter-count {
  font-size: 12px;
  color: var(--text-3);
}

.p5__table-wrap {
  overflow-x: auto;
}

.p5__table {
  width: 100%;
  /* 5 列全显示时的保底宽度：1280 视口下卡片内容宽约 1200px，无需横向滚动；
     更窄时外层 overflow-x 兜底，列不挤压 */
  min-width: 640px;
  border-collapse: collapse;
  font-size: 12.5px;
}

/* 列宽口径：固定列定宽、问题列吃剩余空间，1280 下各列不互相抢 */
.p5__col-store {
  width: 190px;
  max-width: 220px;
}

.p5__col-score {
  width: 128px;
  white-space: nowrap;
}

.p5__col-week {
  width: 88px;
  white-space: nowrap;
}

.p5__col-action {
  width: 116px;
  white-space: nowrap;
}

/* 门店名单行省略（完整名与周变化在 title 里可悬停查看） */
.p5__store-name {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 窄屏（<1280）「周变化」列收起后，数据在门店名下方以次行保留，默认隐藏 */
.p5__week-inline {
  display: none;
  margin-top: 1px;
  font-size: 11px;
  color: var(--text-3);
}

.p5__week-inline.is-up {
  color: var(--mn-green);
}

.p5__week-inline.is-down {
  color: var(--level-risk);
}

/* 可排序表头：按钮铺满单元格、与原表头视觉一致；方向箭头常驻避免跳动 */
.p5__table th.p5__col-sortable {
  padding: 0;
}

.p5__sort {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-3);
  font-size: 12.5px;
  font-weight: 500;
  text-align: left;
  transition: color var(--dur-fast) ease, background var(--dur-fast) ease;
}

.p5__sort:hover {
  color: var(--text-1);
  background: #f7f9f7;
}

.p5__sort:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.p5__sort-icon {
  font-size: 11px;
  line-height: 1;
  color: var(--text-4);
}

.p5__sort.is-active {
  color: var(--text-1);
}

.p5__sort.is-active .p5__sort-icon {
  color: var(--mn-green);
}

.p5__table th {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-3);
  font-weight: 500;
  text-align: left;
}

.p5__table td {
  padding: 8px;
  border-bottom: 1px dashed var(--border-color);
}

/* 桌面微交互：行 hover 仅变底色；可点行（S1–S5）显示指针与键盘焦点 */
.p5__table tbody tr {
  transition: background var(--dur-fast) ease;
}

.p5__table tbody tr:hover td {
  background: #f7f9f7;
}

.p5__table tbody tr.is-clickable {
  cursor: pointer;
}

.p5__table tbody tr:focus-visible {
  outline: none;
}

.p5__table tbody tr:focus-visible td {
  box-shadow: inset 0 0 0 2px var(--mn-green);
}

.p5__empty {
  padding: 24px 8px !important;
  color: var(--text-3);
  text-align: center;
}

.p5__pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
}

.p5__page-info {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.p5__page-btn {
  min-height: 30px;
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: #fff;
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
  transition: background var(--dur-fast) ease, color var(--dur-fast) ease;
}

.p5__page-btn:hover:not(:disabled) {
  border-color: var(--mn-green);
  color: var(--mn-green-dark);
}

.p5__page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.p5__page-btn:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.p5__score {
  margin-right: 6px;
  font-size: 15px;
  font-weight: 700;
}

.p5__table .is-up {
  color: var(--mn-green);
}

.p5__table .is-down {
  color: var(--level-risk);
}

/* 链接补点击内边距（菲茨定律），hover/焦点有底色 */
.p5__link {
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--mn-green);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast) ease;
}

.p5__link:hover {
  background: var(--mn-green-light);
}

.p5__link:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

/* 无诊断数据门店的占位说明：弱化样式，表明「此处不可点」而非可点入口 */
.p5__link-disabled {
  display: inline-block;
  padding: 6px 8px;
  color: var(--text-3);
  font-size: 12px;
  cursor: not-allowed;
}

/* 风险行：hover 底色 + 轻微上浮，可键盘聚焦 */
.p5__risk {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 8px;
  border-radius: 8px;
  border-bottom: 1px dashed var(--border-color);
  transition: transform var(--dur-fast) ease, background var(--dur-fast) ease;
}

.p5__risk:hover {
  transform: translateY(-1px);
  background: #f7f9f7;
}

.p5__risk:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.p5__risk-no {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  /* 颜色由行内 level 决定：第 1 名红，其余按橙/黄绿档（拿不到 level 时兜底红） */
  background: var(--level-risk);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.p5__risk-main {
  flex: 1;
  min-width: 0;
}

.p5__risk-name {
  font-size: 13px;
  font-weight: 600;
}

.p5__risk-reason {
  font-size: 11px;
  color: var(--text-3);
}

.p5__risk-score {
  flex: none;
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* 风险行内下派：浅紫描边按钮（AI 动作紫，确认在弹层绿色主按钮） */
.p5__risk-dispatch {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  border: 1px solid var(--ai-purple);
  border-radius: 999px;
  background: var(--ai-purple-light);
  color: var(--ai-purple);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast) ease, color var(--dur-fast) ease;
}

.p5__risk-dispatch:hover {
  background: var(--ai-purple);
  color: #fff;
}

.p5__risk-dispatch:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

/* ═══════════════ 响应式：宽度 × 高度 矩阵 ═══════════════ */

/* 13 寸档（≤1366，覆盖 1280×800 评委机与 1366×768）：两侧留白收到 16px，把宽度让给内容 */
@media (max-width: 1366px) {
  .p5__body {
    padding-left: 16px;
    padding-right: 16px;
  }
}

/* <1280：次要列「周变化」收起（display:none 仍在 DOM，不丢数据），
   同值以次行形式保留在门店名下方（含涨跌色），悬停门店名 title 也可查看；
   表格保底宽度同步收窄，避免被迫横滚 */
@media (max-width: 1279px) {
  .p5__table {
    min-width: 560px;
  }

  .p5__col-week {
    display: none;
  }

  .p5__week-inline {
    display: block;
  }
}

/* 窄屏降列：1024 图表/明细单列；768 KPI 与闭环单列 */
@media (max-width: 1024px) {
  .p5__kpis {
    grid-template-columns: repeat(2, 1fr);
  }

  .p5__charts {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .p5__body {
    padding: 12px;
  }

  .p5__kpis {
    grid-template-columns: 1fr;
  }

  .p5__loop {
    grid-template-columns: 1fr;
  }

  .p5__tab {
    padding: 5px 12px;
  }

  .p5__search {
    width: 100%;
  }
}

/* 矮屏（≤860p，含 13 寸 800p）：再压一档纵向间距，
   保证首屏 KPI → AI 晨报/关键动作 → 图表标题可见，风险 Top5 尽量露头 */
@media (max-height: 860px) {
  .p5__tabs {
    margin-bottom: 8px;
  }

  .p5__panel {
    gap: 10px;
  }

  .p5__card-head {
    margin-bottom: 8px;
  }

  .p5__risk {
    padding-top: 8px;
    padding-bottom: 8px;
  }
}

/* 无障碍：系统开启「减少动态效果」时，本页悬浮位移/脉冲/过渡全部降级
   （motion.css 只兜底 .mot-* 工具类，scoped 动效需在此收口） */
@media (prefers-reduced-motion: reduce) {
  .p5__kpi,
  .p5__risk,
  .p5__table tbody tr,
  .p5__tab,
  .p5__dispatch,
  .p5__risk-dispatch,
  .p5__page-btn,
  .p5__link,
  .p5__sort,
  .p5__bar-fill {
    transition-duration: 0.01ms !important;
  }

  .p5__kpi:hover,
  .p5__risk:hover {
    transform: none;
  }

  .p5__kpi-dot {
    animation: none;
  }
}

/* 打印 / PDF / 大屏演示导出：只留 KPI、卡片、图表与表格内容。
   Tab、筛选、分页、下派按钮与操作列不输出；卡片去投影改细边框，避免大面积灰底。
   注意：仅打印当前激活的 Tab（v-show 隐藏面板不输出）。
   DesktopHeader 在本组件作用域外，未在此隐藏（见交付报告说明）。 */
@media print {
  .p5 {
    background: var(--bg-card);
  }

  .p5__body {
    max-width: none;
    padding: 0;
  }

  .p5__tabs,
  .p5__dispatch,
  .p5__risk-dispatch,
  .p5__filters,
  .p5__pager,
  .p5__col-action {
    display: none;
  }

  .p5__kpi,
  .p5__card {
    box-shadow: none;
    border: 1px solid var(--border-color);
    break-inside: avoid;
  }

  .p5__kpi:hover,
  .p5__risk:hover {
    transform: none;
    background: var(--bg-card);
  }

  .p5__charts {
    grid-template-columns: 1fr 1fr;
  }

  .p5__table td,
  .p5__table th {
    padding: 4px 6px;
  }
}
</style>
