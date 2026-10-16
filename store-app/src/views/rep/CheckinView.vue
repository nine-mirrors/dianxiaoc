<script setup lang="ts">
/**
 * 业代端 · 到店签到（/rep/checkin/:storeId?）。
 *
 * 三件事：① GPS 定位（失败回退门店登记坐标，绝不弹错误到脸上）
 * ② 水印拍照（真机取景器 / 相册上传 → canvas 烧录「门店名 + 地址 + 时间 + 坐标」水印）
 * ③ 提交签到 createCheckin() 并展示该店最近签到记录 getCheckins()。
 *
 * 数据只走 @/api / @/api/ops；HTTP 失败一律 try/catch + Toast，绝不白屏。
 * 门店解析：:storeId 直达 → 命中任务 id 取 storeId → 今日线路第一站兜底。
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import CameraCapture from '@/components/business/CameraCapture.vue'
import { useToast } from '@/composables/useToast'
import { useHaptics } from '@/composables/useHaptics'
import { useDevice } from '@/composables/useDevice'
import type { CameraCapturedPhoto } from '@/composables/useCamera'
import { useSessionStore } from '@/stores/session'
import { getStore, getTodayRoute, getTasks, uploadPhoto } from '@/api'
import { createCheckin, getCheckins, type CheckinRecord } from '@/api/ops'
import { formatShortTime } from '@/utils/format'
import { haversineKm, fmtKm } from '@/domain/geo'
import type { Store } from '@/types'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const toast = useToast()
const haptics = useHaptics()
const device = useDevice()

const repId = computed<string>(() => session.user?.id || 'U_REP')

/* ─────────────── 门店解析 ─────────────── */

const loading = ref<boolean>(true)
const store = ref<Store | null>(null)

async function resolveStore(): Promise<Store | null> {
  const param = String(route.params.storeId ?? '').trim()
  if (param) {
    try {
      const res = await getStore(param)
      if (res.store) return res.store
    } catch {
      /* 继续按任务 id 解析 */
    }
    try {
      const res = await getTasks(repId.value)
      const task = (res.tasks ?? []).find((t) => t.id === param)
      if (task) {
        const hit = await getStore(task.storeId)
        if (hit.store) return hit.store
      }
    } catch {
      /* ignore */
    }
  }
  try {
    const today = await getTodayRoute(repId.value)
    const first = today.routeStores?.[0]?.store
    if (first) return first
  } catch {
    /* ignore */
  }
  return null
}

/** 距起点距离（km）：由线路首店坐标与当前门店坐标现算；无坐标显 — */
const distanceText = computed<string>(() => {
  const s = store.value
  if (!s || s.lat == null || s.lng == null || !originCoord.value) return '—'
  return fmtKm(haversineKm(originCoord.value, { lat: Number(s.lat), lng: Number(s.lng) }))
})

/** 今日线路首店坐标（距离基准） */
const originCoord = ref<{ lat: number; lng: number } | null>(null)

/* ─────────────── 定位 ─────────────── */

interface Fix {
  lat: number
  lng: number
  /** 精度（米）；门店登记坐标回退时为 0 */
  accuracy: number
}

const locating = ref<boolean>(false)
const position = ref<Fix | null>(null)
/** 定位来源：gps 真机定位 / store 门店登记坐标 / none 不可用 */
const locSource = ref<'gps' | 'store' | 'none'>('none')

function fallbackStore(): void {
  const s = store.value
  if (s && (s.lat != null || s.lng != null)) {
    position.value = { lat: s.lat ?? 0, lng: s.lng ?? 0, accuracy: 0 }
    locSource.value = 'store'
  } else {
    position.value = null
    locSource.value = 'none'
  }
}

/** 触发一次定位；失败静默回退门店坐标（不打断签到流程） */
async function locate(): Promise<void> {
  if (locating.value) return
  locating.value = true
  try {
    await new Promise<void>((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve()
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          position.value = {
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : 0,
          }
          locSource.value = 'gps'
          resolve()
        },
        () => resolve(),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 },
      )
    })
  } finally {
    if (locSource.value !== 'gps') fallbackStore()
    locating.value = false
  }
}

const coordinateText = computed<string>(() => {
  const p = position.value
  if (!p) return '未获取到坐标'
  const base = `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`
  return p.accuracy > 0 ? `${base} · 精度 ±${p.accuracy}m` : base
})

const locLabel = computed<string>(() => {
  if (locSource.value === 'gps') return 'GPS 定位成功'
  if (locSource.value === 'store') return '使用门店登记坐标'
  return '定位不可用'
})

/* ─────────────── 时间水印文案 ─────────────── */

function nowText(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const stampTime = ref<string>(nowText())

/** 水印三行：门店名 / 地址 / 时间·坐标 */
const stampLines = computed<string[]>(() => {
  const lines = [
    store.value?.name ?? '到店签到',
    store.value?.address ?? '',
    `${stampTime.value} · ${position.value ? coordinateText.value : '定位不可用'}`,
  ]
  return lines.filter(Boolean)
})

/* ─────────────── 水印拍照 ─────────────── */

interface Shot {
  /** 上传后的 photoId（上传失败时为本地占位 id） */
  id: string
  /** 已烧录水印的图片地址（dataURL，预览与上传同源） */
  url: string
  /** 上传用 dataURL */
  dataUrl: string
}

const shot = ref<Shot | null>(null)
const processing = ref<boolean>(false)
const cameraVisible = ref<boolean>(false)
const cameraProbing = ref<boolean>(false)
const fileInput = ref<HTMLInputElement | null>(null)

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

/** 在照片底部烧录水印层（半透明黑渐变 + 白色文字），失败则原样返回 */
async function burnWatermark(dataUrl: string): Promise<string> {
  try {
    const img = await loadImage(dataUrl)
    const MAX = 1440
    const scale = Math.min(1, MAX / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, w, h)

    const bandH = Math.max(104, Math.round(h * 0.24))
    const grad = ctx.createLinearGradient(0, h - bandH, 0, h)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,0,0.72)')
    ctx.fillStyle = grad
    ctx.fillRect(0, h - bandH, w, bandH)

    const fs = Math.max(18, Math.round(w * 0.034))
    const lineH = Math.round(fs * 1.4)
    const lines = stampLines.value
    ctx.textBaseline = 'alphabetic'
    let baseline = h - Math.round(fs * 0.7) - lineH * (lines.length - 1)
    for (let i = 0; i < lines.length; i++) {
      ctx.font = i === 0 ? `700 ${fs}px system-ui, "PingFang SC", sans-serif` : `400 ${Math.round(fs * 0.82)}px system-ui, "PingFang SC", sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.98)'
      ctx.fillText(lines[i], Math.round(fs * 0.6), baseline)
      baseline += lineH
    }
    return canvas.toDataURL('image/jpeg', 0.86)
  } catch {
    return dataUrl
  }
}

/** 接收一张外部图片：烧录水印 → 真上传拿 photoId（失败退回占位 id） */
async function acceptShot(dataUrl: string, name: string): Promise<void> {
  if (processing.value) return
  processing.value = true
  try {
    stampTime.value = nowText()
    const burned = await burnWatermark(dataUrl)
    let id = `UP_${Date.now()}`
    try {
      const res = await uploadPhoto(burned, name || 'checkin.jpg')
      id = res.photoId
    } catch {
      /* 上传失败：保留占位 id，演示不中断 */
    }
    shot.value = { id, url: burned, dataUrl: burned }
    haptics.success()
    toast.success('已生成带水印的到店照片')
  } finally {
    processing.value = false
  }
}

/** 拍照入口：有摄像头走取景器，否则引导相册上传 */
async function onPhotoPress(): Promise<void> {
  if (processing.value || cameraProbing.value || cameraVisible.value) return
  cameraProbing.value = true
  try {
    const hasCamera = await device.hasCamera()
    if (hasCamera) {
      cameraVisible.value = true
    } else {
      toast.info('未检测到摄像头，请选择相册照片生成水印')
      pickFromAlbum()
    }
  } finally {
    cameraProbing.value = false
  }
}

function pickFromAlbum(): void {
  if (processing.value) return
  fileInput.value?.click()
}

function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => void acceptShot(String(reader.result), file.name)
  reader.readAsDataURL(file)
}

function onCameraCaptured(payload: CameraCapturedPhoto): void {
  cameraVisible.value = false
  void acceptShot(payload.dataUrl, payload.name)
}

function onCameraClose(): void {
  cameraVisible.value = false
}

function onCameraFallbackAlbum(): void {
  cameraVisible.value = false
  pickFromAlbum()
}

function clearShot(): void {
  shot.value = null
  haptics.select()
}

/* ─────────────── 提交签到 ─────────────── */

const submitting = ref<boolean>(false)

async function submitCheckin(): Promise<void> {
  if (!store.value) {
    toast.error('未匹配到门店，无法签到')
    return
  }
  if (submitting.value) return
  submitting.value = true
  try {
    await createCheckin({
      storeId: store.value.id,
      lat: position.value?.lat,
      lng: position.value?.lng,
      addr: store.value.address,
      photoId: shot.value?.id,
    })
    haptics.success()
    toast.success('到店签到成功，已留存到店凭证')
    shot.value = null
    await loadHistory()
  } catch {
    haptics.error()
    toast.error('签到提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

/* ─────────────── 签到历史 ─────────────── */

const checkins = ref<CheckinRecord[]>([])
const histLoading = ref<boolean>(false)

async function loadHistory(): Promise<void> {
  if (!store.value) return
  histLoading.value = true
  try {
    const res = await getCheckins({ storeId: store.value.id, page: 1, pageSize: 20 })
    checkins.value = res.items ?? []
  } catch {
    toast.error('签到记录加载失败')
  } finally {
    histLoading.value = false
  }
}

function goBack(): void {
  router.push('/rep/today')
}

/* ─────────────── 门店一键导航（调起高德地图） ─────────────── */

/** 可导航目标的最小结构（与 Store 的 name/lat/lng 兼容） */
interface NavTarget {
  name?: string
  lat?: number | null
  lng?: number | null
}

/** 仅当门店同时具备 lat / lng 时才提供导航入口 */
function hasLatLng(target: NavTarget | null | undefined): boolean {
  return !!target && target.lat != null && target.lng != null
}

/**
 * 新标签调起高德地图驾车导航：fixture 坐标为 WGS84，coordinate=wgs84 让高德自动转 GCJ02；
 * 手机端 callnative=1 唤起高德 App，桌面端打开网页地图。无坐标时静默不动作（按钮本就不渲染）。
 */
function openStoreNav(target: NavTarget | null | undefined): void {
  if (!hasLatLng(target)) return
  const name = target.name || '门店'
  const url = `https://uri.amap.com/navigation?to=${target.lng},${target.lat},${encodeURIComponent(
    name,
  )}&mode=car&coordinate=wgs84&callnative=1`
  window.open(url, '_blank', 'noopener')
}

onMounted(async () => {
  // 距离基准：今日线路首店坐标（独立获取，门店解析失败也不影响）
  try {
    const today = await getTodayRoute(repId.value)
    const first = today.routeStores?.find((r) => r.store.lat != null && r.store.lng != null)
    if (first) originCoord.value = { lat: Number(first.store.lat), lng: Number(first.store.lng) }
  } catch {
    /* 无线路数据时距离显 — */
  }
  store.value = await resolveStore()
  loading.value = false
  await locate()
  await loadHistory()
})
</script>

<template>
  <MobileLayout title="到店签到" :back="true" :content-padding-bottom="118" @back="goBack">
    <!-- 门店卡 -->
    <div class="ck-pad">
      <SkeletonBlock v-if="loading" height="80px" radius="12px" />
      <div v-else-if="store" class="u-card ck-store mot-rise">
        <div class="ck-store__head">
          <p class="ck-store__name">
            <AppIcon name="store" :size="15" color="var(--mn-green)" />
            {{ store.name }}
          </p>
          <span class="ck-store__type">{{ store.typeLabel }}</span>
        </div>
        <p class="ck-store__meta ck-store__meta--nav">
          <span class="ck-store__addr">
            <AppIcon name="map-pin" :size="13" color="var(--text-3)" />
            {{ store.address }}
          </span>
          <button
            v-if="hasLatLng(store)"
            type="button"
            class="u-btn u-btn--ghost ck-store__nav u-tap"
            aria-label="高德地图导航到当前门店"
            @click="openStoreNav(store)"
          >
            <AppIcon name="map-pin" :size="12" /> 导航
          </button>
        </p>
        <p class="ck-store__meta">负责人：{{ store.ownerName }} · 距起点 {{ distanceText }}km</p>
      </div>
      <EmptyState v-else icon="store" title="未匹配到门店" desc="请从今日巡店列表进入签到" />
    </div>

    <!-- 定位卡 -->
    <div v-if="store" class="ck-pad">
      <div class="u-card ck-loc mot-rise">
        <div class="ck-loc__row">
          <span class="ck-loc__title">
            <AppIcon name="map-pin" :size="14" color="var(--mn-green)" /> 当前定位
          </span>
          <button type="button" class="ck-loc__refresh u-tap mot-tap" :disabled="locating" @click="locate">
            <AppIcon name="refresh" :size="13" />
            {{ locating ? '定位中…' : '重新定位' }}
          </button>
        </div>
        <p class="ck-loc__coord">{{ coordinateText }}</p>
        <span class="ck-loc__pill" :class="`ck-loc__pill--${locSource}`">{{ locLabel }}</span>
      </div>
    </div>

    <!-- 水印拍照 -->
    <div v-if="store" class="ck-pad">
      <div class="u-card ck-photo-wrap mot-rise">
        <div class="ck-photo" :class="{ 'ck-photo--empty': !shot }">
          <template v-if="shot">
            <img class="ck-photo__img" :src="shot.url" alt="到店水印照片" />
            <div class="ck-photo__wm">
              <p
                v-for="(ln, i) in stampLines"
                :key="i"
                class="ck-photo__wm-line"
                :class="{ 'ck-photo__wm-line--title': i === 0 }"
              >
                {{ ln }}
              </p>
            </div>
          </template>
          <div v-else class="ck-photo__empty">
            <AppIcon name="camera" :size="26" color="var(--text-4)" />
            <p>{{ processing ? '正在生成水印…' : '拍摄带水印的到店照片' }}</p>
          </div>
        </div>

        <div class="ck-photo__entry">
          <button
            type="button"
            class="ck-entry__btn ck-entry__btn--primary u-tap mot-tap"
            :disabled="processing || cameraProbing || cameraVisible"
            @click="onPhotoPress"
          >
            <AppIcon name="camera" :size="15" color="#fff" />
            {{ cameraProbing ? '检测相机…' : '拍照' }}
          </button>
          <button type="button" class="ck-entry__btn u-tap mot-tap" :disabled="processing" @click="pickFromAlbum">
            <AppIcon name="image" :size="15" /> 相册上传
          </button>
          <button v-if="shot" type="button" class="ck-entry__btn ck-entry__btn--ghost u-tap mot-tap" @click="clearShot">
            <AppIcon name="trash" :size="15" /> 重拍
          </button>
        </div>
        <input ref="fileInput" class="ck-hidden" type="file" accept="image/*" @change="onFileChange" />
        <p class="ck-photo__tip">水印含门店名、地址、时间与坐标，将作为到店凭证留存</p>
      </div>
    </div>

    <!-- 签到历史 -->
    <div v-if="store" class="ck-pad mot-rise">
      <p class="ck-sec-title">最近签到记录</p>
      <SkeletonBlock v-if="histLoading" height="64px" radius="12px" />
      <div v-else-if="checkins.length" class="u-card ck-hist mot-stagger">
        <div v-for="c in checkins" :key="c.id" class="ck-hist__row">
          <span class="ck-hist__dot"><AppIcon name="check" :size="12" color="#fff" /></span>
          <div class="ck-hist__body">
            <p class="ck-hist__time">{{ formatShortTime(c.createdAt) }}</p>
            <p class="ck-hist__addr u-ellipsis">{{ c.addr || store.address }}</p>
          </div>
          <span class="ck-hist__badge" :class="{ 'ck-hist__badge--photo': !!c.photoId }">
            {{ c.photoId ? '有水印照' : '无照片' }}
          </span>
        </div>
      </div>
      <EmptyState v-else icon="history" title="暂无签到记录" desc="提交本次签到后将在此显示" />
    </div>

    <template #footer>
      <div class="ck-bar u-safe-bottom">
        <button
          type="button"
          class="ck-submit mot-tap"
          :class="{ 'mot-press-loading': submitting }"
          :disabled="!store || submitting"
          @click="submitCheckin"
        >
          <AppIcon name="check" :size="17" color="#fff" />
          {{ submitting ? '提交中…' : '提交签到' }}
        </button>
      </div>

      <CameraCapture
        :visible="cameraVisible"
        @close="onCameraClose"
        @captured="onCameraCaptured"
        @fallback-album="onCameraFallbackAlbum"
      />
    </template>
  </MobileLayout>
</template>

<style scoped>
.ck-pad {
  padding: 14px 12px 0;
}

/* 门店卡 */
.ck-store {
  padding: 12px;
  border-left: 4px solid var(--mn-green);
}

.ck-store__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ck-store__name {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

/* 地址 + 导航同一行：地址占满，导航在右端不挤店名 */
.ck-store__meta--nav {
  justify-content: space-between;
  gap: 10px;
}

.ck-store__addr {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

/* 导航小按钮：ghost 小尺寸，贴在地址行右端 */
.ck-store__nav {
  flex: none;
  height: 28px;
  min-height: 28px;
  padding: 0 10px;
  gap: 4px;
  font-size: 12px;
}

.ck-store__type {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-size: 11px;
  font-weight: 600;
}

.ck-store__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 5px;
  font-size: 12px;
  color: var(--text-3);
}

/* 定位卡 */
.ck-loc {
  padding: 12px;
}

.ck-loc__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ck-loc__title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}

.ck-loc__refresh {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-page);
  color: var(--mn-green-dark);
  font-size: 12px;
  font-weight: 600;
}

.ck-loc__refresh:disabled {
  opacity: 0.6;
}

.ck-loc__coord {
  margin-top: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.ck-loc__pill {
  display: inline-block;
  margin-top: 8px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.ck-loc__pill--gps {
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
}

.ck-loc__pill--store {
  background: var(--warning-bg);
  color: var(--warning-fg);
}

.ck-loc__pill--none {
  background: var(--danger-bg);
  color: var(--danger-fg);
}

/* 水印拍照 */
.ck-photo-wrap {
  padding: 12px;
}

.ck-photo {
  position: relative;
  width: 100%;
  height: 216px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-page);
}

.ck-photo--empty {
  border: 1.5px dashed var(--text-4);
}

.ck-photo__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ck-photo__wm {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20px 10px 9px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.72) 100%);
}

.ck-photo__wm-line {
  color: #fff;
  font-size: 11px;
  line-height: 1.55;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
}

.ck-photo__wm-line--title {
  font-size: 13px;
  font-weight: 700;
}

.ck-photo__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
  color: var(--text-3);
  font-size: 13px;
}

.ck-photo__entry {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.ck-entry__btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid var(--mn-green);
  border-radius: 12px;
  background: var(--bg-card);
  color: var(--mn-green-dark);
  font-size: 13px;
  font-weight: 600;
}

.ck-entry__btn--primary {
  background: var(--mn-green);
  color: #fff;
}

.ck-entry__btn--ghost {
  flex: none;
  border-color: var(--border-color);
  color: var(--text-2);
}

.ck-entry__btn:disabled {
  opacity: 0.55;
}

.ck-hidden {
  display: none;
}

.ck-photo__tip {
  margin-top: 9px;
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.5;
}

/* 历史 */
.ck-sec-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}

.ck-hist {
  padding: 4px 12px;
}

.ck-hist__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px dashed var(--border-color);
}

.ck-hist__row:last-child {
  border-bottom: none;
}

.ck-hist__dot {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--mn-green);
}

.ck-hist__body {
  flex: 1;
  min-width: 0;
}

.ck-hist__time {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}

.ck-hist__addr {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
}

.ck-hist__badge {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-page);
  color: var(--text-3);
  font-size: 11px;
}

.ck-hist__badge--photo {
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
}

/* 底部提交栏 */
.ck-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  padding-top: 14px;
  padding-right: 12px;
  padding-left: 12px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--bg-page) 0%, transparent) 0%, var(--bg-page) 42%);
}

.ck-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 52px;
  border: none;
  border-radius: 26px;
  background: var(--mn-green);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  box-shadow: var(--sh-brand);
}

.ck-submit:disabled {
  background: var(--text-4);
  box-shadow: none;
  opacity: 0.85;
}
</style>
