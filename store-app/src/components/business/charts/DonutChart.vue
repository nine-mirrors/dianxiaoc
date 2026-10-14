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

/** 门店总数 */
function totalCount(): number {
  return props.data.reduce((s, d) => s + d.count, 0)
}

/** 读屏替代文本：用现有 props 拼人类可读摘要（如「健康分四档：优秀 42 家，良好 53 家…」） */
const ariaLabel = computed<string>(() => {
  const parts = props.data.map((d) => `${d.label} ${d.count} 家`).join('，')
  return `健康分四档分布，共 ${totalCount()} 家：${parts}`
})

/** 渲染 / 更新图表 */
function render(): void {
  if (!el.value) return
  if (!chart) chart = echarts.init(el.value)
  const total = totalCount()
  chart.setOption({
    color: props.data.map((d) => d.color),
    tooltip: {
      trigger: 'item',
      formatter: '{b}：{c} 家（{d}%）',
      backgroundColor: 'rgba(26,31,28,0.92)',
      borderWidth: 0,
      textStyle: { color: '#fff', fontSize: 12 },
    },
    legend: {
      orient: 'vertical',
      right: 8,
      top: 'center',
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 10,
      textStyle: { color: '#4b5563', fontSize: 12 },
    },
    title: {
      text: String(total),
      subtext: '家门店',
      left: '37%',
      top: '38%',
      textAlign: 'center',
      textStyle: { fontSize: 26, fontWeight: 700, color: '#1a1f1c' },
      subtextStyle: { fontSize: 12, color: '#6b7280' },
    },
    series: [
      {
        type: 'pie',
        radius: ['52%', '72%'],
        center: ['37%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: { scaleSize: 4 },
        data: props.data.map((d) => ({ name: d.label, value: d.count })),
      },
    ],
  })
}

/** 响应式：容器尺寸变化时重绘 */
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

watch(() => props.data, render, { deep: true })
</script>

<template>
  <div ref="el" class="donut" role="img" :aria-label="ariaLabel" />
</template>

<style scoped>
.donut {
  width: 100%;
  height: 240px;
}
</style>
