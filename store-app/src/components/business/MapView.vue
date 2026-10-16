<script setup lang="ts">
/**
 * 巡店地图（P2 今日线路可视化）：Leaflet + 本地高德瓦片（零外网），在线兜底。
 * 标记按健康分四档着色，已巡/待巡状态区分，按拜访顺序串联成动线。
 * 点击弹出店名 + 健康分 + 分档 + 巡店状态 + 进度条。
 */
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapMarker {
  lat: number
  lng: number
  name: string
  score: number
  level: string
  /** 线路拜访顺序（1 起始，用于画动线连线） */
  order?: number
  /** 巡店状态：done 已巡 / pending 待巡 / alert 需重点复查 */
  status?: string
}

const props = withDefaults(defineProps<{ markers?: MapMarker[]; height?: number }>(), {
  markers: () => [],
  height: 260,
})

const el = ref<HTMLDivElement | null>(null)
const wrap = ref<HTMLDivElement | null>(null)
/** 底图瓦片是否加载失败（本地 + 在线都不可用时降级为灰底 + 提示） */
const tileFailed = ref<boolean>(false)
const isFull = ref<boolean>(false)
let map: L.Map | null = null
let markerGroup: L.LayerGroup | null = null
let routeLine: L.Polyline | null = null

/** 全屏 / 退出全屏：同一 Leaflet 实例切换容器尺寸后 invalidateSize 重算瓦片 */
async function toggleFull(): Promise<void> {
  isFull.value = !isFull.value
  await nextTick()
  map?.invalidateSize()
  if (isFull.value && map) map.setView(map.getCenter(), Math.max(map.getZoom(), 14))
}

const LEVEL_COLOR: Record<string, string> = {
  excellent: 'var(--level-excellent)',
  good: 'var(--level-good)',
  warning: 'var(--level-warning)',
  risk: 'var(--level-risk)',
}

const LEVEL_LABEL: Record<string, string> = {
  excellent: '优秀',
  good: '良好',
  warning: '预警',
  risk: '风险',
}

/** 标记气泡：已巡实心 + ✓ 角标，待巡空心描边（视觉区分进度） */
function markerHtml(m: MapMarker): string {
  const color = LEVEL_COLOR[m.level] ?? 'var(--brand)'
  const done = m.status === 'done'
  const bg = done ? color : 'var(--milk)'
  const fg = done ? 'var(--milk)' : color
  const badge = done
    ? '<span style="position:absolute;top:-5px;right:-5px;width:16px;height:16px;border-radius:50%;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;border:1.5px solid var(--milk);box-shadow:0 1px 3px rgba(0,0,0,.3)">✓</span>'
    : ''
  return `<div style="position:relative;width:36px;height:36px;border-radius:50%;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2px solid ${color};box-shadow:0 2px 8px rgba(0,0,0,.35)">${m.score}${badge}</div>`
}

function popupHtml(m: MapMarker): string {
  const color = LEVEL_COLOR[m.level] ?? 'var(--brand)'
  const levelLabel = LEVEL_LABEL[m.level] ?? ''
  const status = m.status ?? 'pending'
  const statusText = status === 'done' ? '✓ 今日已巡' : status === 'alert' ? '⚠ 需重点复查' : '○ 待巡店'
  const statusColor = status === 'alert' ? 'var(--level-warning)' : status === 'done' ? 'var(--brand)' : 'var(--text-3)'
  const pct = Math.max(0, Math.min(100, m.score))
  return `<div style="min-width:150px;font-family:'PingFang SC','Microsoft YaHei',system-ui,sans-serif">
    <div style="font-size:13px;font-weight:700;color:var(--text-1);margin-bottom:4px">${m.name}</div>
    <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:8px">
      <span style="font-size:24px;font-weight:800;line-height:1;color:${color}">${m.score}</span>
      <span style="font-size:11px;color:var(--text-3)">健康分 · ${levelLabel}</span>
    </div>
    <div style="height:6px;border-radius:999px;background:var(--border-color);overflow:hidden;margin-bottom:8px">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:999px"></div>
    </div>
    <div style="font-size:11px;font-weight:600;color:${statusColor}">${statusText}</div>
  </div>`
}

function render(): void {
  if (!el.value || map) return
  // 初始中心 = 演示门店质心（S1–S5 成都温江方向），有标记后 fitBounds 自动重算
  const center: [number, number] = [30.763, 103.975]
  map = L.map(el.value, { zoomControl: true, attributionControl: false }).setView(center, 13)

  /* ── 底图：本地瓦片优先（零外网），缺失时回退在线高德，全挂再判无网 ── */
  let anyLoaded = 0
  let anyBroken = 0
  let localLoaded = 0
  let localBroken = 0
  let onlineAdded = false

  const markUp = () => {
    anyLoaded += 1
    tileFailed.value = false
    el.value?.classList.remove('map-view--offline')
  }
  const markDown = () => {
    anyBroken += 1
    if (anyLoaded === 0 && anyBroken >= 3) {
      tileFailed.value = true
      el.value?.classList.add('map-view--offline')
    }
  }

  const online = L.tileLayer(
    'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
    { subdomains: ['1', '2', '3', '4'], maxZoom: 18 },
  )
  online.on('tileload', markUp)
  online.on('tileerror', markDown)

  const local = L.tileLayer('/tiles/{z}/{x}/{y}.png', { maxZoom: 18, maxNativeZoom: 16 })
  local.on('tileload', () => {
    localLoaded += 1
    markUp()
  })
  local.on('tileerror', () => {
    localBroken += 1
    // 本地瓦片缺失（该缩放级别 / 区域未预下载）→ 无一张成功时切在线
    if (localLoaded === 0 && localBroken >= 3 && !onlineAdded) {
      onlineAdded = true
      online.addTo(map)
    }
  })
  local.addTo(map)

  markerGroup = L.layerGroup().addTo(map)
  syncMarkers()
}

/** 标记同步：按拜访顺序重建标记 + 画动线连线，支持异步加载数据 */
function syncMarkers(): void {
  if (!map || !markerGroup) return
  markerGroup.clearLayers()
  if (routeLine) {
    routeLine.remove()
    routeLine = null
  }

  const ms = [...props.markers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  ms.forEach((m) => {
    const icon = L.divIcon({ html: markerHtml(m), className: '', iconSize: [36, 36] })
    L.marker([m.lat, m.lng], { icon }).addTo(markerGroup!).bindPopup(popupHtml(m))
  })

  // 动线连线：≥2 个点按拜访顺序串联（虚线，不与四档着色争视觉）
  if (ms.length >= 2) {
    routeLine = L.polyline(
      ms.map((m) => [m.lat, m.lng] as [number, number]),
      { color: '#00b451', weight: 3, opacity: 0.55, dashArray: '6 7', lineCap: 'round' },
    ).addTo(map)
  }

  // 自动缩放到包含全部标记
  if (ms.length > 1) {
    map.fitBounds(L.latLngBounds(ms.map((m) => [m.lat, m.lng] as [number, number])).pad(0.25))
  }
}

onMounted(render)
watch(() => props.markers, syncMarkers, { deep: true })
onBeforeUnmount(() => {
  map?.remove()
  map = null
  markerGroup = null
  routeLine = null
})
</script>

<template>
  <div ref="wrap" class="map-wrap" :class="{ 'map-wrap--full': isFull }">
    <div ref="el" class="map-view" :style="{ height: isFull ? '100%' : height + 'px' }" />
    <p v-if="tileFailed" class="map-offline-tip">
      地图底图加载失败（网络受限），门店点位与健康分仍准确
    </p>

    <button class="map-full-btn u-tap" type="button" :aria-label="isFull ? '退出全屏地图' : '全屏查看地图'" @click="toggleFull">
      {{ isFull ? '✕ 退出全屏' : '⤢ 全屏' }}
    </button>
  </div>
</template>

<style scoped>
.map-wrap {
  position: relative;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
}

/* 全屏：撑满当前视口（不再有手机壳作为 containing block，fixed 即相对视口定位）。
   移动形态下视口就是「手机屏」，符合手机全屏的直觉；
   桌面形态下即铺满浏览器窗口，与全屏看图的预期一致。 */
.map-wrap--full {
  position: fixed;
  inset: 0;
  z-index: 400;
  border-radius: 0;
  background: var(--bg-page);
}

.map-view {
  width: 100%;
  height: 100%;
}

.map-view--offline {
  background:
    repeating-linear-gradient(45deg, var(--bg-page) 0 12px, var(--border-color) 12px 24px);
}

.map-offline-tip {
  position: absolute;
  left: 50%;
  top: 10px;
  z-index: 600;
  transform: translateX(-50%);
  max-width: calc(100% - 96px);
  margin: 0;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  color: var(--text-2);
  font-size: 11.5px;
  line-height: 1.5;
  text-align: center;
  box-shadow: var(--sh-1);
}

.map-full-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 500;
  padding: 5px 12px;
  border: none;
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text-1);
  font-size: 12px;
  font-weight: 600;
  box-shadow: var(--sh-2);
  cursor: pointer;
}

.map-full-btn:active {
  transform: scale(0.96);
}
</style>