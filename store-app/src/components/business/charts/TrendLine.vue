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

/** 容器尺寸观察（Tab v-show 切换 / 断点切换 / 窗口拖拽都靠它），卸载时断开 */
let resizeObserver: ResizeObserver | null = null
/** 主题观察：<html data-theme> 日/夜切换后重读令牌并重绘，卸载时断开 */
let themeObserver: MutationObserver | null = null
/** resize 合并到下一帧执行，拖拽窗口时每帧最多重绘一次 */
let resizeRaf = 0
/** 上一次字号档：仅跨档时才整图 setOption，同档拖拽只走廉价的 resize */
let lastFontScale = 1

/**
 * 读取当前生效的设计令牌（去空白；取不到时回退空串）。
 * 从图表容器自身读取而非 <html>：自定义属性沿 DOM 继承，手机壳
 * （.dxc-phone-light 重新声明日令牌）内会自动读到壳上的日间值，无需手机端特例。
 */
function css(name: string): string {
  const node = el.value ?? document.documentElement
  return getComputedStyle(node).getPropertyValue(name).trim()
}

/** 给 #rgb / #rrggbb 令牌色附加透明度（面积填充用）；非 hex 输入原样返回 */
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

/** 当前选中的序列 */
const active = computed<TrendSeries | undefined>(() => props.series.find((s) => s.key === activeKey.value))

/** 系统开启「减少动态效果」时关闭 ECharts 入场/补间动画（语义不依赖动画传达） */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * 坐标轴字号档随容器宽度轻微变化并封顶：
 * 窄卡（≤360px）0.92 档（约 10px）、常规 1 档（11px）、超宽（≥900px）1.08 档（约 12px）。
 * 趋势卡在 max-width:1760 内容器里最宽约 1090px，2K/4K 也只到 12px，不会变成大字报。
 */
function fontScale(): number {
  const w = el.value?.clientWidth ?? 0
  if (w > 0 && w <= 360) return 0.92
  if (w >= 900) return 1.08
  return 1
}

/** 读屏替代文本：当前指标 + 周数 + 最新值（全部来自现有 props，不编造口径） */
const ariaLabel = computed<string>(() => {
  const s = active.value
  if (!s) return '近 8 周趋势折线图'
  const last = s.points.length ? s.points[s.points.length - 1] : undefined
  return `近 ${s.weeks.length || s.points.length} 周趋势折线图，当前指标：${s.name}${
    last === undefined ? '' : `，最新值 ${last}${s.unit}`
  }`
})

/** 各指标折线色对应的设计令牌（健康分=品牌绿 / 缺货率=风险红 / 铺货率=AI 智紫），
 *  每次渲染现读，日/夜主题下自动取当前生效值 */
const LINE_COLOR_TOKENS: Record<TrendKey, string> = {
  score: '--brand',
  oosRate: '--red',
  coverage: '--ai',
}

function render(): void {
  if (!el.value || !active.value) return
  // 容器尚无布局（如组件挂在 v-show 隐藏面板里，宽高为 0）：不 init。
  // 等 ResizeObserver 在面板显示、容器拿到真实尺寸后回调里再建图，
  // 避免 ECharts 把画布钉死在 0×0（Tab 切回后图表空白的根因）。
  const w = el.value.clientWidth
  const h = el.value.clientHeight
  if (!w || !h) return
  if (!chart) chart = echarts.init(el.value)
  const s = active.value
  const axisFont = Math.round(11 * fontScale())
  lastFontScale = fontScale()
  const lineColor = css(LINE_COLOR_TOKENS[s.key])
  // 坐标轴 / 分割线 / tooltip 全部读中性令牌，深底下不刺眼
  const axisLabelColor = css('--text-3')
  const axisLineColor = css('--border-color')
  chart.setOption(
    {
      animation: !prefersReducedMotion(),
      color: [lineColor],
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: unknown) => `${v}${s.unit}`,
        // tooltip 用抬升表面 + 边框 + 正文文字色，深底浅底都可读
        backgroundColor: css('--bg-elevated'),
        borderColor: css('--border-color'),
        borderWidth: 1,
        padding: 8,
        textStyle: { color: css('--text-1'), fontSize: 12 },
      },
      grid: { left: 40, right: 16, top: 20, bottom: 26 },
      xAxis: {
        type: 'category',
        data: s.weeks,
        boundaryGap: false,
        axisLine: { lineStyle: { color: axisLineColor } },
        axisTick: { show: false },
        axisLabel: { color: axisLabelColor, fontSize: axisFont },
      },
      yAxis: {
        type: 'value',
        min: (v: { min: number; max: number }) => Math.floor(v.min - 2),
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: axisLineColor, type: 'dashed' } },
        axisLabel: { color: axisLabelColor, fontSize: axisFont, formatter: `{value}${s.unit}` },
      },
      series: [
        {
          type: 'line',
          data: s.points,
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { width: 2.5 },
          // 节点描边与卡片表面同色（日间白、夜间深墨绿）
          itemStyle: { color: lineColor, borderColor: css('--bg-card'), borderWidth: 1 },
          areaStyle: { color: withAlpha(lineColor, 0.1) },
        },
      ],
    },
    true,
  )
}

/** 窗口 resize 兜底入口（主路径是 ResizeObserver，这里只统一并入下一帧） */
function onResize(): void {
  scheduleSync()
}

/**
 * 容器尺寸同步：
 * - 宽高为 0（面板被 v-show 隐藏）：直接跳过，不 resize 也不报错；
 * - 图未建（挂载在隐藏态 / 初次还没布局）：补建并渲染；
 * - 仅字号跨档：整图 setOption 更新文字尺寸；
 * - 其余情况（拖拽 / 断点 / Tab 切回）：走廉价 chart.resize()。
 */
function syncSize(): void {
  resizeRaf = 0
  if (!el.value) return
  const w = el.value.clientWidth
  const h = el.value.clientHeight
  if (!w || !h) return
  if (!chart) {
    render()
    return
  }
  if (fontScale() !== lastFontScale) {
    render()
    return
  }
  chart.resize()
}

/** rAF 节流：一帧内无论收多少回调（窗口 + RO）只同步一次 */
function scheduleSync(): void {
  if (resizeRaf) return
  resizeRaf = requestAnimationFrame(syncSize)
}

onMounted(() => {
  render()
  // 直接观察容器本身：窗口拖拽、CSS 断点换列、Tab v-show 隐藏再显示，
  // 凡容器尺寸变化都能收到（window resize 只在窗口本身变化时触发，覆盖不到后两者）。
  if (el.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleSync)
    resizeObserver.observe(el.value)
  }
  // 观察 <html> 的 data-theme：日/夜切换后整图重读令牌 setOption（含 resize）
  if (typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => {
      if (chart) chart.resize()
      render()
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  }
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  resizeObserver?.disconnect()
  resizeObserver = null
  themeObserver?.disconnect()
  themeObserver = null
  if (resizeRaf) {
    cancelAnimationFrame(resizeRaf)
    resizeRaf = 0
  }
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
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.trend__tab.is-active {
  border-color: var(--brand);
  background: var(--brand-mist);
  color: var(--brand-deep);
  font-weight: 600;
}

.trend__chart {
  width: 100%;
  /* 高度随视口高度轻微伸缩并双向封顶：
     800px 矮屏约 196px（为首屏让垂直空间），1440×900 基准约 220px 与原版一致，
     约 950p 起封顶 232px；2K/4K 不随高度拉长，折线不会被压成扁线。 */
  height: clamp(180px, 24.5vh, 232px);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* 系统开启「减少动态效果」：指标切换只保留瞬时颜色变化，不做过渡 */
@media (prefers-reduced-motion: reduce) {
  .trend__tab {
    transition: none;
  }
}

/* 打印：vh 在分页媒体里口径不稳定，改用固定高度 */
@media print {
  .trend__chart {
    height: 200px;
  }
}
</style>
