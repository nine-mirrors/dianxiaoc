<script setup lang="ts">
/**
 * 巡店地图（P2 今日线路可视化）：Leaflet + 高德瓦片（国内免 key 直连）。
 * 标记按健康分四档着色，点击弹出店名与分数。
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
}

const props = withDefaults(defineProps<{ markers?: MapMarker[]; height?: number }>(), {
  markers: () => [],
  height: 260,
})

const el = ref<HTMLDivElement | null>(null)
const wrap = ref<HTMLDivElement | null>(null)
/** 底图瓦片是否加载失败（无网时降级为灰底 + 提示，点位与分数仍准确） */
const tileFailed = ref<boolean>(false)
const isFull = ref<boolean>(false)
let map: L.Map | null = null
let markerGroup: L.LayerGroup | null = null

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

function markerHtml(m: MapMarker): string {
  const color = LEVEL_COLOR[m.level] ?? 'var(--mn-green)'
  return `<div style="width:36px;height:36px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)">${m.score}</div>`
}

function render(): void {
  if (!el.value || map) return
  const center: [number, number] = [30.98, 103.59]
  map = L.map(el.value, { zoomControl: true, attributionControl: false }).setView(center, 13)

  // ★ 无网降级（QA 实测：断网时瓦片全失败但页面零提示，用户以为地图坏了）
  // 统计瓦片加载成功/失败，超过阈值即判定「底图不可用」→ 显示提示条 + 转灰底
  let loaded = 0
  let broken = 0
  const layer = L.tileLayer(
    'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
    { subdomains: ['1', '2', '3', '4'], maxZoom: 18 },
  )
  layer.on('tileload', () => {
    loaded += 1
    if (broken === 0 && loaded >= 1) tileFailed.value = false
  })
  layer.on('tileerror', () => {
    broken += 1
    // 连续失败且没有任何一张成功 → 判定无网
    if (loaded === 0 && broken >= 3) {
      tileFailed.value = true
      el.value?.classList.add('map-view--offline')
    }
  })
  layer.addTo(map)

  markerGroup = L.layerGroup().addTo(map)
  syncMarkers()
}

/** 标记同步：每次 markers 变化先清空再重建，支持异步加载数据 */
function syncMarkers(): void {
  if (!map || !markerGroup) return
  const ms = props.markers
  markerGroup.clearLayers()
  ms.forEach((m) => {
    const icon = L.divIcon({ html: markerHtml(m), className: '', iconSize: [36, 36] })
    L.marker([m.lat, m.lng], { icon }).addTo(markerGroup!).bindPopup(`<b>${m.name}</b><br/>健康分 ${m.score}`)
  })
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

/* 全屏：撑满「手机屏」而非整个浏览器窗口。
   PhoneFrame 的 .phone 已加 z-index:1 形成 containing block，
   因此这里的 fixed 是相对手机屏定位，移动端才符合「手机全屏」的直觉。 */
.map-wrap--full {
  position: fixed;
  inset: 0;
  z-index: 400;
  border-radius: 0;
  background: var(--bg-1, #f5f6f8);
}

.map-view {
  width: 100%;
  height: 100%;
}

.map-view--offline {
  background:
    repeating-linear-gradient(45deg, #eef1ef 0 12px, #e7ebe9 12px 24px);
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
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #e0e4e2;
  color: #6b7280;
  font-size: 11.5px;
  line-height: 1.5;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.map-full-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 500;
  padding: 5px 12px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #1f2937;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}

.map-full-btn:active {
  transform: scale(0.96);
}
</style>
