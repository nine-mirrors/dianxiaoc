<script setup lang="ts">
/**
 * 健康分四档分布环图（P5 看板 · ARCHITECTURE T05.2）。
 *
 * ECharts 按需引入：PieChart + CanvasRenderer + Tooltip/Legend，
 * 全本地打包，零 CDN。中心显示门店总数，外圈四档占比。
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { LevelBucket } from '@/types'

echarts.use([PieChart, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

interface Props {
  /** 四档分布数据（fixture: distribution） */
  data: LevelBucket[]
}

const props = withDefaults(defineProps<Props>(), { data: () => [] })

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

/** 读取 :root / [data-theme] 上当前生效的设计令牌（去空白；取不到时回退空串） */
function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** 门店总数 */
function totalCount(): number {
  return props.data.reduce((s, d) => s + d.count, 0)
}

/** 系统开启「减少动态效果」时关闭 ECharts 入场/补间动画（语义不依赖动画传达） */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * 字号档随容器宽度轻微增长并封顶：
 * 窄卡（≤300px）0.92 档、常规 1 档、超宽（≥520px）1.12 档。
 * 看板内容在 ≥1920 被 max-width:1760 锁住，环图卡最宽约 600px，
 * 因此 2K/4K 下字号最多到 1.12 档（中心数 26→29px），不会放大成方块字。
 */
function fontScale(): number {
  const w = el.value?.clientWidth ?? 0
  if (w > 0 && w <= 300) return 0.92
  if (w >= 520) return 1.12
  return 1
}

/** 读屏替代文本：用现有 props 拼人类可读摘要（如「健康分四档：优秀 42 家，良好 53 家…」） */
const ariaLabel = computed<string>(() => {
  const parts = props.data.map((d) => `${d.label} ${d.count} 家`).join('，')
  return `健康分四档分布，共 ${totalCount()} 家：${parts}`
})

/** 渲染 / 更新图表 */
function render(): void {
  if (!el.value) return
  // 容器尚无布局（如组件挂在 v-show 隐藏面板里，宽高为 0）：不 init。
  // 等 ResizeObserver 在面板显示、容器拿到真实尺寸后回调里再建图，
  // 避免 ECharts 把画布钉死在 0×0（Tab 切回后图表空白的根因）。
  const w = el.value.clientWidth
  const h = el.value.clientHeight
  if (!w || !h) return
  if (!chart) chart = echarts.init(el.value)
  const total = totalCount()
  const scale = fontScale()
  lastFontScale = scale
  // 全部颜色现读设计令牌：四档序列读 --level-*（夜间自动换成提亮档），
  // 不再写死 fixture 的日值 hex；fixture 仅在令牌意外缺失时兜底。
  const levelColor = (d: LevelBucket): string => css(`--level-${d.level}`) || d.color
  chart.setOption(
    {
      animation: !prefersReducedMotion(),
      color: props.data.map(levelColor),
      tooltip: {
        trigger: 'item',
        formatter: '{b}：{c} 家（{d}%）',
        // tooltip 浮在卡片之上：深底/浅底都用抬升表面 + 正文文字色，保证可读
        backgroundColor: css('--bg-elevated'),
        borderColor: css('--border-color'),
        borderWidth: 1,
        padding: 8,
        textStyle: { color: css('--text-1'), fontSize: 12 },
      },
      legend: {
        orient: 'vertical',
        right: 8,
        top: 'center',
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        itemGap: 10,
        textStyle: { color: css('--text-2'), fontSize: Math.round(12 * scale) },
      },
      title: {
        text: String(total),
        subtext: '家门店',
        left: '37%',
        top: '38%',
        textAlign: 'center',
        textStyle: { fontSize: Math.round(26 * scale), fontWeight: 700, color: css('--text-1') },
        subtextStyle: { fontSize: Math.round(12 * scale), color: css('--text-3') },
      },
      series: [
        {
          type: 'pie',
          radius: ['52%', '72%'],
          center: ['37%', '50%'],
          avoidLabelOverlap: true,
          // 扇区分割线与卡片表面同色（日间白、夜间深墨绿）
          itemStyle: { borderColor: css('--bg-card'), borderWidth: 2 },
          label: { show: false },
          emphasis: { scaleSize: 4 },
          data: props.data.map((d) => ({ name: d.label, value: d.count, itemStyle: { color: levelColor(d) } })),
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

watch(() => props.data, render, { deep: true })
</script>

<template>
  <div ref="el" class="donut" role="img" :aria-label="ariaLabel" />
</template>

<style scoped>
.donut {
  width: 100%;
  /* 高度随视口高度轻微伸缩并双向封顶：
     800px 矮屏约 214px（为首屏让垂直空间），900p（1440 基准）即恢复原 240px；
     2K/4K 高度再大也停在 240px，避免环图在超高屏变成「大甜甜圈」。 */
  height: clamp(185px, 26.7vh, 240px);
  /* 打印时保留品牌色与四档配色 */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* 打印：vh 在分页媒体里口径不稳定，改用固定高度，保证一页内能排下 */
@media print {
  .donut {
    height: 220px;
  }
}
</style>
