<script setup lang="ts">
/**
 * StoreProfileView（/manager/store/:storeId）—— AI 门店体检报告。
 *
 * 全部数据来自 `GET /stores/:id/profile`（与后端 findStore/diagnoses 真实字段同源）。
 * 数据诚实硬约束：
 *  - hasDiagnosis === false 时显式提示「分数来自门店档案 lastScore 兜底」，不伪装成 AI 结果；
 *  - 无诊断门店 dimensions / issueTypes 为空数组（后端不补假分），图表显式走空态；
 *  - 「AI 归因」先拉结构化底稿（纯数据，不调模型）如实展示，再可选叠加模型生成归因文字，
 *    并按 done 帧的 source 标注来源。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as echarts from 'echarts'
import DesktopHeader from '@/components/layout/DesktopHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import HealthBadge from '@/components/common/HealthBadge.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import MilkDropLoader from '@/components/common/MilkDropLoader.vue'
import { useToast } from '@/composables/useToast'
import { useCountUp } from '@/composables/useCountUp'
import { useSessionStore } from '@/stores/session'
import { useStoreFavorites } from '@/composables/useStoreFavorites'
import { getStoreProfile, getStoreAttribution, exportStoresCsv, streamAiAsk } from '@/api/insights'
import type { StoreProfile, StoreAttribution } from '@/api/insights'
import type { HealthLevelKey } from '@/types'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { success, info, error: toastError } = useToast()

const storeId = computed<string>(() => String(route.params.storeId ?? ''))

/* ── 收藏 / 重点关注（按登录账号隔离，与「我的」页列表同源） ── */
const favorites = useStoreFavorites()
const isFav = computed<boolean>(() => favorites.isFavorite(storeId.value))
function onToggleFav(): void {
  const name = profile.value?.store?.name
  if (!name) return
  void favorites.toggle({ id: storeId.value, name })
}

const profile = ref<StoreProfile | null>(null)
const loading = ref<boolean>(true)
const loadError = ref<boolean>(false)

/** ECharts 实例（统一在 onBeforeUnmount 销毁 + 移除 resize 监听） */
const trendEl = ref<HTMLElement | null>(null)
const radarEl = ref<HTMLElement | null>(null)
const issueEl = ref<HTMLElement | null>(null)
const charts: echarts.ECharts[] = []

/** 主题观察：<html data-theme> 日/夜切换后按新令牌重建图表，卸载时断开 */
let themeObserver: MutationObserver | null = null

/**
 * 图表取色（canvas 读不到 CSS var → 用 getComputedStyle 解析当前主题令牌）。
 * 从图表容器自身读取：自定义属性沿 DOM 继承，手机壳（.dxc-phone-light）
 * 内自动读到壳上的日令牌；桌面经理端则读到全局日/夜值。
 */
function cssVar(name: string, fallback: string): string {
  const node = trendEl.value ?? radarEl.value ?? issueEl.value ?? document.documentElement
  const v = getComputedStyle(node).getPropertyValue(name).trim()
  return v || fallback
}

/** 给 #rgb / #rrggbb 令牌色附加透明度（面积 / 网格晕染用）；非 hex 输入原样返回 */
function withAlpha(color: string, alpha: number): string {
  const m = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return color
  let hex = m[1]
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** 四档色令牌意外缺失时的日间兜底（正常路径始终读 --level-* 夜间提亮值） */
const LEVEL_HEX: Record<string, string> = {
  excellent: '#00a64d',
  good: '#8bbf3a',
  warning: '#ef8a1e',
  risk: '#e03225',
}

const healthLevel = computed<HealthLevelKey>(
  () => (profile.value?.health.level as HealthLevelKey) || 'good',
)

/* ═══════════════ 动效：关键数字滚动 ═══════════════
   countup 只负责滚到目标值，展示文本仍按原始值的小数位还原，
   保证与改造前逐字一致（健康分无值时保留「—」），口径与文案不变。 */

/** 原值的小数位（最多 2 位） */
function decimalsOf(n: number): number {
  if (!Number.isFinite(n)) return 0
  const s = String(n)
  const dot = s.indexOf('.')
  return dot < 0 ? 0 : Math.min(2, s.length - dot - 1)
}

/** 纯数字滚动文本：目标值来自 getter，展示格式跟随原始值 */
function useCountText(target: () => number) {
  const c = useCountUp(target, { decimals: 0 })
  return computed(() => c.value.value.toFixed(decimalsOf(Number(target()))))
}

/** 健康分（无值时保持「—」，不做无意义的 0 滚动） */
const scoreCount = useCountUp(() => Number(profile.value?.health.score ?? 0), { decimals: 0 })
const healthScore = computed<string>(() => {
  const s = profile.value?.health.score
  if (s === null || s === undefined) return '—'
  return scoreCount.value.value.toFixed(decimalsOf(Number(s)))
})

/* 关联任务 / 单据 小结数字滚动 */
const taskTotalText = useCountText(() => profile.value?.tasksSummary.total ?? 0)
const taskOpenText = useCountText(() => profile.value?.tasksSummary.open ?? 0)
const taskDoneText = useCountText(() => profile.value?.tasksSummary.done ?? 0)
const ticketCountText = useCountText(() => profile.value?.ticketsSummary.count ?? 0)
const ticketAmountText = useCountText(() => profile.value?.ticketsSummary.totalAmount ?? 0)
const ticketAcceptedText = useCountText(() => profile.value?.ticketsSummary.acceptedCount ?? 0)
const ticketRectText = useCountText(() => profile.value?.ticketsSummary.rectificationTicketCount ?? 0)

const delta = computed<number>(() => Number(profile.value?.health.delta ?? 0))
const hasDiagnosis = computed<boolean>(() => profile.value?.hasDiagnosis === true)

/** 巡店分按健康档位着色（<60 风险 / <70 预警 / <85 良好 / ≥85 优秀），无色值时用中性灰 */
function scoreColor(s: number | null | undefined): string {
  if (s === null || s === undefined) return 'var(--text-3)'
  const n = Number(s)
  if (!Number.isFinite(n)) return 'var(--text-3)'
  if (n >= 85) return 'var(--level-excellent)'
  if (n >= 70) return 'var(--level-good)'
  if (n >= 60) return 'var(--level-warning)'
  return 'var(--level-risk)'
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = false
  try {
    profile.value = await getStoreProfile(storeId.value)
    await nextTick()
    renderCharts()
  } catch (e) {
    loadError.value = true
    toastError((e as Error)?.message || '门店体检数据加载失败')
  } finally {
    loading.value = false
  }
}

function disposeCharts(): void {
  while (charts.length) charts.pop()?.dispose()
}

/** 渲染三张 ECharts 图（趋势 / 六维雷达 / 问题类型分布） */
function renderCharts(): void {
  disposeCharts()
  const p = profile.value
  if (!p) return
  const textColor = cssVar('--text-3', '#81918a')
  const axisColor = cssVar('--border-color', '#e7efe9')
  // 品牌绿现读令牌（日间 #00b451 / 夜间 #2dd47e），面积透明度由令牌色派生
  const brandColor = cssVar('--brand', '#00b451')
  // tooltip 用抬升表面 + 边框 + 正文色，深底浅底都可读
  const tooltipBg = cssVar('--bg-elevated', '#ffffff')
  const tooltipBorder = cssVar('--border-color', '#e7efe9')
  const tooltipText = cssVar('--text-1', '#14241b')
  const tooltipStyle = {
    backgroundColor: tooltipBg,
    borderColor: tooltipBorder,
    borderWidth: 1,
    textStyle: { color: tooltipText, fontSize: 12 },
  }

  // ① 健康分趋势（渐变面积 + 数值标签）
  if (trendEl.value && p.healthTrend.length) {
    const c = echarts.init(trendEl.value)
    charts.push(c)
    c.setOption({
      grid: { left: 8, right: 16, top: 28, bottom: 6, containLabel: true },
      tooltip: { trigger: 'axis', ...tooltipStyle },
      xAxis: {
        type: 'category',
        data: p.healthTrend.map((d) => d.week),
        axisLine: { lineStyle: { color: axisColor } },
        axisLabel: { color: textColor, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        splitLine: { lineStyle: { color: axisColor, type: 'dashed' } },
        axisLabel: { color: textColor, fontSize: 11 },
      },
      series: [
        {
          type: 'line',
          smooth: true,
          data: p.healthTrend.map((d) => d.score),
          symbolSize: 7,
          label: { show: true, color: cssVar('--text-2', '#4a5d52'), fontSize: 11 },
          lineStyle: { width: 3, color: brandColor },
          itemStyle: { color: brandColor },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: withAlpha(brandColor, 0.32) },
              { offset: 1, color: withAlpha(brandColor, 0.02) },
            ]),
          },
        },
      ],
    })
  }

  // ② 六维雷达
  if (radarEl.value && p.dimensions.length) {
    const c = echarts.init(radarEl.value)
    charts.push(c)
    c.setOption({
      tooltip: { ...tooltipStyle },
      radar: {
        indicator: p.dimensions.map((d) => ({ name: d.label, max: 100 })),
        radius: '62%',
        axisName: { color: textColor, fontSize: 11 },
        splitLine: { lineStyle: { color: axisColor } },
        splitArea: {
          areaStyle: { color: [withAlpha(brandColor, 0.03), withAlpha(brandColor, 0.07)] },
        },
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: p.dimensions.map((d) => d.score),
              name: '六维得分',
              areaStyle: { color: withAlpha(brandColor, 0.26) },
              lineStyle: { color: brandColor, width: 2 },
              itemStyle: { color: brandColor },
            },
          ],
        },
      ],
    })
  }

  // ③ 问题类型分布（横向条形；颜色读四档令牌，夜间自动取提亮档）
  if (issueEl.value && p.issueTypes.length) {
    const c = echarts.init(issueEl.value)
    charts.push(c)
    const ordered = [...p.issueTypes].reverse()
    c.setOption({
      grid: { left: 8, right: 26, top: 10, bottom: 6, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...tooltipStyle },
      xAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: axisColor, type: 'dashed' } },
        axisLabel: { color: textColor, fontSize: 11 },
      },
      yAxis: {
        type: 'category',
        data: ordered.map((d) => d.type),
        axisLine: { lineStyle: { color: axisColor } },
        axisLabel: { color: textColor, fontSize: 11 },
      },
      series: [
        {
          type: 'bar',
          data: ordered.map((d) => ({
            value: d.count,
            itemStyle: { color: cssVar(`--level-${d.severity}`, LEVEL_HEX[d.severity] || '#8bbf3a') },
          })),
          barWidth: 16,
          label: { show: true, position: 'right', color: textColor, fontSize: 11 },
        },
      ],
    })
  }
}

function onResize(): void {
  for (const c of charts) c.resize()
}

/* ── 顶部动作 ── */
function goAsk(): void {
  void router.push({
    path: '/manager/ask',
    query: { q: `${profile.value?.store.name ?? '该门店'} 健康分为什么下降？` },
  })
}

async function doExport(): Promise<void> {
  try {
    await exportStoresCsv()
    success('已导出门店明细 CSV（含全区域门店，口径与看板一致）')
  } catch (e) {
    toastError((e as Error)?.message || '导出失败')
  }
}

/* ── AI 归因 ── */
const attribution = ref<StoreAttribution | null>(null)
const attrLoading = ref<boolean>(false)
const attrText = ref<string>('')
const attrSource = ref<'llm' | 'fallback' | null>(null)
const attrStreaming = ref<boolean>(false)
let attrCtrl: AbortController | null = null

async function loadAttribution(): Promise<void> {
  if (attrLoading.value) return
  attrLoading.value = true
  try {
    attribution.value = await getStoreAttribution(storeId.value)
    if (!attribution.value.topIssues.length && !attribution.value.stockFacts) {
      info('该门店暂无诊断底稿，归因仅能基于门店档案分数')
    }
  } catch (e) {
    toastError((e as Error)?.message || '归因底稿加载失败')
  } finally {
    attrLoading.value = false
  }
}

/** 把结构化底稿作为 context 交给模型生成一段归因结论（来源如实标注） */
async function genAttributionText(): Promise<void> {
  if (!attribution.value || attrStreaming.value) return
  attrStreaming.value = true
  attrText.value = ''
  attrSource.value = null
  attrCtrl = new AbortController()
  try {
    const res = await streamAiAsk(
      `请基于归因底稿，用不超过 180 字说明${attribution.value.storeName}健康分波动的主要原因与改进建议。`,
      (d) => {
        attrText.value += d
      },
      {
        region: undefined,
        context: JSON.stringify(attribution.value).slice(0, 300),
        signal: attrCtrl.signal,
      },
    )
    attrSource.value = res.source
    if (!res.ok && !attrText.value) attrText.value = '归因文字生成失败，请稍后重试。'
  } catch {
    attrText.value = attrText.value || '归因文字生成失败，请稍后重试。'
  } finally {
    attrStreaming.value = false
    attrCtrl = null
  }
}

watch(storeId, () => {
  attribution.value = null
  attrText.value = ''
  void load()
})

onMounted(() => {
  void load()
  void favorites.load()
  window.addEventListener('resize', onResize)
  // 观察 <html> 的 data-theme：日/夜切换后按新令牌重建三张图
  if (typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => {
      if (profile.value && !loading.value) renderCharts()
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  }
})

onBeforeUnmount(() => {
  attrCtrl?.abort()
  disposeCharts()
  themeObserver?.disconnect()
  themeObserver = null
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="sp">
    <h1 class="u-sr-only">AI 门店体检报告</h1>

    <DesktopHeader
      :region-ids="[]"
      region-id=""
      :user-name="session.user?.name ?? ''"
      :role-label="session.roleLabel"
      @switch-role="() => {}"
      @change-region="() => {}"
    />

    <div class="sp__body">
      <template v-if="loading">
        <SkeletonBlock height="120px" radius="14px" />
        <SkeletonBlock height="260px" radius="14px" />
      </template>

      <EmptyState
        v-else-if="loadError || !profile"
        icon="warning"
        title="门店体检数据加载失败"
        desc="请确认门店编号是否正确、后端服务是否已启动，然后重试。"
        action-text="重新加载"
        @action="load"
      />

      <template v-else>
        <!-- ① 门店卡 -->
        <section class="u-card sp__card mot-rise">
          <div class="sp__card-main">
            <div class="sp__store">
              <p class="sp__store-name">
                <AppIcon name="store" :size="18" /> {{ profile.store.name }}
              </p>
              <p class="sp__store-meta">
                编号 {{ profile.store.id }} · 区域 {{ profile.store.regionId || '—' }} ·
                {{ profile.store.typeLabel || '门店' }}
              </p>
            </div>

            <div class="sp__health">
              <p class="sp__health-score">{{ healthScore }}</p>
              <div class="sp__health-right">
                <HealthBadge :level="healthLevel" size="md" />
                <span
                  class="sp__delta"
                  :class="delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : 'is-flat'"
                >
                  环比 {{ delta > 0 ? '+' : '' }}{{ delta }}
                </span>
              </div>
            </div>

            <div class="sp__actions">
              <button
                type="button"
                class="u-btn u-btn--ghost sp__fav-btn"
                :class="{ 'is-on': isFav }"
                :aria-pressed="isFav ? 'true' : 'false'"
                :aria-label="isFav ? `取消收藏门店：${profile.store.name}` : `收藏门店：${profile.store.name}`"
                @click="onToggleFav"
              >
                <AppIcon
                  :name="isFav ? 'star-filled' : 'star'"
                  :size="15"
                  :color="isFav ? 'var(--gold)' : undefined"
                />
                {{ isFav ? '已关注' : '关注门店' }}
              </button>
              <button type="button" class="u-btn u-btn--ai" @click="goAsk">
                <AppIcon name="sparkles" :size="15" /> 去 AI 问答
              </button>
              <button type="button" class="u-btn u-btn--ghost" @click="doExport">
                <AppIcon name="download" :size="15" /> 导出该店数据
              </button>
            </div>
          </div>

          <!-- 数据来源提示：无诊断时告诉经理当前分数是历史分，避免误读为最新体检结果 -->
          <p v-if="!hasDiagnosis" class="sp__honest">
            <AppIcon name="warning" :size="13" /> 这家店还没用 AI 体检过，当前显示的是最近一次历史分；
            六维雷达和问题类型会在巡店拍照体检后自动生成。
          </p>
        </section>

        <!-- ② 图表区 -->
        <div class="sp__charts mot-stagger">
          <section class="u-card sp__card">
            <header class="sp__card-head"><h2>健康分趋势</h2><span>近 {{ profile.healthTrend.length }} 个记录点</span></header>
            <div v-if="profile.healthTrend.length" ref="trendEl" class="sp__chart sp__chart--trend" />
            <EmptyState v-else icon="history" title="暂无趋势数据" desc="该门店尚未产生可用的健康分序列。" />
          </section>

          <section class="u-card sp__card">
            <header class="sp__card-head"><h2>六维健康雷达</h2><span>{{ profile.dimensions.length ? '六维加权' : '暂无' }}</span></header>
            <div v-if="profile.dimensions.length" ref="radarEl" class="sp__chart sp__chart--radar" />
            <EmptyState v-else icon="layers" title="暂无六维数据" desc="这家店还没体检过，完成一次巡店拍照后自动生成。" />
          </section>

          <section class="u-card sp__card">
            <header class="sp__card-head"><h2>问题类型分布</h2><span>{{ profile.issueTypes.length }} 类</span></header>
            <div v-if="profile.issueTypes.length" ref="issueEl" class="sp__chart sp__chart--issue" />
            <EmptyState v-else icon="tag" title="暂无问题类型" desc="该门店诊断记录为空，暂无可归类问题。" />
          </section>
        </div>

        <!-- ③ 关联任务 / 单据小结 -->
        <div class="sp__summaries mot-stagger">
          <section class="u-card sp__card">
            <header class="sp__card-head"><h2><AppIcon name="clipboard" :size="14" /> 关联任务</h2></header>
            <div class="sp__stats">
              <div class="sp__stat"><p class="sp__stat-num">{{ taskTotalText }}</p><p class="sp__stat-cap">任务总数</p></div>
              <div class="sp__stat"><p class="sp__stat-num is-warn">{{ taskOpenText }}</p><p class="sp__stat-cap">进行中</p></div>
              <div class="sp__stat"><p class="sp__stat-num is-up">{{ taskDoneText }}</p><p class="sp__stat-cap">已完成</p></div>
            </div>
          </section>

          <section class="u-card sp__card">
            <header class="sp__card-head"><h2><AppIcon name="cart" :size="14" /> 关联单据</h2><span>订货三端打通</span></header>
            <div class="sp__stats">
              <div class="sp__stat"><p class="sp__stat-num">{{ ticketCountText }}</p><p class="sp__stat-cap">订货单笔数</p></div>
              <div class="sp__stat"><p class="sp__stat-num">¥{{ ticketAmountText }}</p><p class="sp__stat-cap">订货总额</p></div>
              <div class="sp__stat"><p class="sp__stat-num is-up">{{ ticketAcceptedText }}</p><p class="sp__stat-cap">已接单</p></div>
              <div class="sp__stat"><p class="sp__stat-num">{{ ticketRectText }}</p><p class="sp__stat-cap">整改回执单</p></div>
            </div>
          </section>
        </div>

        <!-- ④ AI 归因（先结构化底稿，再可选叠加模型文字） -->
        <section class="u-card sp__card mot-rise">
          <header class="sp__card-head">
            <h2><AppIcon name="zap" :size="14" color="var(--ai-purple)" /> AI 归因</h2>
            <button
              type="button"
              class="sp__attr-btn"
              :disabled="attrLoading"
              @click="loadAttribution"
            >
              <MilkDropLoader v-if="attrLoading" size="button" label="" />
              <template v-else><AppIcon name="clipboard" :size="15" />拉取归因底稿</template>
            </button>
          </header>

          <template v-if="attribution">
            <div class="sp__attr-grid mot-stagger">
              <div class="sp__attr-block">
                <h3>健康分拐点</h3>
                <ul v-if="attribution.turningPoints.length" class="sp__attr-list">
                  <li v-for="(t, i) in attribution.turningPoints" :key="i">
                    <span>{{ t.fromWeek }} → {{ t.toWeek }}</span>
                    <b :class="t.delta >= 0 ? 'is-up' : 'is-down'">{{ t.delta > 0 ? '+' : '' }}{{ t.delta }}</b>
                  </li>
                </ul>
                <p v-else class="sp__attr-empty">暂无拐点数据</p>
              </div>

              <div class="sp__attr-block">
                <h3>主要扣分项</h3>
                <ul v-if="attribution.topIssues.length" class="sp__attr-list">
                  <li v-for="is in attribution.topIssues" :key="is.id">
                    <span class="sp__attr-title">{{ is.title }}</span>
                    <b>{{ is.impactWeight }}</b>
                    <em>权重来源：{{ is.weightSource }}</em>
                  </li>
                </ul>
                <p v-else class="sp__attr-empty">暂无扣分项底稿</p>
              </div>

              <div class="sp__attr-block">
                <h3>库存 / 缺货事实</h3>
                <template v-if="attribution.stockFacts">
                  <ul class="sp__attr-list">
                    <li><span>周流失量</span><b>{{ attribution.stockFacts.weeklyBottles }} 瓶</b></li>
                    <li><span>月预计损失</span><b>¥{{ attribution.stockFacts.monthlyAmount }}</b></li>
                    <li><span>建议补货</span><b>{{ attribution.stockFacts.restockPlan.totalBottles }} 瓶</b></li>
                  </ul>
                </template>
                <p v-else class="sp__attr-empty">暂无库存底稿</p>
              </div>
            </div>

            <div class="sp__attr-ai">
              <button type="button" class="u-btn u-btn--ai" :disabled="attrStreaming" @click="genAttributionText">
                <AppIcon name="sparkles" :size="15" /> 让 AI 写一段归因结论
              </button>
              <div v-if="attrText" class="sp__attr-text mot-fade-up">
                <p class="sp__attr-body">{{ attrText }}</p>
                <p class="sp__attr-source">
                  {{ attrSource === 'llm' ? 'AI 生成 · qwen' : attrSource === 'fallback' ? '来自标准答案库（本次未调用大模型）' : '暂未标注来源' }}
                </p>
              </div>
              <MilkDropLoader v-else-if="attrStreaming" size="button" label="" />
            </div>
          </template>
          <p v-else class="sp__attr-hint">点击「拉取归因底稿」查看拐点、扣分项与库存事实（纯数据，不调模型）。</p>
        </section>

        <!-- ⑤ 最近巡店时间线 -->
        <section class="u-card sp__card">
          <header class="sp__card-head"><h2><AppIcon name="history" :size="14" /> 最近巡店</h2><span>{{ profile.visits.length }} 条</span></header>
          <ul v-if="profile.visits.length" class="sp__timeline mot-stagger">
            <li v-for="v in profile.visits" :key="v.id" class="sp__tl-item">
              <span class="sp__tl-dot" />
              <div class="sp__tl-main">
                <p class="sp__tl-time">{{ v.visitedAt }}</p>
                <p class="sp__tl-meta">
                  第 {{ v.visitNo ?? '—' }} 次巡店 · 状态 {{ v.status || '—' }} · 业代 {{ v.repId || '—' }}
                </p>
              </div>
              <span class="sp__tl-score" :style="{ color: scoreColor(v.score) }">
                {{ v.score === null || v.score === undefined ? '—' : v.score }}
              </span>
            </li>
          </ul>
          <EmptyState v-else icon="history" title="暂无巡店记录" desc="该门店还没有产生巡店数据。" />
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sp {
  min-height: 100vh;
  background: var(--bg-page);
}

.sp__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 1760px;
  margin: 0 auto;
  padding: 16px 24px 28px;
}

.sp__card {
  padding: 14px 16px;
}

.sp__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.sp__card-head h2 {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.sp__card-head span {
  font-size: 11.5px;
  color: var(--text-3);
}

/* ① 门店卡 */
.sp__card-main {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.sp__store {
  flex: 1;
  min-width: 220px;
}

.sp__store-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 18px;
  font-weight: 800;
  color: var(--text-1);
}

.sp__store-meta {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--text-3);
}

.sp__health {
  display: flex;
  align-items: center;
  gap: 14px;
}

.sp__health-score {
  font-size: 46px;
  font-weight: 800;
  line-height: 1;
  color: var(--mn-green-dark);
  font-variant-numeric: tabular-nums;
}

.sp__health-right {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.sp__delta {
  font-size: 12px;
  font-weight: 600;
}

.sp__delta.is-up { color: var(--mn-green); }
.sp__delta.is-down { color: var(--level-risk); }
.sp__delta.is-flat { color: var(--text-3); }

.sp__actions {
  display: flex;
  gap: 10px;
}

/* 关注门店按钮：已关注时描边/底色转「品质金」，与星标同色语义 */
.sp__fav-btn.is-on {
  border-color: var(--gold);
  background: color-mix(in srgb, var(--gold) 14%, var(--bg-card));
}

.sp__fav-btn:focus-visible {
  outline: 2px solid var(--mn-green);
  outline-offset: 2px;
}

.sp__honest {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--warning-bg);
  color: var(--warning-fg);
  font-size: 12px;
  font-weight: 600;
}

/* ② 图表 */
.sp__charts {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 14px;
}

.sp__chart {
  width: 100%;
}

.sp__chart--trend { height: 260px; }
.sp__chart--radar { height: 260px; }

.sp__charts > .sp__card:last-child {
  grid-column: 1 / -1;
}

.sp__chart--issue { height: 220px; }

/* ③ 小结 */
.sp__summaries {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 14px;
}

.sp__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
  gap: 8px;
}

.sp__stat {
  padding: 12px 8px;
  border-radius: 10px;
  background: var(--bg-page);
  text-align: center;
}

.sp__stat-num {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.sp__stat-num.is-up { color: var(--mn-green-dark); }
.sp__stat-num.is-warn { color: var(--level-warning); }

.sp__stat-cap {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--text-3);
}

/* ④ 归因 */
.sp__attr-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border: none;
  border-radius: 999px;
  background: var(--ai-purple);
  /* 与全局 AI 按钮同惯例：日间奶白、夜间深字配提亮紫 */
  color: var(--milk);
  font-size: 12px;
  font-weight: 600;
}

.sp__attr-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.sp__attr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.sp__attr-block {
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-page);
}

.sp__attr-block h3 {
  margin-bottom: 8px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-2);
}

.sp__attr-list li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px dashed var(--border-color);
  font-size: 12px;
  color: var(--text-2);
}

.sp__attr-list li:last-child { border-bottom: none; }

.sp__attr-list b {
  margin-left: auto;
  font-weight: 800;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.sp__attr-list b.is-up { color: var(--mn-green-dark); }
.sp__attr-list b.is-down { color: var(--level-risk); }

.sp__attr-list em {
  display: block;
  flex-basis: 100%;
  font-style: normal;
  font-size: 10.5px;
  color: var(--text-3);
}

.sp__attr-title { flex: 1; min-width: 0; }

.sp__attr-empty,
.sp__attr-hint {
  font-size: 12px;
  color: var(--text-3);
}

.sp__attr-ai {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.sp__attr-text {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-page);
  border: 1px solid var(--border-color);
}

.sp__attr-body {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-1);
  white-space: pre-wrap;
}

.sp__attr-source {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-3);
}

/* ⑤ 时间线 */
.sp__timeline {
  padding-left: 6px;
}

.sp__tl-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0 8px 16px;
  border-left: 2px solid var(--border-color);
}

.sp__tl-dot {
  position: absolute;
  left: -6px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--mn-green);
}

.sp__tl-main { flex: 1; min-width: 0; }

.sp__tl-time { font-size: 13px; font-weight: 600; color: var(--text-1); }

.sp__tl-meta { margin-top: 2px; font-size: 11.5px; color: var(--text-3); }

.sp__tl-score {
  font-size: 18px;
  font-weight: 800;
  color: var(--mn-green-dark);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1024px) {
  .sp__charts {
    grid-template-columns: 1fr;
  }
}
</style>
