<script setup lang="ts">
/**
 * 业代端 · 标准巡店八步骤（/rep/steps/:taskId?）。
 *
 * 一条自上而下的步骤流（与六维诊断对齐的 8 步）：每步可展开，含状态（未开始/进行中/已完成）、
 * 说明与拍摄引导；每步可拍照（真机取景器 / 相册上传 → uploadPhoto 落盘拿 photoId）。
 * 底部悬浮 CTA：非末步「下一步」推进并标记完成，末步「生成 AI 诊断报告」→ createDiagnosis → 跳诊断页。
 * 顶部显示门店名：由 :taskId 解析（门店 id / 任务 id），解析不到用 getTodayRoute() 第一站兜底。
 *
 * 数据只走 @/api / @/api/ops，失败一律 try/catch + Toast，绝不白屏。
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MilkDropLoader from '@/components/common/MilkDropLoader.vue'
import CameraCapture from '@/components/business/CameraCapture.vue'
import { useToast } from '@/composables/useToast'
import { useHaptics } from '@/composables/useHaptics'
import { useDevice } from '@/composables/useDevice'
import type { CameraCapturedPhoto } from '@/composables/useCamera'
import { useSessionStore } from '@/stores/session'
import { getStore, getTasks, getTodayRoute, createDiagnosis, createVisit, uploadPhoto } from '@/api'
import type { Store, ShootType } from '@/types'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const toast = useToast()
const haptics = useHaptics()
const device = useDevice()

const repId = computed<string>(() => session.user?.id || 'U_REP')

/* ─────────────── 八步骤定义 ─────────────── */

interface StepDef {
  key: string
  title: string
  icon: string
  desc: string
  shootHint: string
}

const STEPS: StepDef[] = [
  { key: 'checkin', title: '到店签到', icon: 'map-pin', desc: '记录到店时间与位置，留存带水印的到店凭证', shootHint: '拍门头与招牌，画面尽量含店名与时间地点' },
  { key: 'facade', title: '门头与店面', icon: 'store', desc: '门头物料、堆头、地堆与促销台是否完好到位', shootHint: '门头全景，若有大堆头一并入镜' },
  { key: 'main', title: '主陈列面（黄金位/排面）', icon: 'layers', desc: '黄金陈列位是否被蒙牛占据、排面数量是否达标', shootHint: '正对主货架，覆盖黄金视线层（约 110–160cm）' },
  { key: 'cold', title: '冷链冰柜温度与陈列', icon: 'milk', desc: '冰柜温度、陈列饱满度与蒙牛冷柜占比', shootHint: '打开柜门拍整柜陈列，能看清层板产品' },
  { key: 'pricetag', title: '价签核对', icon: 'tag', desc: '价签与系统价格、促销标签是否一致', shootHint: '价签与对应商品同框，避免反光模糊' },
  { key: 'competitor', title: '竞品对比', icon: 'compare', desc: '竞品排面占比、促销动作与抢占情况', shootHint: '拍竞品区域，尽量完整呈现相邻排面' },
  { key: 'inventory', title: '库存盘点和临期检查', icon: 'package', desc: '库存量、临期批次与缺货断货情况', shootHint: '拍后仓或货架库存区，可见批号与效期' },
  { key: 'summary', title: '沟通总结与整改', icon: 'message', desc: '与店主沟通确认、明确整改项与订货需求', shootHint: '拍整改后现场或沟通留证均可' },
]

/* ─────────────── 门店解析 ─────────────── */

const loading = ref<boolean>(true)
const store = ref<Store | null>(null)

/** 由 :taskId 解析门店：① 直接是门店 id ② 命中任务 id 取其 storeId ③ 今日线路第一站兜底 */
async function resolveStore(): Promise<Store | null> {
  const param = String(route.params.taskId ?? '').trim()
  if (param) {
    try {
      const res = await getStore(param)
      if (res.store) return res.store
    } catch {
      /* 继续尝试按任务解析 */
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

onMounted(async () => {
  store.value = await resolveStore()
  loading.value = false
})

const storeName = computed<string>(() => store.value?.name ?? '未匹配到门店')
const storeMeta = computed<string>(() => {
  const s = store.value
  if (!s) return ''
  return `${s.typeLabel} · 负责人：${s.ownerName}`
})

/* ─────────────── 步骤状态 ─────────────── */

interface StepShot {
  id: string
  url: string
}

/** 每步已拍照片（index → 照片列表） */
const shots = ref<StepShot[][]>(STEPS.map(() => []))
/** 已完成步骤下标 */
const doneSteps = ref<number[]>([])
/** 当前进行中步骤 */
const current = ref<number>(0)
/** 展开的步骤下标（默认展开当前步） */
const expanded = ref<number[]>([0])

/** 步骤状态：done 已完成 / active 进行中 / todo 未开始 */
function stepStatus(i: number): 'done' | 'active' | 'todo' {
  if (doneSteps.value.includes(i)) return 'done'
  if (i === current.value) return 'active'
  return 'todo'
}

const STATUS_LABEL: Record<'done' | 'active' | 'todo', string> = {
  done: '已完成',
  active: '进行中',
  todo: '未开始',
}

function stepShots(i: number): StepShot[] {
  return shots.value[i] ?? []
}

/** 总拍摄数（用于顶部概览与生成前校验） */
const totalShots = computed<number>(() => shots.value.reduce((sum, list) => sum + list.length, 0))
/** 完成进度 0–8 */
const progress = computed<number>(() => doneSteps.value.length)

function toggleExpand(i: number): void {
  if (expanded.value.includes(i)) expanded.value = expanded.value.filter((x) => x !== i)
  else expanded.value = [...expanded.value, i]
}

/** 标记某步完成（去重） */
function finishStep(i: number): void {
  if (!doneSteps.value.includes(i)) doneSteps.value = [...doneSteps.value, i]
}

/* ─────────────── 拍照 ─────────────── */

const cameraVisible = ref<boolean>(false)
const cameraProbing = ref<boolean>(false)
const shooting = ref<boolean>(false)
const fileInput = ref<HTMLInputElement | null>(null)
/** 当前拍照目标步骤下标 */
const captureTarget = ref<number>(0)

const MAX_PER_STEP = 4

/** 点击拍照：真机有摄像头 → 取景器；否则回退模拟快门（演示不中断） */
async function onPhotoPress(i: number): Promise<void> {
  captureTarget.value = i
  if (stepShots(i).length >= MAX_PER_STEP) {
    toast.info(`单步最多拍摄 ${MAX_PER_STEP} 张`)
    return
  }
  if (cameraProbing.value || cameraVisible.value) return
  cameraProbing.value = true
  try {
    const hasCamera = await device.hasCamera()
    if (hasCamera) {
      cameraVisible.value = true
    } else {
      await simulateShot(i)
    }
  } finally {
    cameraProbing.value = false
  }
}

/** 无摄像头环境下的模拟拍照（沿用 CaptureView 快门反馈思路） */
async function simulateShot(i: number): Promise<void> {
  if (shooting.value) return
  shooting.value = true
  haptics.select()
  await new Promise((r) => setTimeout(r, 500))
  shooting.value = false
  toast.info('当前设备无摄像头，已用占位图记录；请以真机相册上传为准')
}

/** 相册上传入口 */
function pickFromAlbum(i: number): void {
  captureTarget.value = i
  if (stepShots(i).length >= MAX_PER_STEP) {
    toast.info(`单步最多拍摄 ${MAX_PER_STEP} 张`)
    return
  }
  fileInput.value?.click()
}

function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const localUrl = URL.createObjectURL(file)
  const reader = new FileReader()
  reader.onload = () => {
    void acceptShot(captureTarget.value, String(reader.result), file.name, localUrl)
  }
  reader.readAsDataURL(file)
}

/** 真机取景器确认使用 */
function onCameraCaptured(payload: CameraCapturedPhoto): void {
  cameraVisible.value = false
  const localUrl = URL.createObjectURL(payload.blob)
  void acceptShot(captureTarget.value, payload.dataUrl, payload.name, localUrl)
}

function onCameraClose(): void {
  cameraVisible.value = false
}

/** 取景器错误分支选「相册上传」：关闭取景器并拉起既有 file input */
function onCameraFallbackAlbum(): void {
  cameraVisible.value = false
  pickFromAlbum(captureTarget.value)
}

/** 上传一张照片：真上传拿 photoId，失败退回本地占位 id，写入对应步骤 */
async function acceptShot(i: number, dataUrl: string, name: string, localUrl: string): Promise<void> {
  if (stepShots(i).length >= MAX_PER_STEP) {
    toast.info(`单步最多拍摄 ${MAX_PER_STEP} 张`)
    return
  }
  let id = `UP_${Date.now()}`
  try {
    const res = await uploadPhoto(dataUrl, name)
    id = res.photoId
  } catch {
    /* 上传失败：用占位 id 保证演示不中断 */
  }
  const list = shots.value[i] ? [...shots.value[i]] : []
  list.push({ id, url: localUrl })
  shots.value = shots.value.map((s, idx) => (idx === i ? list : s))
  haptics.success()
  toast.success('照片已记录到本步骤')
}

function removeShot(i: number, id: string): void {
  const list = stepShots(i).filter((s) => s.id !== id)
  shots.value = shots.value.map((s, idx) => (idx === i ? list : s))
}

/* ─────────────── 底部 CTA ─────────────── */

const isLast = computed<boolean>(() => current.value === STEPS.length - 1)
const generating = ref<boolean>(false)

/** 下一步：标记当前步完成并推进（末步不推进） */
function goNext(): void {
  finishStep(current.value)
  haptics.select()
  if (current.value < STEPS.length - 1) {
    current.value += 1
    if (!expanded.value.includes(current.value)) expanded.value = [...expanded.value, current.value]
  }
}

/** 生成 AI 诊断报告：汇总全部步骤照片 → createDiagnosis → 跳诊断页 */
async function finishAndDiagnose(): Promise<void> {
  if (generating.value) return
  if (!store.value) {
    toast.error('未匹配到门店，请从今日巡店进入')
    return
  }
  if (totalShots.value === 0) {
    toast.info('请至少拍摄 1 张现场照片再生成诊断')
    return
  }
  generating.value = true
  finishStep(current.value)
  const photoIds = shots.value.flat().map((s) => s.id).filter(Boolean)
  const shootTypes: ShootType[] = ['cold', 'ambient', 'stack']
  try {
    const res = await createDiagnosis({
      storeId: store.value.id,
      photoIds,
      shootTypes,
      unknownPhoto: true,
    })
    // 回写巡店记录（失败不阻断进入诊断页）
    try {
      await createVisit({
        storeId: store.value.id,
        photoIds,
        shootTypes,
        checkin: {
          lat: store.value.lat ?? 30.98,
          lng: store.value.lng ?? 103.59,
          at: '现场',
        },
      })
    } catch {
      /* 巡店回写失败：仍可查看诊断 */
    }
    haptics.success()
    router.replace(`/rep/diagnosis/${res.diagnosis.id}`)
  } catch {
    generating.value = false
    haptics.error()
    toast.error('AI 诊断生成失败，请重试')
  }
}

function onBack(): void {
  router.push('/rep/today')
}
</script>

<template>
  <MobileLayout title="标准巡店八步骤" :back="true" :content-padding-bottom="96" @back="onBack">
    <template #right>
      <span class="vs-progress-tag">{{ progress }}/{{ STEPS.length }}</span>
    </template>

    <!-- 门店卡 -->
    <div class="vs-store">
      <SkeletonBlock v-if="loading" height="64px" radius="12px" />
      <div v-else class="vs-store__card">
        <p class="vs-store__name">
          <AppIcon name="map-pin" :size="14" color="var(--mn-green)" />
          {{ storeName }}
        </p>
        <p v-if="storeMeta" class="vs-store__meta">{{ storeMeta }}</p>
        <p v-else class="vs-store__meta">请从今日巡店或任务进入，以自动匹配门店</p>
      </div>
    </div>

    <!-- 进度条 -->
    <div class="vs-progress">
      <div class="vs-progress__track">
        <span class="vs-progress__bar" :style="{ width: `${(progress / STEPS.length) * 100}%` }" />
      </div>
      <span class="vs-progress__cap">已完成 {{ progress }} 步 · 已拍 {{ totalShots }} 张</span>
    </div>

    <!-- 空态兜底 -->
    <EmptyState
      v-if="!loading && !store"
      icon="store"
      title="未匹配到门店"
      desc="请从今日巡店或经理下派任务进入，自动带出门店"
      action-text="回今日巡店"
      @action="onBack"
    />

    <!-- 步骤流 -->
    <div v-else class="vs-steps">
      <div
        v-for="(s, i) in STEPS"
        :key="s.key"
        class="vs-step"
        :class="[`vs-step--${stepStatus(i)}`, { 'vs-step--open': expanded.includes(i) }]"
      >
        <button
          type="button"
          class="vs-step__head mot-tap"
          :aria-expanded="expanded.includes(i)"
          @click="toggleExpand(i)"
        >
          <span class="vs-step__idx">
            <AppIcon v-if="stepStatus(i) === 'done'" name="check" :size="14" color="#fff" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span class="vs-step__text">
            <span class="vs-step__title">
              <AppIcon :name="s.icon" :size="15" color="var(--mn-green)" />
              {{ s.title }}
            </span>
            <span class="vs-step__desc">{{ s.desc }}</span>
          </span>
          <span class="vs-step__status" :class="`is-${stepStatus(i)}`">{{ STATUS_LABEL[stepStatus(i)] }}</span>
          <AppIcon
            :name="expanded.includes(i) ? 'chevron-up' : 'chevron-down'"
            :size="16"
            color="var(--text-3)"
          />
        </button>

        <div v-if="expanded.includes(i)" class="vs-step__body">
          <p class="vs-step__hint">
            <AppIcon name="camera" :size="13" color="var(--text-3)" />
            {{ s.shootHint }}
          </p>

          <div class="vs-step__entry">
            <button
              type="button"
              class="vs-entry__btn vs-entry__btn--primary mot-tap"
              :disabled="cameraProbing || cameraVisible || shooting"
              @click="onPhotoPress(i)"
            >
              <AppIcon name="camera" :size="15" color="#fff" />
              {{ cameraProbing ? '检测相机…' : '拍照' }}
            </button>
            <button type="button" class="vs-entry__btn mot-tap" @click="pickFromAlbum(i)">
              <AppIcon name="layers" :size="15" /> 从相册上传
            </button>
          </div>

          <div v-if="stepShots(i).length" class="vs-thumbs">
            <div v-for="p in stepShots(i)" :key="p.id" class="vs-thumb-wrap">
              <img class="vs-thumb" :src="p.url" :alt="s.title" />
              <button type="button" class="vs-thumb__del u-tap" aria-label="移除该照片" @click="removeShot(i, p.id)">✕</button>
            </div>
            <span class="vs-thumbs__tip">已拍 {{ stepShots(i).length }}/{{ MAX_PER_STEP }}</span>
          </div>
          <p v-else class="vs-thumbs__empty">暂无照片，建议至少拍 1 张留证</p>

          <button
            v-if="stepStatus(i) !== 'done'"
            type="button"
            class="vs-step__done u-tap"
            @click="finishStep(i)"
          >
            <AppIcon name="check-circle" :size="14" color="var(--mn-green)" /> 标记本步完成
          </button>
        </div>
      </div>
    </div>

    <input ref="fileInput" class="vs-hidden-file" type="file" accept="image/*" @change="onFileChange" />

    <!-- AI 生成遮罩：仅奶滴图标，不显示文字（按定稿口径） -->
    <div v-if="generating" class="vs-overlay">
      <MilkDropLoader size="card" label="" />
    </div>

    <!-- 底部悬浮 CTA -->
    <template #footer>
      <div class="vs-bar u-safe-bottom">
        <p class="vs-bar__step">当前：{{ current + 1 }}. {{ STEPS[current].title }}</p>
        <button
          v-if="!isLast"
          type="button"
          class="vs-bar__btn vs-bar__btn--primary mot-tap"
          @click="goNext"
        >
          下一步
          <AppIcon name="chevron-right" :size="16" color="#fff" />
        </button>
        <button
          v-else
          type="button"
          class="vs-bar__btn vs-bar__btn--ai mot-tap"
          :disabled="generating"
          @click="finishAndDiagnose"
        >
          <AppIcon name="sparkles" :size="16" color="#fff" />
          生成 AI 诊断报告
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
.vs-progress-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* 门店卡 */
.vs-store {
  padding: 12px 12px 0;
}

.vs-store__card {
  padding: 12px;
  border-radius: var(--radius-card);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  border-left: 4px solid var(--mn-green);
}

.vs-store__name {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

.vs-store__meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-3);
}

/* 进度 */
.vs-progress {
  padding: 12px 12px 0;
}

.vs-progress__track {
  height: 8px;
  border-radius: 999px;
  background: var(--border-color);
  overflow: hidden;
}

.vs-progress__bar {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--mn-green);
  transition: width var(--dur-base) var(--ease-standard);
}

.vs-progress__cap {
  display: block;
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--text-3);
}

/* 步骤流 */
.vs-steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.vs-step {
  border-radius: var(--radius-card);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  border-left: 4px solid var(--border-color);
}

.vs-step--done {
  border-left-color: var(--mn-green);
}

.vs-step--active {
  border-left-color: var(--warning-fg);
}

.vs-step__head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 56px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  font-family: inherit;
}

.vs-step__idx {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg-page);
  color: var(--text-3);
  font-size: 13px;
  font-weight: 700;
}

.vs-step--done .vs-step__idx {
  background: var(--mn-green);
  color: #fff;
}

.vs-step--active .vs-step__idx {
  background: var(--warning-bg);
  color: var(--warning-fg);
}

.vs-step__text {
  flex: 1;
  min-width: 0;
}

.vs-step__title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.vs-step__desc {
  display: block;
  margin-top: 2px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-3);
}

.vs-step__status {
  flex: none;
  font-size: 11px;
  font-weight: 600;
}

.vs-step__status.is-done {
  color: var(--mn-green-dark);
}

.vs-step__status.is-active {
  color: var(--warning-fg);
}

.vs-step__status.is-todo {
  color: var(--text-4);
}

/* 展开体 */
.vs-step__body {
  padding: 0 12px 12px;
  border-top: 1px dashed var(--border-color);
}

.vs-step__hint {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 10px 0;
  font-size: 11.5px;
  color: var(--text-3);
}

.vs-step__entry {
  display: flex;
  gap: 8px;
}

.vs-entry__btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--mn-green);
  border-radius: 12px;
  background: var(--bg-card);
  color: var(--mn-green-dark);
  font-size: 13px;
  font-weight: 600;
}

.vs-entry__btn--primary {
  border-color: var(--mn-green);
  background: var(--mn-green);
  color: #fff;
}

.vs-entry__btn:disabled {
  opacity: 0.6;
}

.vs-thumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.vs-thumb-wrap {
  position: relative;
  flex: none;
  width: 52px;
  height: 52px;
}

.vs-thumb {
  width: 52px;
  height: 52px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--bg-page);
}

.vs-thumb__del {
  position: absolute;
  top: -7px;
  right: -7px;
  z-index: 2;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--text-1);
  color: #fff;
  font-size: 10px;
  line-height: 20px;
}

.vs-thumbs__tip {
  font-size: 11px;
  color: var(--text-3);
}

.vs-thumbs__empty {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--text-4);
}

.vs-step__done {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  min-height: 40px;
  margin-top: 10px;
  border: 1px dashed var(--mn-green);
  border-radius: 10px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-size: 12.5px;
  font-weight: 600;
}

.vs-hidden-file {
  display: none;
}

/* AI 生成遮罩 */
.vs-overlay {
  position: absolute;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.38);
}

.vs-overlay :deep(.mdl) {
  padding: 26px 30px;
  border-radius: 16px;
  background: var(--bg-card);
  box-shadow: var(--sh-3);
}

/* 底部 CTA */
.vs-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  padding: 10px 12px 12px;
  background: linear-gradient(180deg, rgba(245, 247, 245, 0) 0%, var(--bg-page) 42%);
}

.vs-bar__step {
  margin-bottom: 8px;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-3);
}

.vs-bar__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 50px;
  border: none;
  border-radius: 25px;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}

.vs-bar__btn--primary {
  background: var(--mn-green);
}

.vs-bar__btn--ai {
  background: linear-gradient(135deg, var(--ai-purple) 0%, var(--ai-purple-2) 100%);
  box-shadow: 0 8px 20px rgba(109, 59, 245, 0.26);
}

.vs-bar__btn:disabled {
  opacity: 0.7;
}
</style>
