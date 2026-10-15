<script setup lang="ts">
/**
 * P3 业代端 · 巡店拍照页 —— T04.2。
 *
 * 门店确认卡 + 切换门店弹层 + 拍摄类型分段控件 + 三入口照片 + 缩略图(≤6) + 打卡行 + 主按钮。
 * 点击「✦ 开始 AI 诊断」→ 播放 5 步加载动画 → 跳转 P4。
 */
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import AiLoadingOverlay from '@/components/business/AiLoadingOverlay.vue'
import CameraCapture from '@/components/business/CameraCapture.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import SmartImage from '@/components/common/SmartImage.vue'
import { useApi } from '@/composables/useApi'
import { useToast } from '@/composables/useToast'
import { useLoadingSteps } from '@/composables/useLoadingSteps'
import { useDialogFocus } from '@/composables/useDialogFocus'
import { useDevice } from '@/composables/useDevice'
import { useHaptics } from '@/composables/useHaptics'
import type { CameraCapturedPhoto } from '@/composables/useCamera'
import { getStores, createDiagnosis, createVisit, uploadPhoto } from '@/api'
import { useDemoStore } from '@/stores/demo'
import { SHOOT_TYPES } from '@/domain/constants'
import type { Store, ShootType, Photo } from '@/types'

const route = useRoute()
const router = useRouter()
const demo = useDemoStore()
const toast = useToast()
const device = useDevice()
const haptics = useHaptics()

/** 门店列表（含照片 url） */
const { data: storeData, loading } = useApi(() => getStores({ repId: 'U_REP' }), { initial: { stores: [] } })
const stores = computed<Store[]>(() => storeData.value?.stores ?? [])

/** 当前门店 id */
const storeId = ref<string>(String(route.params.storeId || 'S3'))
/** 当前门店对象 */
const store = computed<Store | undefined>(() => stores.value.find((s) => s.id === storeId.value))

/** 切换门店弹层 */
const pickerOpen = ref<boolean>(false)
/** 切换门店弹层焦点管理：Esc 关闭、Tab 锁在面板内、关闭后焦点回归「切换门店」按钮 */
const { panelRef: pickerPanelRef } = useDialogFocus({
  visible: pickerOpen,
  onClose: () => {
    pickerOpen.value = false
  },
})
/** 拍摄部位（单选，默认冷藏柜） */
const shootType = ref<ShootType>('cold')

/** 当前展示的照片在该店照片集中的下标（「换一张」用） */
const photoIndex = ref<number>(0)

/** 本次已选照片列表（最多 6 张，元素为 Photo 或本地上传项） */
interface PickedPhoto {
  id: string
  url: string
  type: ShootType
  caption: string
  /** true = 本地上传的陌生照片，走兜底识别 */
  unknown?: boolean
}
const picked = ref<PickedPhoto[]>([])
/** 本地上传的 base64 是否走兜底 */
const hasUnknown = computed<boolean>(() => picked.value.some((p) => p.unknown))

/** 当前门店可用照片（按拍摄类型过滤） */
const candidates = computed<Photo[]>(() => {
  const all = store.value?.photos ?? []
  const hit = all.filter((p) => p.type === shootType.value)
  return hit.length ? hit : all
})

/** 主展示区照片 */
const heroPhoto = computed<PickedPhoto>(() => {
  if (picked.value.length) return picked.value[0]
  const list = candidates.value
  if (!list.length) return { id: '', url: '', type: shootType.value, caption: '暂无照片' }
  const p = list[Math.min(photoIndex.value, list.length - 1)]
  return { id: p.id, url: p.url, type: p.type, caption: p.caption ?? '' }
})

watch(
  () => [storeId.value, shootType.value],
  () => {
    photoIndex.value = 0
  },
)

/** 打卡时间（静态演示文案） */
const checkinAt = ref<string>('10:24')

/** 是否有可诊断的照片 */
const hasPhoto = computed<boolean>(() => !!heroPhoto.value.url)

/* ═══════════════ AI 分析动画 ═══════════════ */

const overlayVisible = ref<boolean>(false)
/**
 * 5 步默认文案（与 mock 返回的 steps 一致；请求返回后以服务端 steps 为准）。
 * 注意：过程文案不得写死具体识别数量——真实视觉返回数量经常不一致，写死即「穿帮」；
 * 进度百分比仍由 useLoadingSteps 按步数实时计算。
 */
const localSteps = ref([
  { text: '正在上传货架照片…', delayMs: 480 },
  { text: '正在识别货架排面…', delayMs: 480 },
  { text: '正在比对陈列标准…', delayMs: 480 },
  { text: '正在结合进销存与动销推理…', delayMs: 480 },
  { text: '诊断完成', delayMs: 480 },
])
const { current, done, percent, play, reset } = useLoadingSteps(localSteps.value)

/* ═══════════════ 照片操作 ═══════════════ */

/** 模拟拍照：0.15s 快门白闪即时反馈，动画结束后把照片加入已选（单条 toast）。
 *  注意：这是桌面演示/旧机/非 HTTPS 的兜底路径，即使接入真机摄像头也不得删除。 */
const shooting = ref<boolean>(false)
async function takePhoto(): Promise<void> {
  if (shooting.value) return
  shooting.value = true
  haptics.select() // 模拟快门触感（真机相机组件内另有快门反馈；iOS 静默降级）
  await new Promise((r) => setTimeout(r, 600))
  shooting.value = false
  addCurrentPhoto()
}

/** 真机取景器可见性（CameraCapture 内部在 visible→false 时保证释放相机轨道） */
const cameraVisible = ref<boolean>(false)
/** 正在做不弹权限的真机能力探测（探测期间禁用拍照钮，防连点） */
const cameraProbing = ref<boolean>(false)

/**
 * 「拍照」入口决策树：
 * 1. 已达 6 张上限直接提示；
 * 2. useDevice.hasCamera() 异步探测（**不弹权限框**）：具备调用条件 → 打开真机取景器；
 * 3. 桌面无摄像头 / 旧机 / 非 HTTPS（mediaDevices 缺失）→ 回退模拟拍照演示。
 * 注：探测结果只代表「能不能发起」，拒绝授权/被占用等由 CameraCapture 错误分支兜住。
 */
async function onPhotoPress(): Promise<void> {
  if (shooting.value || cameraProbing.value || cameraVisible.value) return
  if (picked.value.length >= 6) {
    toast.info('最多选择 6 张照片')
    return
  }
  cameraProbing.value = true
  try {
    const hasCamera = await device.hasCamera()
    if (hasCamera) {
      cameraVisible.value = true
    } else {
      await takePhoto()
    }
  } finally {
    cameraProbing.value = false
  }
}

/** 真机取景器确认使用照片：与相册共用 acceptPickedFile，caption/toast 标注「真机拍摄」 */
function onCameraCaptured(payload: CameraCapturedPhoto): void {
  cameraVisible.value = false
  const localUrl = URL.createObjectURL(payload.blob)
  acceptPickedFile({
    dataUrl: payload.dataUrl,
    localUrl,
    name: payload.name,
    captionPrefix: '真机拍摄',
    successText: '真机拍摄，已上传，将使用通用陈列规则识别',
  })
}

/** 真机取景器关闭（取消 / Esc） */
function onCameraClose(): void {
  cameraVisible.value = false
}

/**
 * 取景器错误分支选择「相册上传」：关闭取景器并立刻拉起既有 file input。
 * 组件 emit 与本函数处于同一次用户点击的同步调用栈内，iOS/微信的
 * file input.click() 用户激活条件仍然成立。
 */
function onCameraFallbackAlbum(): void {
  cameraVisible.value = false
  pickFromAlbum()
}

/** 把当前主展示照片加入已选列表 */
function addCurrentPhoto(): void {
  const p = heroPhoto.value
  if (!p.url) return
  if (picked.value.some((x) => x.id === p.id && x.unknown === p.unknown)) {
    toast.info('该照片已在选择列表中')
    return
  }
  if (picked.value.length >= 6) {
    toast.info('最多选择 6 张照片')
    return
  }
  picked.value = [...picked.value, { ...p }]
  toast.success('照片已就绪')
}

/** 换一张 */
function rotatePhoto(): void {
  photoIndex.value = (photoIndex.value + 1) % Math.max(1, candidates.value.length)
}

/** 删除已选照片 */
function removePhoto(id: string): void {
  picked.value = picked.value.filter((p) => p.id !== id)
}

/** 从相册上传：真实 file input，走兜底通用识别 */
const fileInput = ref<HTMLInputElement | null>(null)
function pickFromAlbum(): void {
  fileInput.value?.click()
}

/** 读取上传文件 → base64 → 走与真机拍摄共用的接收逻辑 */
function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  // 无论后续是否采用都清空 input，保证同一文件可再次选择
  input.value = ''
  if (!file) return
  if (picked.value.length >= 6) {
    toast.info('最多选择 6 张照片')
    return
  }
  const localUrl = URL.createObjectURL(file)
  const reader = new FileReader()
  reader.onload = () => {
    acceptPickedFile({
      dataUrl: String(reader.result),
      localUrl,
      name: file.name,
      captionPrefix: '上传照片',
      successText: '已上传，将使用通用陈列规则识别',
    })
  }
  reader.readAsDataURL(file)
}

/**
 * 接收一张「外部图片」（相册选择 / 真机拍摄共用的唯一入口）：
 * - 最多 6 张上限在此兜底；
 * - 真上传 uploadPhoto 拿后端 photoId；失败降级本地 UP_ 占位 id，演示不中断；
 * - 两条来源都按陌生照片处理（unknown:true → createDiagnosis 走通用陈列识别）。
 *
 * @returns 是否排入上传（达到上限返回 false）
 */
function acceptPickedFile(args: {
  /** base64 data URL（相册由 FileReader 产出，相机由 canvas 产出） */
  dataUrl: string
  /** 本地预览地址（blob:），缩略图与主展示区直接使用 */
  localUrl: string
  /** 文件名（上传与 caption 展示用） */
  name: string
  /** caption 前缀：相册「上传照片」/ 相机「真机拍摄」 */
  captionPrefix: string
  /** 成功排入后的 toast 文案（沿用既有口径） */
  successText: string
}): boolean {
  if (picked.value.length >= 6) {
    toast.info('最多选择 6 张照片')
    return false
  }
  const buildItem = (id: string): PickedPhoto => ({
    id,
    url: args.localUrl,
    type: shootType.value,
    caption: `${args.captionPrefix} · ${args.name.slice(0, 12)}`,
    unknown: true,
  })
  // 真上传（拿到后端 photoId）；失败则退回本地占位 id，保证演示不中断
  uploadPhoto(args.dataUrl, args.name)
    .then(({ photoId }) => {
      picked.value = [...picked.value, buildItem(photoId)]
      toast.success(args.successText)
    })
    .catch(() => {
      picked.value = [...picked.value, buildItem(`UP_${Date.now()}`)]
      toast.success(args.successText)
    })
  return true
}

/* ═══════════════ 开始 AI 诊断 ═══════════════ */

/** 是否已在处理中（防重复点击） */
const diagnosing = ref<boolean>(false)
/** 诊断结果是否已就绪（就绪后「跳过动画 ›」才可点） */
const resultReady = ref<boolean>(false)
/** 跳过等待动画的 resolve 句柄 */
let resolveSkip: (() => void) | null = null

async function startDiagnosis(): Promise<void> {
  if (!hasPhoto.value || diagnosing.value) return
  diagnosing.value = true
  overlayVisible.value = true
  resultReady.value = false
  reset()

  // 动画与结果竞速：结果就绪后用户可跳过剩余动画；未就绪前跳过入口不可点
  const skipPromise = new Promise<void>((resolve) => {
    resolveSkip = resolve
  })

  try {
    // 请求与动画并行；两者都完成（或动画被跳过且结果已就绪）再跳转
    const photos = picked.value.length
      ? picked.value
      : [{ ...heroPhoto.value }]
    const promise = createDiagnosis({
      storeId: storeId.value,
      photoIds: photos.map((p) => p.id).filter(Boolean),
      shootTypes: [shootType.value],
      unknownPhoto: hasUnknown.value,
    }).then((res) => {
      resultReady.value = true
      return res
    })

    const [res] = await Promise.all([promise, Promise.race([play(demo.speed), skipPromise])])
    overlayVisible.value = false

    // 回写一次巡店记录（完成态），再进 P4
    await createVisit({
      storeId: storeId.value,
      photoIds: photos.map((p) => p.id).filter(Boolean),
      shootTypes: [shootType.value],
      checkin: { lat: 31.2304, lng: 121.4737, at: `${checkinAt.value}` },
    })
    router.replace(`/rep/diagnosis/${res.diagnosis.id}`)
    haptics.success() // 诊断完成：成功节奏（不支持设备静默降级）
  } catch {
    overlayVisible.value = false
    diagnosing.value = false
    haptics.error()
    toast.error('AI 分析失败，请重试')
  } finally {
    resolveSkip = null
  }
}

/** 跳过等待动画（结果就绪后生效）：直接放行到后续跳转流程 */
function skipOverlay(): void {
  if (!resultReady.value) return
  resolveSkip?.()
}

/**
 * 切换拍摄类型：已有已选照片时先确认，避免误清空。
 */
function chooseShootType(key: ShootType): void {
  if (key === shootType.value) return
  if (picked.value.length && !window.confirm('切换拍摄类型会清空已选照片，确定继续吗？')) return
  shootType.value = key
  picked.value = []
}

/** 切换门店 */
function pickStore(id: string): void {
  if (id === storeId.value) {
    pickerOpen.value = false
    return
  }
  if (picked.value.length && !window.confirm('切换门店会清空已选照片，确定继续吗？')) return
  storeId.value = id
  picked.value = []
  pickerOpen.value = false
  router.replace(`/rep/capture/${id}`)
}

/** 人数日程信息 */
function goBack(): void {
  router.push('/rep/today')
}
</script>

<template>
  <MobileLayout title="巡店拍照" :back="true" :content-padding-bottom="108" @back="goBack">
    <!-- 门店确认卡 -->
    <div class="p3-store">
      <SkeletonBlock v-if="loading" height="92px" radius="12px" />
      <div v-else-if="store" class="p3-store__card">
        <div class="p3-store__row">
          <p class="p3-store__name">
            <AppIcon name="map-pin" :size="14" color="var(--mn-green)" />
            {{ store.name }}
          </p>
          <button type="button" class="p3-store__switch u-tap" @click="pickerOpen = true">切换门店</button>
        </div>
        <p class="p3-store__meta">{{ store.typeLabel }} · 负责人：{{ store.ownerName }}</p>
        <p class="p3-store__meta">
          上次健康分 <b>{{ store.lastScore }}</b>
          <template v-if="store.prevScore != null && store.lastScore - store.prevScore > 5">
            （{{ store.prevScore }} → {{ store.lastScore }}，+{{ store.lastScore - store.prevScore }}）
          </template>
        </p>
      </div>
    </div>

    <!-- 拍摄类型 -->
    <div class="p3-sec">
      <p class="p3-label">拍摄类型（必选）</p>
      <div class="p3-seg">
        <button
          v-for="s in SHOOT_TYPES"
          :key="s.key"
          type="button"
          class="p3-seg__item u-tap"
          :class="{ 'p3-seg__item--on': shootType === s.key }"
          @click="chooseShootType(s.key)"
        >
          {{ s.label }}
        </button>
      </div>
    </div>

    <!-- 照片主展示区 -->
    <div class="p3-sec">
      <div class="p3-photo" :class="{ 'p3-photo--empty': !hasPhoto }">
        <SmartImage v-if="hasPhoto" class="p3-photo__img" :src="heroPhoto.url" :alt="heroPhoto.caption" />
        <!-- 快门白闪：0.15s opacity 反馈（仅 opacity 动效，不位移） -->
        <div v-if="shooting" class="p3-flash" aria-hidden="true" />
        <div v-else class="p3-photo__empty">
          <AppIcon name="camera" :size="28" color="var(--text-4)" />
          <p>请拍摄或上传货架照片</p>
        </div>
        <span v-if="hasPhoto" class="p3-photo__ready">✓ 已就绪</span>
        <span v-if="hasPhoto" class="p3-photo__caption">{{ heroPhoto.caption }}</span>
      </div>

      <!-- 主入口：拍照 / 相册（实心地 + 描边）；「换一张」降为次级文字按钮。
           拍照钮优先真机取景器，桌面/旧机/非 HTTPS 自动回退模拟拍照演示 -->
      <div class="p3-entry">
        <button
          type="button"
          class="p3-entry__btn p3-entry__btn--primary mot-tap"
          :disabled="shooting || cameraProbing || cameraVisible"
          @click="onPhotoPress"
        >
          <AppIcon name="camera" :size="15" color="#fff" />
          {{ cameraProbing ? '检测相机…' : '拍照' }}
        </button>
        <button type="button" class="p3-entry__btn mot-tap" @click="pickFromAlbum">
          <AppIcon name="image" :size="15" /> 从相册上传
        </button>
      </div>
      <button type="button" class="p3-rotate u-tap" :disabled="!candidates.length" @click="rotatePhoto">
        <AppIcon name="refresh" :size="13" /> 换一张预置图
      </button>
      <input ref="fileInput" class="p3-hidden-file" type="file" accept="image/*" @change="onFileChange" />

      <!-- 缩略图 -->
      <div class="p3-thumbs">
        <div v-for="p in picked" :key="p.id" class="p3-thumb-wrap">
          <div class="p3-thumb">
            <!-- 上传的 blob: URL 由 assetUrl 原样透传，预置图走相对路径 -->
            <SmartImage :src="p.url" :alt="p.caption" />
          </div>
          <button type="button" class="p3-thumb__del u-tap" aria-label="移除该照片" @click="removePhoto(p.id)">✕</button>
        </div>
        <button type="button" class="p3-thumb p3-thumb--add mot-tap" aria-label="添加当前照片" @click="addCurrentPhoto">＋</button>
        <span class="p3-thumbs__tip">已选 {{ picked.length }} 张 · 最多 6 张</span>
      </div>
    </div>

    <!-- 打卡行 -->
    <div class="p3-checkin">
      <AppIcon name="check-circle" :size="14" color="var(--mn-green)" />
      <span>已打卡 · GPS 定位成功 · {{ checkinAt }}</span>
    </div>

    <!-- 切换门店弹层（action sheet：Esc / 点遮罩关闭，焦点陷阱与关闭后回归由 useDialogFocus 处理） -->
    <div v-if="pickerOpen" class="p3-mask" @click.self="pickerOpen = false">
      <div
        ref="pickerPanelRef"
        class="p3-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="p3-picker-title"
      >
        <p id="p3-picker-title" class="p3-sheet__title">选择门店</p>
        <button
          v-for="s in stores"
          :key="s.id"
          type="button"
          class="p3-sheet__item"
          :class="{ 'p3-sheet__item--on': s.id === storeId }"
          @click="pickStore(s.id)"
        >
          <span>{{ s.name }}</span>
          <em>{{ s.typeLabel }} · {{ s.distanceKm }}km</em>
        </button>
      </div>
    </div>

    <!-- 结果就绪后可跳过剩余等待动画 -->
    <button
      v-if="overlayVisible && resultReady"
      type="button"
      class="p3-skip-wait"
      @click="skipOverlay"
    >
      跳过动画 ›
    </button>

    <!-- AI 分步加载遮罩 -->
    <AiLoadingOverlay :visible="overlayVisible" :steps="localSteps" :current="current" :done="done" :percent="percent" />

    <!-- 主 CTA：底部固定在安全区（内容区预留 88px+ 底部留白） -->
    <template #footer>
      <div v-if="!overlayVisible" class="p3-bar u-safe-bottom">
        <button
          type="button"
          class="p3-submit__btn mot-tap"
          :disabled="!hasPhoto || diagnosing"
          @click="startDiagnosis"
        >
          <AppIcon name="sparkles" :size="17" color="#fff" />
          开始 AI 诊断
        </button>
        <p v-if="!hasPhoto" class="p3-bar__tip">至少 1 张照片</p>
      </div>

      <!-- 真机全屏取景器：必须放在 footer 插槽——absolute 相对 .mot-route-host
           定位且不被 .ml-body 的 overflow 裁切，桌面手机壳内不穿出视口。
           拒绝/无设备/被占用均在组件内给人话分支，相册兜底回本页既有流程 -->
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
.p3-store {
  padding: 14px 12px 0;
}

.p3-store__card {
  padding: 12px;
  border-radius: var(--radius-card);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  border-left: 4px solid var(--mn-green);
}

.p3-store__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.p3-store__name {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 15px;
  font-weight: 700;
}

.p3-store__switch {
  flex: none;
  padding: 3px 10px;
  border: 1px solid var(--mn-green);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--mn-green);
  font-size: 11px;
  font-weight: 600;
}

.p3-store__meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-3);
}

.p3-store__meta b {
  color: var(--text-1);
}

.p3-sec {
  padding: 14px 12px 0;
}

.p3-label {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}

.p3-seg {
  display: flex;
  gap: 6px;
  padding: 3px;
  border-radius: 12px;
  background: var(--bg-page);
}

.p3-seg__item {
  flex: 1;
  min-height: 40px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
  transition:
    background-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard);
}

.p3-seg__item--on {
  background: var(--mn-green);
  color: #fff;
  box-shadow: 0 2px 6px rgba(0, 150, 57, 0.28);
}

.p3-photo {
  position: relative;
  width: 100%;
  height: 208px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-page);
}

.p3-photo--empty {
  border: 1.5px dashed var(--text-4);
  background: var(--bg-page);
}

.p3-photo__img {
  width: 100%;
  height: 104%;
  margin-bottom: -4%;
  border-radius: 10px;
  overflow: hidden;
}

/* :deep 穿透到 SmartImage 内部的图片，统一裁掉底部水印区 */
.p3-photo__img :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}

.p3-photo__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
  color: var(--text-3);
  font-size: 13px;
}

/* 快门白闪：仅 opacity 0.15s 收起，给指尖即时回应 */
.p3-flash {
  position: absolute;
  inset: 0;
  z-index: 5;
  background: #fff;
  pointer-events: none;
  animation: p3-shutter 0.15s ease-out forwards;
}

@keyframes p3-shutter {
  from {
    opacity: 0.9;
  }
  to {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .p3-flash {
    animation-duration: 0.01ms;
  }

  /* 主按钮流光为纯装饰性无限动画：系统要求减弱动态效果时直接关闭 */
  .p3-submit__btn::after {
    animation: none;
  }
}

.p3-photo__ready {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--mn-green);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}

.p3-photo__caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 14px 10px 8px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.5) 100%);
  color: #fff;
  font-size: 11px;
}

.p3-entry {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

/* 主入口：44px 高，拍照实心、相册描边（希克定律：主选择唯一且靠前） */
.p3-entry__btn {
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
  transition:
    background-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard);
}

.p3-entry__btn--primary {
  border-color: #007a30;
  background: #007a30;
  color: #fff;
}

.p3-entry__btn--primary:hover {
  background: #00752e;
}

.p3-entry__btn:disabled {
  opacity: 0.55;
}

/* 「换一张」降权：单行次级文字/图标按钮（.u-tap 把命中盒外扩到 44px） */
.p3-rotate {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  min-height: 36px;
  margin-top: 6px;
  border: none;
  background: none;
  color: var(--text-3);
  font-size: 12px;
}

.p3-rotate:active {
  color: var(--mn-green);
}

.p3-hidden-file {
  display: none;
}

.p3-thumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.p3-thumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

/* 外层不裁切：删除小钮的 .u-tap 44px 热区可以溢出到缩略图之外 */
.p3-thumb-wrap {
  position: relative;
  flex: none;
  width: 52px;
  height: 52px;
}

.p3-thumb {
  width: 52px;
  height: 52px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-page);
  border: none;
  padding: 0;
}

.p3-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 视觉 18px 小钮，命中盒由 .u-tap 外扩到 44px */
.p3-thumb__del {
  position: absolute;
  top: -7px;
  right: -7px;
  z-index: 2;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: var(--text-1);
  color: var(--bg-card);
  font-size: 10px;
  line-height: 20px;
  padding: 0;
}

.p3-thumb--add {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 8px;
  border: 1.5px dashed var(--text-4);
  background: var(--bg-card);
  color: var(--text-3);
  font-size: 18px;
}

.p3-thumbs__tip {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
}

.p3-checkin {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 14px 12px 0;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-size: 12px;
  font-weight: 600;
}

/* 主 CTA：底部固定在安全区（iPhone home 指示条不遮挡） */
.p3-bar {
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

.p3-submit__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 52px;
  border: none;
  border-radius: 26px;
  background: linear-gradient(135deg, var(--ai-purple) 0%, var(--ai-purple-2) 100%);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  box-shadow: 0 8px 20px rgba(109, 59, 245, 0.28);
  position: relative;
  overflow: hidden;
}

.p3-submit__btn::after {
  content: '';
  position: absolute;
  top: 0;
  left: -60%;
  width: 40%;
  height: 100%;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.32) 50%, rgba(255, 255, 255, 0) 100%);
  animation: flow 2.6s ease infinite;
}

@keyframes flow {
  0% {
    left: -60%;
  }
  60%,
  100% {
    left: 120%;
  }
}

.p3-submit__btn:disabled {
  background: var(--text-4);
  box-shadow: none;
  opacity: 0.85;
}

.p3-submit__btn:disabled::after {
  display: none;
}

.p3-bar__tip {
  margin-top: 6px;
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
}

/* 跳过等待动画：浮在遮罩之上，结果就绪才渲染 */
.p3-skip-wait {
  position: absolute;
  left: 50%;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 30px);
  z-index: 1501;
  min-height: 36px;
  padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 999px;
  background: rgba(26, 31, 28, 0.55);
  color: #fff;
  font-size: 13px;
  transform: translateX(-50%);
  animation: p3-skip-in var(--dur-base) var(--ease-decel) both;
}

@keyframes p3-skip-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 切换门店弹层 */
.p3-mask {
  position: absolute;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.4);
}

.p3-sheet {
  width: 100%;
  padding: 14px 12px 18px;
  border-radius: 16px 16px 0 0;
  background: var(--bg-card);
}

.p3-sheet__title {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 700;
}

.p3-sheet__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 44px;
  padding: 10px;
  border: none;
  border-bottom: 1px dashed var(--border-color);
  background: none;
  text-align: left;
  font-size: 13px;
  color: var(--text-1);
}

.p3-sheet__item em {
  font-style: normal;
  font-size: 11px;
  color: var(--text-3);
}

.p3-sheet__item--on {
  color: var(--mn-green);
  font-weight: 700;
}
</style>
