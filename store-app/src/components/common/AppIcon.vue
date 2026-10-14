<script lang="ts">
/**
 * 模块级自增序号（普通 <script> 仅在模块加载时执行一次），
 * 保证每个组件实例的 <title> id 全局唯一，避免多实例 aria-labelledby 串读。
 */
let iconSeq = 0
</script>

<script setup lang="ts">
/**
 * AppIcon —— 全站统一内联 SVG 图标体系（零依赖、100% 离线）。
 *
 * 使用：
 *   <AppIcon name="camera" :size="20" />
 *   <AppIcon name="shield" :size="18" color="var(--mn-green)" title="安全可信" />
 *
 * 视觉规范（全表统一，禁止单图标另起风格）：
 *   - 网格：24×24 viewBox，四周留白约 1~2.5px
 *   - 描边：stroke-width 1.8，stroke=currentColor（颜色由 color prop / 外部 CSS 控制）
 *   - 线帽/拐角：stroke-linecap / stroke-linejoin 均为 round（克制、专业、略带亲和）
 *   - 线性风格、fill=none，不使用卡通造型与多色填充（品牌色：蒙牛绿 + AI 紫，均外部注入）
 *
 * 扩展方式：仅在下方 ICONS 表中按分组新增 name → path[]，业务侧不需要任何改动。
 */
import { computed } from 'vue'

interface Props {
  /** 图标名（见下方 ICONS 映射表，未知名字安全回落到 info，不报错、不空白） */
  name: string
  /** 尺寸 px，width/height 同步生效 */
  size?: number
  /** 描边色，默认继承 currentColor */
  color?: string
  /**
   * 无障碍标题：传入非空字符串时输出 <title> 并以 role="img" 暴露给读屏；
   * 留空（默认）时图标视为纯装饰，aria-hidden="true"。
   */
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  name: 'home',
  size: 20,
  color: 'currentColor',
  title: undefined,
})

/** 统一描边粗细（px） */
const STROKE_WIDTH = 1.8

/**
 * 图标 path 映射表（线性风格，通用几何图形，无版权风险）。
 * 每个图标由若干段 path 组成，共享同一套 24 网格、描边与圆头规范。
 */
const ICONS: Record<string, string[]> = {
  // ── 导航与位置 ─────────────────────────────────────────────
  home: ['M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z', 'M9.5 21v-7.5h5V21'],
  store: ['M3.5 9 5 3.5h14L20.5 9', 'M5 9v11.5h14V9', 'M9.5 20.5v-6.5h5v6.5'],
  history: ['M12 21a9 9 0 1 0-9-9', 'M3 3v6h6', 'M12 7.5V12l3 2'],
  user: ['M20 21v-1.8a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4V21', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  bell: ['M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5z', 'M13.8 20.5a2 2 0 0 1-3.6 0'],
  'map-pin': ['M20.5 10.2c0 6.6-8.5 12.3-8.5 12.3S3.5 16.8 3.5 10.2a8.5 8.5 0 0 1 17 0z', 'M12 12.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z'],

  // ── 业务（零售 / 巡店 / 整改 / 沟通） ─────────────────────
  milk: ['M7.5 3.5h9', 'M7.5 3.5v2.2L6 8.2V20a.9.9 0 0 0 .9.9h10.2a.9.9 0 0 0 .9-.9V8.2l-1.5-2.5V3.5', 'M6 12h12'],
  package: [
    'M20.5 16.2V7.8a1 1 0 0 0-.5-.86l-7-4a1 1 0 0 0-1 0l-7 4a1 1 0 0 0-.5.86v8.4a1 1 0 0 0 .5.86l7 4a1 1 0 0 0 1 0l7-4a1 1 0 0 0 .5-.86z',
    'M3.8 7.3 12 12l8.2-4.7',
    'M12 21V12',
  ],
  cart: ['M2.5 3h2.6l2.5 11.6a1.8 1.8 0 0 0 1.76 1.4h8.9a1.8 1.8 0 0 0 1.76-1.4L21.5 6.5H6', 'M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', 'M18.5 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z'],
  truck: ['M2 6.5h11.5v10.5H2z', 'M13.5 10h3.9l3.1 3.1V17h-7z', 'M6.5 20.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M17 20.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  tag: ['M20.6 13.4 12.8 21.2a1.6 1.6 0 0 1-2.26 0L2.4 13.1V4.6a1.6 1.6 0 0 1 1.6-1.6h8.5l8.1 8.1a2 2 0 0 1 0 2.3z', 'M7.6 7.6h.01'],
  clipboard: ['M15.5 4.5H18a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 18 20.5H6A1.5 1.5 0 0 1 4.5 19V6A1.5 1.5 0 0 1 6 4.5h2.5', 'M9 4.5a1.2 1.2 0 0 1 1.2-1.2h3.6A1.2 1.2 0 0 1 15 4.5v1.2A1.2 1.2 0 0 1 13.8 7h-3.6A1.2 1.2 0 0 1 9 5.7V4.5z'],
  camera: [
    'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5l1.8-3h7.4l1.8 3H21a2 2 0 0 1 2 2v11z',
    'M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  ],
  layers: ['M12 2.5 2.5 7.5 12 12.5l9.5-5L12 2.5z', 'M2.5 12.5 12 17.5l9.5-5', 'M2.5 17 12 22l9.5-5'],
  compare: ['M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  message: ['M20.5 14.5a1.8 1.8 0 0 1-1.8 1.8H8.2L3.5 21V5.3A1.8 1.8 0 0 1 5.3 3.5h13.4a1.8 1.8 0 0 1 1.8 1.8v9.2z'],
  send: ['M21.5 2.5 10.8 13.2', 'M21.5 2.5 15 21.5l-4.2-8.3L2.5 9l19-6.5z'],
  'trending-up': ['M3 17l5.5-5.5 3.5 3.5L20 7', 'M15 7h5v5'],

  // ── AI 与即时反馈 ─────────────────────────────────────────
  sparkles: ['M12 3.2l1.7 4.6L18.4 9.5l-4.7 1.7L12 15.8l-1.7-4.6L5.6 9.5l4.7-1.7L12 3.2z', 'M18.5 15.2l.85 2.15L21.5 18.2l-2.15.85L18.5 21.2l-.85-2.15L15.5 18.2l2.15-.85L18.5 15.2z'],
  zap: ['M13.2 2.5 4 13.5h8.3L11.8 21.5 20.5 10h-8.3l1-7.5z'],

  // ── 状态与反馈 ─────────────────────────────────────────────
  check: ['M20 6.5 9.5 17 4 11.5'],
  'check-circle': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8.5 12.2l2.4 2.4 4.6-4.6'],
  'x-circle': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M15 9l-6 6', 'M9 9l6 6'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16v-4.5', 'M12 8h.01'],
  'alert-triangle': ['M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9.5v4', 'M12 17.2h.01'],
  // 圆形警示（与 check-circle / x-circle / info 同族，用于弱于三角告警的提示）
  warning: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7.8v5', 'M12 16.3h.01'],
  // 安全 / 可信：盾牌 + 对勾
  shield: ['M12 21.5s7.5-3.7 7.5-9.5V5.3L12 2.6 4.5 5.3V12c0 5.8 7.5 9.5 7.5 9.5z', 'M9 12.2l2 2 4.3-4.5'],

  // ── 方向 ───────────────────────────────────────────────────
  'arrow-up': ['M12 19V5.5', 'M5.5 12 12 5.5 18.5 12'],
  'arrow-down': ['M12 5v13.5', 'M18.5 12 12 18.5 5.5 12'],
  'chevron-left': ['M15 18.5 8.5 12 15 5.5'],
  'chevron-right': ['M9 5.5 15.5 12 9 18.5'],
  'chevron-up': ['M18 14.5 12 8.5 6 14.5'],
  'chevron-down': ['M6 9.5 12 15.5 18 9.5'],

  // ── 操作 ───────────────────────────────────────────────────
  plus: ['M12 5.5v13', 'M5.5 12h13'],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  refresh: ['M21.5 4.5v6h-6', 'M2.5 19.5v-6h6', 'M19.4 9.2A7.8 7.8 0 0 0 6.3 6.1L2.5 9.2', 'M4.6 14.8a7.8 7.8 0 0 0 13.1 3.1l3.8-3.1'],
  sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1.5 14h5', 'M9.5 8h5', 'M17.5 16h5'],
  filter: ['M3.5 5.5h17l-6.6 7.6v6.4l-3.8 2v-8.4L3.5 5.5z'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7.5V12l3.2 2'],
  download: ['M12 3.5v11.5', 'M7.5 11 12 15.5 16.5 11', 'M4 20.5h16'],
  trash: ['M3.5 6.5h17', 'M8.5 6.5V4.2A1.2 1.2 0 0 1 9.7 3h4.6a1.2 1.2 0 0 1 1.2 1.2v2.3', 'M18.5 6.5 17.6 20.2a1.5 1.5 0 0 1-1.5 1.3H7.9a1.5 1.5 0 0 1-1.5-1.3L5.5 6.5'],
}

/** 当前图标的 path 列表（未知图标回落为 info 中性提示，绝不报错、绝不渲染空白） */
const paths = computed<string[]>(() => ICONS[props.name] ?? ICONS.info)

/** <title> 稳定 id：每实例唯一，仅在传入 title 时被 aria-labelledby 引用 */
const titleId = `app-icon-title-${++iconSeq}`
</script>

<template>
  <svg
    class="app-icon"
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    :stroke="color"
    :stroke-width="STROKE_WIDTH"
    stroke-linecap="round"
    stroke-linejoin="round"
    focusable="false"
    :aria-hidden="title ? undefined : 'true'"
    :role="title ? 'img' : undefined"
    :aria-labelledby="title ? titleId : undefined"
  >
    <title v-if="title" :id="titleId">{{ title }}</title>
    <path v-for="(d, i) in paths" :key="i" :d="d" />
  </svg>
</template>

<style scoped>
.app-icon {
  flex: none;
  display: inline-block;
  vertical-align: middle;
}
</style>
