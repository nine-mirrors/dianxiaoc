<script setup lang="ts">
/**
 * 近 8 周趋势折线（P5 看板 · ARCHITECTURE T05.2）。
 *
 * 三指标可切换（健康分 / 缺货率 / 铺货率），ECharts 按需引入 LineChart，
 * 全本地打包。缺货率为「越低越好」，铺货率/健康分为「越高越好」，
 * 但演示原型不强行加好坏语义，仅以折线 + 面积呈现变化方向。
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { TooltipComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { TrendSeries, TrendKey } from '@/types'

echarts.use([LineChart, TooltipComponent, GridComponent, CanvasRenderer])

interface Props {
  /** 三组趋势序列（fixture: trend） */
  series: TrendSeries[]
}

const props = withDefaults(defineProps<Props>(), { series: () => [] })

const activeKey = ref<TrendKey>('score')
const el = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null

/** 当前选中的序列 */
const active = computed<TrendSeries | undefined>(() => props.series.find((s) => s.key === activeKey.value))

/** 读屏替代文本：当前指标 + 周数 + 最新值（全部来自现有 props，不编造口径） */
const ariaLabel = computed<string>(() => {
  const s = active.value
  if (!s) return '近 8 周趋势折线图'
  const last = s.points.length ? s.points[s.points.length - 1] : undefined
  return `近 ${s.weeks.length || s.points.length} 周趋势折线图，当前指标：${s.name}${
    last === undefined ? '' : `，最新值 ${last}${s.unit}`
  }`
})

/** 各指标折线色（区别于环图色，突出 AI 洞察） */
const LINE_COLORS: Record<TrendKey, string> = {
  score: '#009639',
  oosRate: '#E02020',
  coverage: '#6D3BF5',
}

function render(): void {
  if (!el.value || !active.value) return
  if (!chart) chart = echarts.init(el.value)
  const s = active.value
  chart.setOption(
    {
      color: [LINE_COLORS[s.key]],
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: unknown) => `${v}${s.unit}`,
        backgroundColor: 'rgba(26,31,28,0.92)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
      },
      grid: { left: 40, right: 16, top: 20, bottom: 26 },
      xAxis: {
        type: 'category',
        data: s.weeks,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisTick: { show: false },
        axisLabel: { color: '#6b7280', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        min: (v: { min: number; max: number }) => Math.floor(v.min - 2),
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#f0f2f0', type: 'dashed' } },
        axisLabel: { color: '#6b7280', fontSize: 11, formatter: `{value}${s.unit}` },
      },
      series: [
        {
          type: 'line',
          data: s.points,
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { width: 2.5 },
          itemStyle: { color: LINE_COLORS[s.key], borderColor: '#fff', borderWidth: 1 },
          areaStyle: { color: 'rgba(0,150,57,0.10)' },
        },
      ],
    },
    true,
  )
}

function onResize(): void {
  chart?.resize()
}

onMounted(() => {
  render()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  chart?.dispose()
  chart = null
})

watch([() => props.series, activeKey], render, { deep: true })
</script>

<template>
  <div class="trend">
    <div class="trend__tabs" role="group" aria-label="趋势指标切换">
      <button
        v-for="s in props.series"
        :key="s.key"
        type="button"
        class="trend__tab"
        :class="{ 'is-active': activeKey === s.key }"
        :aria-pressed="activeKey === s.key"
        @click="activeKey = s.key"
      >
        {{ s.name }}
      </button>
    </div>
    <div ref="el" class="trend__chart" role="img" :aria-label="ariaLabel" />
  </div>
</template>

<style scoped>
.trend {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.trend__tabs {
  display: flex;
  gap: 6px;
}

.trend__tab {
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: #fff;
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.trend__tab.is-active {
  border-color: var(--mn-green);
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-weight: 600;
}

.trend__chart {
  width: 100%;
  height: 220px;
}
</style>
