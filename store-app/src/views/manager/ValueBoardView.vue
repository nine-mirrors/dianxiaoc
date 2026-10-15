<script setup lang="ts">
/**
 * ValueBoardView（/manager/value）—— AI 价值看板。
 *
 * 数据：`GET /performance/ai-value`（6 个指标，每个都带 method 溯源文案）。
 * 数据诚实硬约束：
 *  - aiAdoption.value === null 时显式显示「暂无分母，不伪造采纳率」，绝不显示 0%；
 *  - 每个指标卡下方「口径」可展开查看 method（数字可追溯）。
 *
 * 配 1–2 张 ECharts（金额类价值对比柱状 + 采纳率仪表盘），
 * canvas 读不到 CSS var，用 getComputedStyle 解析当前主题令牌。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import * as echarts from 'echarts'
import DesktopHeader from '@/components/layout/DesktopHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import { useToast } from '@/composables/useToast'
import { useSessionStore } from '@/stores/session'
import { getAiValue, exportStoresCsv } from '@/api/insights'
import type { AiValue } from '@/api/insights'

const session = useSessionStore()
const { success, info, error: toastError } = useToast()

const value = ref<AiValue | null>(null)
const loading = ref<boolean>(true)
const loadError = ref<boolean>(false)
/** 已展开口径的指标 key 集合 */
const openMethods = ref<Set<string>>(new Set())

const amountEl = ref<HTMLElement | null>(null)
const adoptEl = ref<HTMLElement | null>(null)
const charts: echarts.ECharts[] = []

/** 主题观察：<html data-theme> 日/夜切换后按新令牌重建图表，卸载时断开 */
let themeObserver: MutationObserver | null = null

/**
 * 图表取色：从图表容器自身读 CSS 变量（canvas 读不到 var()），
 * 自定义属性沿 DOM 继承，手机壳内自动读到壳上的日令牌。
 */
function cssVar(name: string, fallback: string): string {
  const node = amountEl.value ?? adoptEl.value ?? document.documentElement
  const v = getComputedStyle(node).getPropertyValue(name).trim()
  return v || fallback
}

/** 指标卡定义（第 5 卡合并「采纳率 + 调用次数」） */
interface MetricCard {
  key: string
  title: string
  icon: string
  value: string
  unit: string
  method: string
  extra?: string
  warning?: string
}

const cards = computed<MetricCard[]>(() => {
  const v = value.value
  if (!v) return []
  const num = (n: number | null): string => (n === null || n === undefined ? '—' : n.toLocaleString('zh-CN'))
  const adopt = v.aiAdoption.value
  return [
    {
      key: 'recoveredSales',
      title: '挽回销售损失',
      icon: 'trending-up',
      value: num(v.recoveredSales.value),
      unit: v.recoveredSales.unit,
      method: v.recoveredSales.method,
    },
    {
      key: 'avoidedOosBottles',
      title: '避免缺货（瓶）',
      icon: 'package',
      value: num(v.avoidedOosBottles.value),
      unit: v.avoidedOosBottles.unit,
      method: v.avoidedOosBottles.method,
    },
    {
      key: 'avoidedOosAmount',
      title: '避免缺货金额',
      icon: 'cart',
      value: num(v.avoidedOosAmount.value),
      unit: v.avoidedOosAmount.unit,
      method: v.avoidedOosAmount.method,
    },
    {
      key: 'avgHealthLift',
      title: '平均健康分提升',
      icon: 'check',
      value: num(v.avgHealthLift.value),
      unit: v.avgHealthLift.unit,
      method: v.avgHealthLift.method,
    },
    {
      key: 'aiAdoption',
      title: 'AI 采纳率',
      icon: 'sparkles',
      value: adopt === null ? '—' : `${Math.round(adopt * 1000) / 10}`,
      unit: adopt === null ? '' : '%',
      method: v.aiAdoption.method,
      extra: `AI 调用 ${num(v.aiCalls.value)} ${v.aiCalls.unit}`,
      warning: adopt === null ? '暂无分母，不伪造采纳率' : '',
    },
  ]
})

function toggleMethod(key: string): void {
  const next = new Set(openMethods.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openMethods.value = next
}

function disposeCharts(): void {
  while (charts.length) charts.pop()?.dispose()
}

/** ① 金额类价值对比柱状 + ② 采纳率仪表盘（无分母时走空态，不画 0） */
function renderCharts(): void {
  disposeCharts()
  const v = value.value
  if (!v) return
  const textColor = cssVar('--text-3', '#81918a')
  const axisColor = cssVar('--border-color', '#e7efe9')
  // tooltip 用抬升表面 + 边框 + 正文色，深底浅底都可读
  const tooltipStyle = {
    backgroundColor: cssVar('--bg-elevated', '#ffffff'),
    borderColor: cssVar('--border-color', '#e7efe9'),
    borderWidth: 1,
    textStyle: { color: cssVar('--text-1', '#14241b'), fontSize: 12 },
  }

  if (amountEl.value) {
    const c = echarts.init(amountEl.value)
    charts.push(c)
    c.setOption({
      grid: { left: 8, right: 20, top: 26, bottom: 4, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...tooltipStyle },
      xAxis: {
        type: 'category',
        data: ['挽回销售损失', '避免缺货金额'],
        axisLine: { lineStyle: { color: axisColor } },
        axisLabel: { color: textColor, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: axisColor, type: 'dashed' } },
        axisLabel: { color: textColor, fontSize: 11 },
      },
      series: [
        {
          type: 'bar',
          barWidth: 46,
          data: [
            { value: v.recoveredSales.value ?? 0, itemStyle: { color: cssVar('--mn-green', '#00b451') } },
            { value: v.avoidedOosAmount.value ?? 0, itemStyle: { color: cssVar('--sky', '#2fa7e0') } },
          ],
          label: { show: true, position: 'top', color: cssVar('--text-2', '#4a5d52'), fontSize: 11 },
        },
      ],
    })
  }

  const adopt = v.aiAdoption.value
  if (adoptEl.value && adopt !== null) {
    const c = echarts.init(adoptEl.value)
    charts.push(c)
    const pct = Math.round(adopt * 1000) / 10
    c.setOption({
      series: [
        {
          type: 'gauge',
          startAngle: 210,
          endAngle: -30,
          min: 0,
          max: 100,
          progress: { show: true, width: 14, itemStyle: { color: cssVar('--ai-purple', '#7c6cf0') } },
          axisLine: { lineStyle: { width: 14, color: [[1, axisColor]] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          pointer: { width: 4, itemStyle: { color: cssVar('--ai-purple', '#7c6cf0') } },
          detail: {
            formatter: `${pct}%`,
            color: cssVar('--text-1', '#14241b'),
            fontSize: 26,
            fontWeight: 800,
            offsetCenter: [0, '62%'],
          },
          data: [{ value: pct }],
        },
      ],
    })
  }
}

function onResize(): void {
  for (const c of charts) c.resize()
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = false
  try {
    value.value = await getAiValue()
    await nextTick()
    renderCharts()
  } catch (e) {
    loadError.value = true
    toastError((e as Error)?.message || 'AI 价值数据加载失败')
  } finally {
    loading.value = false
  }
}

async function doExport(): Promise<void> {
  try {
    await exportStoresCsv()
    success('已导出门店明细 CSV（口径与看板一致）')
  } catch (e) {
    toastError((e as Error)?.message || '导出失败')
  }
}

onMounted(() => {
  void load()
  window.addEventListener('resize', onResize)
  // 观察 <html> 的 data-theme：日/夜切换后按新令牌重建图表
  if (typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => {
      if (value.value && !loading.value) renderCharts()
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  }
})

onBeforeUnmount(() => {
  disposeCharts()
  themeObserver?.disconnect()
  themeObserver = null
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="vb">
    <h1 class="u-sr-only">AI 价值看板</h1>

    <DesktopHeader
      :region-ids="[]"
      region-id=""
      :user-name="session.user?.name ?? ''"
      :role-label="session.roleLabel"
      @switch-role="() => {}"
      @change-region="() => {}"
    />

    <div class="vb__body">
      <section class="u-card vb__bar">
        <div class="vb__bar-left">
          <AppIcon name="zap" :size="16" color="var(--ai-purple)" />
          <h2 class="vb__bar-title">AI 价值看板</h2>
          <span class="vb__bar-sub">每个数字都可展开口径溯源，不编造、不估算</span>
        </div>
        <button type="button" class="u-btn u-btn--ghost" @click="doExport">
          <AppIcon name="download" :size="15" /> 导出 CSV
        </button>
      </section>

      <template v-if="loading">
        <div class="vb__cards">
          <SkeletonBlock v-for="i in 5" :key="i" height="128px" radius="14px" />
        </div>
      </template>

      <EmptyState
        v-else-if="loadError || !value"
        icon="zap"
        title="AI 价值数据加载失败"
        desc="请确认后端服务已启动，然后重试。"
        action-text="重新加载"
        @action="load"
      />

      <template v-else>
        <!-- 5 个指标大卡 -->
        <div class="vb__cards">
          <article v-for="c in cards" :key="c.key" class="u-card vb__card">
            <header class="vb__card-head">
              <AppIcon :name="c.icon" :size="15" color="var(--mn-green-dark)" />
              <h3>{{ c.title }}</h3>
            </header>
            <p class="vb__card-value">
              {{ c.value }}<em v-if="c.unit">{{ c.unit }}</em>
            </p>
            <p v-if="c.extra" class="vb__card-extra">{{ c.extra }}</p>
            <p v-if="c.warning" class="vb__card-warn">
              <AppIcon name="warning" :size="12" /> {{ c.warning }}
            </p>

            <button type="button" class="vb__method-btn" @click="toggleMethod(c.key)">
              <AppIcon name="info" :size="12" /> {{ openMethods.has(c.key) ? '收起口径' : '口径' }}
            </button>
            <p v-if="openMethods.has(c.key)" class="vb__method-text">{{ c.method }}</p>
          </article>
        </div>

        <!-- 图表 -->
        <div class="vb__charts">
          <section class="u-card vb__chart-card">
            <header class="vb__chart-head">
              <h2><AppIcon name="trending-up" :size="14" /> 金额类价值对比</h2>
              <span>单位：元</span>
            </header>
            <div ref="amountEl" class="vb__chart" />
          </section>

          <section class="u-card vb__chart-card">
            <header class="vb__chart-head">
              <h2><AppIcon name="sparkles" :size="14" color="var(--ai-purple)" /> AI 采纳率</h2>
              <span>已接单 / 全部订货单</span>
            </header>
            <div v-if="value.aiAdoption.value !== null" ref="adoptEl" class="vb__chart" />
            <EmptyState
              v-else
              icon="info"
              title="暂时还算不出采纳率"
              desc="当前区域还没有订货单，等店主开始下单后，这里会展示 AI 建议被采纳的比例"
            />
          </section>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.vb {
  min-height: 100vh;
  background: var(--bg-page);
}

.vb__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 1760px;
  margin: 0 auto;
  padding: 16px 24px 28px;
}

.vb__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px;
}

.vb__bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.vb__bar-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

.vb__bar-sub {
  font-size: 12px;
  color: var(--text-3);
}

.vb__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}

.vb__card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
}

.vb__card-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.vb__card-head h3 {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-3);
}

.vb__card-value {
  font-size: 32px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.vb__card-value em {
  margin-left: 4px;
  font-size: 13px;
  font-style: normal;
  font-weight: 600;
  color: var(--text-3);
}

.vb__card-extra {
  font-size: 12px;
  color: var(--text-2);
}

.vb__card-warn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 8px;
  background: var(--warning-bg);
  color: var(--warning-fg);
  font-size: 11px;
  font-weight: 600;
  align-self: flex-start;
}

.vb__method-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  margin-top: 2px;
  padding: 3px 0;
  border: none;
  background: none;
  color: var(--text-3);
  font-size: 11.5px;
  font-weight: 600;
}

.vb__method-btn:hover {
  color: var(--mn-green-dark);
}

.vb__method-text {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-subtle, var(--bg-page));
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--text-2);
}

.vb__charts {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 14px;
}

.vb__chart-card {
  padding: 14px 16px;
}

.vb__chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.vb__chart-head h2 {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.vb__chart-head span {
  font-size: 11.5px;
  color: var(--text-3);
}

.vb__chart {
  width: 100%;
  height: 240px;
}

@media (max-width: 1024px) {
  .vb__charts {
    grid-template-columns: 1fr;
  }
}
</style>
