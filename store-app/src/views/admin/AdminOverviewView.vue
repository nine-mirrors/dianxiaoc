<script setup lang="ts">
/**
 * AdminOverviewView —— 运营总览（/admin）。
 *
 * 数据源：GET /admin/overview（一次拿全，含近 7 天审计活动）。
 * 组成：KPI 卡组 → 近 7 天审计趋势（ECharts 面积图）→ 平台能力速览 → 快捷入口。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { TooltipComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import AdminShell from './AdminShell.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import { useApi } from '@/composables/useApi'
import { useCountUp } from '@/composables/useCountUp'
import { getAdminOverview, type AdminOverview } from '@/api/admin'

echarts.use([LineChart, TooltipComponent, GridComponent, CanvasRenderer])

const { data, loading, run } = useApi<AdminOverview | null>(() => getAdminOverview(), {
  initial: null,
  errorMessage: '运营总览加载失败，请稍后重试',
})

/** 关键计数滚动入场（每个数字一个 useCountUp，目标值随接口数据变化平滑滚动） */
const counters = {
  store: useCountUp(() => data.value?.storeCount ?? 0),
  account: useCountUp(() => data.value?.accountCount ?? 0),
  knowledge: useCountUp(() => data.value?.knowledgeCount ?? 0),
  blacklist: useCountUp(() => data.value?.blacklistCount ?? 0),
  diagnosis: useCountUp(() => data.value?.diagnosisCount ?? 0),
  ai: useCountUp(() => data.value?.aiCallCount ?? 0),
  audit: useCountUp(() => data.value?.auditCount ?? 0),
}

/** KPI 卡（≥6 张；账号卡带内置/派发拆分口径） */
const kpis = computed(() => {
  const o = data.value
  return [
    { key: 'store', label: '在营门店', counter: counters.store, icon: 'store', hint: '全量门店主数据' },
    {
      key: 'account',
      label: '系统账号',
      counter: counters.account,
      icon: 'user',
      hint: `内置 ${o?.seedAccountCount ?? 0} · 派发 ${o?.extAccountCount ?? 0}`,
    },
    { key: 'knowledge', label: '知识条目', counter: counters.knowledge, icon: 'layers', hint: '有效 FAQ 条目' },
    { key: 'blacklist', label: '黑名单生效', counter: counters.blacklist, icon: 'shield', hint: '门店 / SKU 管控中' },
    { key: 'diagnosis', label: '诊断累计', counter: counters.diagnosis, icon: 'camera', hint: 'AI 货架诊断记录' },
    { key: 'ai', label: 'AI 调用次数', counter: counters.ai, icon: 'sparkles', hint: '问答 / 生成 / 周报' },
    { key: 'audit', label: '审计留痕', counter: counters.audit, icon: 'clipboard', hint: '写操作全量留痕' },
  ]
})

/** 快捷入口宫格 */
const shortcuts = [
  { path: '/admin/accounts', label: '账号派发', desc: '新建 / 停用 / 重置密码', icon: 'user' },
  { path: '/admin/blacklist', label: '黑名单管理', desc: '门店与 SKU 规则管控', icon: 'shield' },
  { path: '/admin/knowledge', label: 'FAQ 知识库', desc: '标准答复维护与预览', icon: 'layers' },
  { path: '/admin/announcements', label: '公告发布', desc: '三端实时送达', icon: 'bell' },
  { path: '/admin/audit', label: '审计日志', desc: '操作留痕可追溯', icon: 'clipboard' },
  { path: '/admin/messages', label: '消息中心', desc: '会话 / 公告统一收口', icon: 'message' },
]

/** 平台能力速览：已挂载的 API 模块（完整度展示） */
const platformModules = [
  { name: '运营管理', desc: '账号 / 黑名单 / 知识 / 公告 / 审计', icon: 'sliders' },
  { name: 'AI 问答', desc: '多轮追问 · SSE 流式', icon: 'message' },
  { name: 'AI 周报', desc: '经营周报自动生成', icon: 'clipboard' },
  { name: '知识库', desc: '检索问答 + 标准答复', icon: 'layers' },
  { name: '门店画像', desc: '单店体检报告', icon: 'store' },
  { name: '业代排行榜', desc: '多维度绩效排名', icon: 'compare' },
  { name: '价值看板', desc: 'AI 降本增效量化', icon: 'zap' },
  { name: '盘点签到', desc: '库存盘点 + GPS 水印', icon: 'clock' },
  { name: '数据导出', desc: 'CSV / 报表导出', icon: 'download' },
  { name: '消息中心', desc: '会话 IM + 公告直达', icon: 'bell' },
]

/* ═══════════════ 近 7 天审计趋势（ECharts） ═══════════════ */

const trendEl = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** #rgb / #rrggbb → rgba（面积填充用）；非 hex 原样返回 */
function withAlpha(color: string, alpha: number): string {
  const m = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return color
  let hex = m[1]
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  return `rgba(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}, ${alpha})`
}

/** day（YYYY-MM-DD）→ 短标签 MM-DD */
function shortDay(day: string): string {
  const parts = String(day).split('-')
  return parts.length === 3 ? `${parts[1]}-${parts[2]}` : day
}

function render(): void {
  if (!trendEl.value) return
  const w = trendEl.value.clientWidth
  const h = trendEl.value.clientHeight
  if (!w || !h) return
  if (!chart) chart = echarts.init(trendEl.value)

  const points = data.value?.auditTrend ?? []
  const line = css('--brand')
  chart.setOption(
    {
      animation: true,
      color: [line],
      tooltip: {
        trigger: 'axis',
        backgroundColor: css('--bg-elevated'),
        borderColor: css('--border-color'),
        borderWidth: 1,
        padding: 8,
        textStyle: { color: css('--text-1'), fontSize: 12 },
        valueFormatter: (v: unknown) => `${v} 条`,
      },
      grid: { left: 44, right: 18, top: 22, bottom: 26 },
      xAxis: {
        type: 'category',
        data: points.map((p) => shortDay(p.day)),
        boundaryGap: false,
        axisLine: { lineStyle: { color: css('--border-color') } },
        axisTick: { show: false },
        axisLabel: { color: css('--text-3'), fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: css('--border-color'), type: 'dashed' } },
        axisLabel: { color: css('--text-3'), fontSize: 11 },
      },
      series: [
        {
          type: 'line',
          data: points.map((p) => p.count),
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { width: 2.6 },
          itemStyle: { color: line, borderColor: css('--bg-card'), borderWidth: 1 },
          areaStyle: { color: withAlpha(line, 0.12) },
        },
      ],
    },
    true,
  )
}

let raf = 0
function schedule(): void {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    if (!trendEl.value) return
    if (!trendEl.value.clientWidth || !trendEl.value.clientHeight) return
    if (!chart) render()
    else chart.resize()
  })
}

onMounted(() => {
  void run().then(() => render())
  if (trendEl.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(trendEl.value)
  }
  if (typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => {
      if (chart) chart.resize()
      render()
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  themeObserver?.disconnect()
  themeObserver = null
  if (raf) cancelAnimationFrame(raf)
  chart?.dispose()
  chart = null
})

watch(() => data.value?.auditTrend, render, { deep: true })
</script>

<template>
  <AdminShell title="运营总览">
    <div class="ov">
      <!-- ── KPI 卡组 ── -->
      <div v-if="loading && !data" class="ov__kpis mot-stagger-pop">
        <SkeletonBlock v-for="i in 7" :key="i" height="92px" radius="14px" />
      </div>
      <div v-else class="ov__kpis mot-stagger-pop">
        <div v-for="k in kpis" :key="k.key" class="ov__kpi u-card mot-tap">
          <span class="ov__kpi-ic"><AppIcon :name="k.icon" :size="17" /></span>
          <p class="ov__kpi-label">{{ k.label }}</p>
          <p class="ov__kpi-value">{{ k.counter.text }}</p>
          <p class="ov__kpi-hint">{{ k.hint }}</p>
        </div>
      </div>

      <div class="ov__grid mot-rise">
        <!-- ── 趋势 ── -->
        <section class="ov__card u-card">
          <header class="ov__card-head">
            <h2 class="ov__card-title"><AppIcon name="trending-up" :size="15" /> 近 7 天审计活动</h2>
            <span>单位：条 / 天</span>
          </header>
          <div ref="trendEl" class="ov__chart" role="img" aria-label="近 7 天审计留痕折线图" />
        </section>

        <!-- ── 平台能力速览 ── -->
        <section class="ov__card u-card">
          <header class="ov__card-head">
            <h2 class="ov__card-title"><AppIcon name="zap" :size="15" /> 平台能力速览</h2>
            <span>已挂载 {{ platformModules.length }} 个模块</span>
          </header>
          <ul class="ov__cap mot-stagger">
            <li v-for="m in platformModules" :key="m.name" class="ov__cap-item">
              <span class="ov__cap-ic"><AppIcon :name="m.icon" :size="15" /></span>
              <div class="ov__cap-main">
                <b>{{ m.name }}</b>
                <small>{{ m.desc }}</small>
              </div>
              <span class="ov__cap-tag">已挂载</span>
            </li>
          </ul>
        </section>
      </div>

      <!-- ── 快捷入口 ── -->
      <section class="ov__quick">
        <h2 class="ov__section-title">快捷入口</h2>
        <div class="ov__quick-grid mot-stagger">
          <router-link v-for="s in shortcuts" :key="s.path" :to="s.path" class="ov__quick-item u-card mot-hover-lift mot-tap">
            <span class="ov__quick-ic"><AppIcon :name="s.icon" :size="19" /></span>
            <div class="ov__quick-main">
              <b>{{ s.label }}</b>
              <small>{{ s.desc }}</small>
            </div>
            <AppIcon name="chevron-right" :size="16" class="ov__quick-arrow" />
          </router-link>
        </div>
      </section>
    </div>
  </AdminShell>
</template>

<style scoped>
.ov {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── KPI ── */
.ov__kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.ov__kpi {
  position: relative;
  padding: 14px 16px;
  transition: transform var(--dur-fast) ease;
}

.ov__kpi:hover {
  transform: translateY(-2px);
}

.ov__kpi-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin-bottom: 8px;
  border-radius: 9px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
}

.ov__kpi-label {
  font-size: 12.5px;
  color: var(--text-3);
}

.ov__kpi-value {
  margin-top: 3px;
  font-size: 26px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.ov__kpi-hint {
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-4);
}

/* ── 两列 ── */
.ov__grid {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 14px;
}

.ov__card {
  padding: 16px 18px;
}

.ov__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.ov__card-head span {
  font-size: 11.5px;
  color: var(--text-3);
}

.ov__card-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 700;
}

.ov__chart {
  width: 100%;
  height: 210px;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}

/* ── 能力清单 ── */
.ov__cap {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.ov__cap-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border-radius: 10px;
  background: var(--bg-page);
}

.ov__cap-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--brand);
  box-shadow: var(--sh-1);
}

.ov__cap-main {
  flex: 1;
  min-width: 0;
}

.ov__cap-main b {
  display: block;
  font-size: 12.5px;
  color: var(--text-1);
}

.ov__cap-main small {
  display: block;
  font-size: 10.5px;
  color: var(--text-3);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ov__cap-tag {
  flex: none;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-size: 10px;
  font-weight: 700;
}

/* ── 快捷入口 ── */
.ov__section-title {
  margin: 4px 0 10px;
  font-size: 14px;
  font-weight: 700;
}

.ov__quick-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.ov__quick-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 15px;
  text-decoration: none;
  color: inherit;
  transition: transform var(--dur-fast) ease, box-shadow var(--dur-fast) ease;
}

.ov__quick-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--sh-2);
}

.ov__quick-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 11px;
  background: var(--grad-brand);
  color: #fff;
}

.ov__quick-main {
  flex: 1;
  min-width: 0;
}

.ov__quick-main b {
  display: block;
  font-size: 13.5px;
  color: var(--text-1);
}

.ov__quick-main small {
  display: block;
  margin-top: 1px;
  font-size: 11px;
  color: var(--text-3);
}

.ov__quick-arrow {
  color: var(--text-4);
}

/* ── 响应式 ── */
@media (max-width: 1180px) {
  .ov__kpis {
    grid-template-columns: repeat(3, 1fr);
  }

  .ov__grid {
    grid-template-columns: 1fr;
  }

  .ov__quick-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 720px) {
  .ov__kpis {
    grid-template-columns: repeat(2, 1fr);
  }

  .ov__cap {
    grid-template-columns: 1fr;
  }

  .ov__quick-grid {
    grid-template-columns: 1fr;
  }
}
</style>
