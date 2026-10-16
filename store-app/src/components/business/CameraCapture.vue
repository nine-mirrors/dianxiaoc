<script setup lang="ts">
/**
 * CameraCapture —— 全屏真机取景器（业代拍照专用）。
 *
 * 生命周期 / 资源铁律：
 * - visible=true：拉起摄像头 → 实时预览 → 快门拍照 → 静态预览确认；
 * - visible=false（或组件卸载）：**必定**停止全部轨道、清空 srcObject、
 *   撤销预览 blob URL，摄像头指示灯不允许常亮；
 * - 切换前后置：先停旧流再请新流，任何失败自动回退原朝向；
 * - 所有 getUserMedia 异常经 useCamera 归一化，UI 只有三种人话分支
 *   （拒绝授权 / 无法使用 / 被占用），英文错误码绝不出现给用户。
 *
 * 定位说明：根节点 position:absolute;inset:0，由父级放置在 MobileLayout 的
 * #footer 插槽中——最近定位祖先是 .mot-route-host（relative + overflow:hidden，
 * 尺寸=手机屏可视区），桌面 390 手机壳内严格不穿出、被壳裁剪；真机退壳后
 * .mot-route-host 即整屏（100dvh），absolute 同样铺满。
 * 不用 fixed：实测桌面 Chromium 下 .phone 的 z-index:1 不构成 fixed 包含块，
 * fixed 会铺满整个浏览器视口（穿出手机壳）。
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useHaptics } from '@/composables/useHaptics'
import {
  useCamera,
  CameraError,
  type CameraFacingMode,
  type CameraErrorCode,
  type CameraCapturedPhoto,
} from '@/composables/useCamera'

/* ─────────────────────────── 对外契约 ─────────────────────────── */

interface Props {
  /** 是否展示取景器（由父级 ref 控制；false 时必定释放相机） */
  visible: boolean
}
const props = defineProps<Props>()

const emit = defineEmits<{
  /** 用户取消（关闭钮 / Esc），父级据此置 visible=false */
  (e: 'close'): void
  /** 用户在预览态确认使用照片 */
  (e: 'captured', payload: CameraCapturedPhoto): void
  /** 在错误分支选择「相册上传」：父级关闭取景器并拉起既有相册流程 */
  (e: 'fallback-album'): void
}>()

/* ─────────────────────────── 常量 ─────────────────────────── */

/** 拍照导出格式与质量 */
const JPEG_MIME = 'image/jpeg'
const JPEG_QUALITY = 0.85
/** 导出照片宽边上限（px），超过则等比缩小，控制上传体积 */
const MAX_LONG_EDGE = 1600

/* ─────────────────────────── 状态机 ─────────────────────────── */

/** starting=拉起中 / preview=实时预览 / captured=静态确认 / error=错误分支 */
type Phase = 'starting' | 'preview' | 'captured' | 'error'
/** 错误三分支：denied=拒绝授权 / unavailable=无摄像头/不支持/非HTTPS / busy=被占用 */
type ErrorKind = 'denied' | 'unavailable' | 'busy'

const camera = useCamera()
const haptics = useHaptics()

const videoEl = ref<HTMLVideoElement | null>(null)
const phase = ref<Phase>('starting')
const errorKind = ref<ErrorKind>('unavailable')
const facing = ref<CameraFacingMode>('environment')
/** 是否显示「切换前后置」（授权后枚举到 ≥2 个摄像头才显示） */
const canSwitch = ref(false)
/** 快门白闪开关（0.12s） */
const flashing = ref(false)
/** 静态确认态的照片地址（blob:，关闭/重拍时必须 revoke） */
const stillUrl = ref('')
/** 快门处理中（防连点产生重复照片） */
const capturing = ref(false)

/** 当前持有的实时流（唯一句柄，释放只走 releaseStream） */
let activeStream: MediaStream | null = null
/** 已拍待确认的照片 */
let capturedPhoto: CameraCapturedPhoto | null = null
/**
 * 会话令牌：open/切镜头/重拍/重试/teardown 各自自增。
 * 任何异步回调（getUserMedia / play / enumerateDevices）回来后先比对令牌，
 * 过期结果一律丢弃（拿到的流立即 stop），杜绝快速关闭/切换时的竞态漏流。
 */
let sessionToken = 0
let flashTimer: ReturnType<typeof setTimeout> | undefined

/* ─────────────────────────── 文案（只用人话，不出错误码） ─────────────────────────── */

interface ErrorCopy {
  icon: string
  title: string
  desc: string
}

const ERROR_COPY: Record<ErrorKind, ErrorCopy> = {
  denied: {
    icon: 'warning',
    title: '你还没允许使用相机',
    desc: '在浏览器或系统设置里开启相机权限后，点「重新授权」即可拍摄；也可以直接从相册选择货架照片。',
  },
  unavailable: {
    icon: 'camera',
    title: '当前设备无法直接拍照',
    desc: '可以从相册选一张货架照片，后续 AI 识别流程完全一样。',
  },
  busy: {
    icon: 'alert-triangle',
    title: '相机被其它应用占用',
    desc: '请关闭正在使用相机的应用（如系统相机、视频通话），然后再试一次。',
  },
}

const errorCopy = computed<ErrorCopy>(() => ERROR_COPY[errorKind.value])

/* ─────────────────────────── 开关与生命周期 ─────────────────────────── */

/** visible 进入激活态：挂 Esc 监听并拉起相机 */
function activate(): void {
  window.addEventListener('keydown', onKeydown)
  void open()
}

/** visible 退出激活态：摘监听并释放全部资源（轨道/预览 URL/定时器） */
function deactivate(): void {
  window.removeEventListener('keydown', onKeydown)
  teardown()
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) activate()
    else deactivate()
  },
)

// 兼容「以 visible=true 直接挂载」（watch 非 immediate，首次不会触发）
onMounted(() => {
  if (props.visible) activate()
})

onBeforeUnmount(deactivate)

/** Esc 等同关闭（物理返回键交由路由/父级处理，这里不拦截） */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

/** 打开：重置到后置 + 启动态，等 <video> 挂载后拉流 */
async function open(): Promise<void> {
  const token = ++sessionToken
  resetReview()
  facing.value = 'environment'
  canSwitch.value = false
  phase.value = 'starting'
  await nextTick()
  await startStream(token)
}

/**
 * 拉流并绑定到 video。任何阶段失败都归一化到错误分支；
 * 令牌过期时，晚到的成功流立即释放，绝不挂到 DOM 上。
 */
async function startStream(token: number): Promise<void> {
  let stream: MediaStream
  try {
    stream = await camera.start(facing.value)
  } catch (err) {
    if (token === sessionToken) applyError(err)
    return
  }
  if (token !== sessionToken) {
    camera.stop(stream)
    return
  }

  activeStream = stream
  const attached = await attachToVideo(token)
  if (!attached || token !== sessionToken) return

  phase.value = 'preview'
  // 授权后再枚举：iOS 授权前列表可能为空，授权后才能看到真实摄像头数量
  const count = await camera.countVideoInputs()
  if (token !== sessionToken) return
  canSwitch.value = count >= 2
}

/** 绑定 srcObject 并 play()；muted+playsinline 保证移动端自动播放不被拦 */
async function attachToVideo(token: number): Promise<boolean> {
  const video = videoEl.value
  if (!video || !activeStream) return false
  video.srcObject = activeStream
  video.muted = true
  try {
    await video.play()
    return true
  } catch (err) {
    // 释放动作竞速（切镜头/关闭先发生）：令牌已过期，静默丢弃，teardown 已处理
    if (token !== sessionToken) return false
    // 当前令牌下播放仍失败（含 AbortError）：进错误分支给重试入口，不留永久启动态
    releaseStream()
    applyError(
      err instanceof CameraError
        ? err
        : new CameraError('not-readable', '视频预览启动失败', (err as DOMException | null)?.name ?? ''),
    )
    return false
  }
}

/** 释放当前流：先摘 srcObject（避免定格最后一帧），再停全部轨道 */
function releaseStream(): void {
  const video = videoEl.value
  if (video) {
    try {
      video.pause()
    } catch {
      /* 忽略暂停异常 */
    }
    video.srcObject = null
  }
  camera.stop(activeStream)
  activeStream = null
}

/** 收起取景器：令牌作废 + 白闪复位 + 轨道释放 + 预览 URL 回收 */
function teardown(): void {
  sessionToken += 1
  if (flashTimer) clearTimeout(flashTimer)
  flashing.value = false
  releaseStream()
  resetReview()
  errorKind.value = 'unavailable'
  phase.value = 'starting'
  canSwitch.value = false
}

/* ─────────────────────────── 错误分支 ─────────────────────────── */

/** 把 CameraError.code 映射为三种 UI 分支 */
function applyError(err: unknown): void {
  releaseStream()
  const code: CameraErrorCode | null = err instanceof CameraError ? err.code : null
  if (code === 'not-allowed') {
    errorKind.value = 'denied'
  } else if (code === 'not-readable' || code === 'aborted') {
    errorKind.value = 'busy'
  } else {
    // unsupported / not-found / security / over-constrained / unknown 全部归「无法使用」
    errorKind.value = 'unavailable'
  }
  phase.value = 'error'
  canSwitch.value = false
}

/** 错误分支上的「重新授权 / 重试」：原样再走一遍启动 */
async function retry(): Promise<void> {
  const token = ++sessionToken
  phase.value = 'starting'
  await nextTick()
  await startStream(token)
}

/* ─────────────────────────── 切换前后置 ─────────────────────────── */

async function switchCamera(): Promise<void> {
  if (phase.value !== 'preview' || !activeStream) return
  const token = ++sessionToken
  phase.value = 'starting'
  // 先停旧流再请新流：避免双摄并发占用导致 NotReadable，指示灯先灭
  releaseStream()
  const wanted: CameraFacingMode = facing.value === 'environment' ? 'user' : 'environment'
  facing.value = wanted

  let stream: MediaStream
  try {
    stream = await camera.start(wanted)
  } catch {
    if (token !== sessionToken) return
    // 新朝向打不开（个别单摄/微信 WebView）：回退原朝向；再失败则进错误分支
    facing.value = wanted === 'environment' ? 'user' : 'environment'
    await startStream(token)
    if (token === sessionToken) canSwitch.value = false
    return
  }
  if (token !== sessionToken) {
    camera.stop(stream)
    return
  }

  activeStream = stream
  const attached = await attachToVideo(token)
  if (!attached || token !== sessionToken) return
  phase.value = 'preview'
}

/* ─────────────────────────── 拍照与预览确认 ─────────────────────────── */

/** 快门：白闪 + 触感（iOS 静默降级）→ canvas 导出 → 进入确认态并释放相机 */
async function capture(): Promise<void> {
  if (phase.value !== 'preview' || capturing.value) return
  const video = videoEl.value
  if (!video || !video.videoWidth || !video.videoHeight) return

  capturing.value = true
  haptics.select()
  triggerFlash()

  try {
    const photo = await drawPhoto(video)
    capturedPhoto = photo
    resetStillUrl()
    stillUrl.value = URL.createObjectURL(photo.blob)
    phase.value = 'captured'
    // 静态确认期间相机不再需要：立即停流灭灯，把相机还给系统；重拍时再拉起
    releaseStream()
    canSwitch.value = false
  } catch {
    // 画布/编码异常（极低概率）：留在取景态，用户可再按一次，不产生死路
  } finally {
    capturing.value = false
  }
}

/** 按 video 原始尺寸绘入 canvas，宽边超 1600 等比缩小，输出 JPEG(0.85) 的 blob+dataUrl */
function drawPhoto(video: HTMLVideoElement): Promise<CameraCapturedPhoto> {
  return new Promise((resolve, reject) => {
    const sourceW = video.videoWidth
    const sourceH = video.videoHeight
    const longEdge = Math.max(sourceW, sourceH)
    const scale = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1
    const targetW = Math.max(1, Math.round(sourceW * scale))
    const targetH = Math.max(1, Math.round(sourceH * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('canvas 2d context unavailable'))
      return
    }
    ctx.drawImage(video, 0, 0, targetW, targetH)

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('canvas.toBlob returned null'))
          return
        }
        // dataUrl 与 blob 同源同一次编码，避免两份文件体积/内容不一致
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result !== 'string') {
            reject(new Error('FileReader result is not a data URL'))
            return
          }
          resolve({ dataUrl: reader.result, blob, name: makePhotoName() })
        }
        reader.onerror = () => reject(reader.error ?? new Error('data URL read failed'))
        reader.readAsDataURL(blob)
      },
      JPEG_MIME,
      JPEG_QUALITY,
    )
  })
}

/** 生成文件名 photo_YYYYMMDD_HHMMSS.jpg（本地时区，与打卡时间口径一致） */
function makePhotoName(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `photo_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(
    d.getMinutes(),
  )}${pad(d.getSeconds())}.jpg`
}

/** 快门白闪：0.12s（reduced-motion 由 CSS 压成瞬时静态） */
function triggerFlash(): void {
  flashing.value = false
  if (flashTimer) clearTimeout(flashTimer)
  // 下一帧再置 true，保证连续拍照时动画能重新触发
  requestAnimationFrame(() => {
    flashing.value = true
    flashTimer = setTimeout(() => {
      flashing.value = false
    }, 120)
  })
}

/** 重拍：丢弃静态照，按原朝向重新拉起相机 */
async function retake(): Promise<void> {
  const token = ++sessionToken
  resetReview()
  phase.value = 'starting'
  await startStream(token)
}

/** 确认使用：抛给父级（父级置 visible=false 后由 watch 完成最终回收） */
function confirmPhoto(): void {
  if (capturedPhoto) emit('captured', capturedPhoto)
}

/** 错误分支 → 相册：父级负责关取景器并拉起 file input */
function fallbackAlbum(): void {
  emit('fallback-album')
}

function requestClose(): void {
  emit('close')
}

function resetStillUrl(): void {
  if (stillUrl.value) {
    URL.revokeObjectURL(stillUrl.value)
    stillUrl.value = ''
  }
}

function resetReview(): void {
  resetStillUrl()
  capturedPhoto = null
  capturing.value = false
}
</script>

<template>
  <div v-if="visible" class="cc" role="dialog" aria-modal="true" aria-label="相机拍照">
    <!-- 实时预览：cover 满屏；前置摄像头预览镜像（仅观感，成片不镜像） -->
    <video
      ref="videoEl"
      class="cc__video"
      :class="{ 'cc__video--front': facing === 'user' }"
      autoplay
      playsinline
      muted
      aria-hidden="true"
    ></video>

    <!-- 顶部：关闭 + 切换前后置（错误态隐藏；确认态只留关闭） -->
    <header v-if="phase !== 'error'" class="cc__top">
      <button type="button" class="cc__icon-btn u-tap" aria-label="关闭相机" @click="requestClose">
        <AppIcon name="close" :size="22" color="#fff" />
      </button>
      <button
        v-if="canSwitch && phase === 'preview'"
        type="button"
        class="cc__icon-btn u-tap"
        aria-label="切换前后置摄像头"
        @click="switchCamera"
      >
        <!-- 双弧换向箭头：与 AppIcon 同一 24 网格 / 1.8 圆头描边规范 -->
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          focusable="false"
          aria-hidden="true"
        >
          <path d="M4 9a8 8 0 0 1 12.6-3.6L19 7.5" />
          <path d="M19 3.5v4h-4" />
          <path d="M20 15a8 8 0 0 1-12.6 3.6L5 16.5" />
          <path d="M5 20.5v-4h4" />
        </svg>
      </button>
    </header>

    <!-- 启动 / 前后置切换中 -->
    <div v-if="phase === 'starting'" class="cc__state">
      <span class="cc__spinner" aria-hidden="true"></span>
      <p class="cc__state__text">正在启动相机…</p>
    </div>

    <!-- 权限 / 错误三分支 -->
    <div v-else-if="phase === 'error'" class="cc__state cc__state--error">
      <span class="cc__error__icon">
        <AppIcon :name="errorCopy.icon" :size="34" color="#fff" />
      </span>
      <p class="cc__error__title">{{ errorCopy.title }}</p>
      <p class="cc__error__desc">{{ errorCopy.desc }}</p>
      <div class="cc__error__actions">
        <template v-if="errorKind === 'denied'">
          <button type="button" class="cc__btn cc__btn--primary mot-tap" @click="retry">点此重新授权</button>
          <button type="button" class="cc__btn cc__btn--ghost mot-tap" @click="fallbackAlbum">改用相册上传</button>
        </template>
        <template v-else-if="errorKind === 'busy'">
          <button type="button" class="cc__btn cc__btn--primary mot-tap" @click="retry">重试</button>
          <button type="button" class="cc__btn cc__btn--ghost mot-tap" @click="fallbackAlbum">相册上传</button>
        </template>
        <template v-else>
          <button type="button" class="cc__btn cc__btn--primary mot-tap" @click="fallbackAlbum">相册上传</button>
        </template>
      </div>
    </div>

    <!-- 拍照后的静态确认态 -->
    <div v-else-if="phase === 'captured'" class="cc__review">
      <img class="cc__review__img" :src="stillUrl" alt="刚拍摄的货架照片预览" />
      <div class="cc__review__dock u-safe-bottom">
        <div class="cc__review__bar">
          <!-- 希克定律：唯一实心主钮「使用照片」居右，「重拍」降为描边次钮 -->
          <button type="button" class="cc__btn cc__btn--ghost mot-tap" @click="retake">重拍</button>
          <button type="button" class="cc__btn cc__btn--primary mot-tap" @click="confirmPhoto">使用照片</button>
        </div>
      </div>
    </div>

    <!-- 实时预览态：快门（视觉 72px，热区 88px） -->
    <div v-else class="cc__dock u-safe-bottom">
      <div class="cc__dock__inner">
        <button
          type="button"
          class="cc__shutter"
          :class="{ 'cc__shutter--busy': capturing }"
          :disabled="phase !== 'preview'"
          aria-label="拍照"
          @click="capture"
        >
          <span class="cc__shutter__core" aria-hidden="true"></span>
        </button>
      </div>
    </div>

    <!-- 快门白闪：0.12s，纯 opacity 不位移 -->
    <div v-if="flashing" class="cc__flash" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
/* 全屏覆盖（壳内）：absolute 相对 .mot-route-host（组件由父级放在 #footer 插槽），
   z 量级取 --z-modal；被路由宿主 overflow:hidden 裁剪，桌面壳内绝不穿出。
   真机退壳后路由宿主即 100dvh 整屏，absolute 同样铺满。 */
.cc {
  position: absolute;
  inset: 0;
  z-index: var(--z-modal);
  overflow: hidden;
  background: #0b0e0c;
  /* 全屏期间禁止滚动手势穿透到背后页面 */
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}

.cc__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #0b0e0c;
}

/* 前置摄像头镜像仅作用于预览；canvas 绘制的是原始帧，成片不镜像 */
.cc__video--front {
  transform: scaleX(-1);
}

/* ── 顶部控制条 ── */
.cc__top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px max(12px, env(safe-area-inset-right, 0px)) 10px max(12px, env(safe-area-inset-left, 0px));
  padding-top: max(10px, env(safe-area-inset-top, 0px));
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0) 100%);
}

.cc__icon-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(18, 22, 19, 0.55);
}

.cc__icon-btn:active {
  background: rgba(18, 22, 19, 0.8);
}

/* ── 启动 / 错误状态层 ── */
.cc__state {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 32px max(28px, env(safe-area-inset-left, 0px)) 32px max(28px, env(safe-area-inset-right, 0px));
  text-align: center;
  background: #0b0e0c;
}

.cc__spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(255, 255, 255, 0.22);
  border-top-color: #fff;
  border-radius: 50%;
  animation: cc-spin 0.8s linear infinite;
}

@keyframes cc-spin {
  to {
    transform: rotate(360deg);
  }
}

.cc__state__text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.78);
}

.cc__error__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  margin-bottom: 4px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
}

.cc__error__title {
  font-size: 17px;
  font-weight: 700;
  color: #fff;
}

.cc__error__desc {
  max-width: 280px;
  font-size: 13px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.72);
}

.cc__error__actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 280px;
  margin-top: 10px;
}

/* ── 按钮（深色底：主钮沿用全站 AA 加深绿，次钮白描边） ── */
.cc__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  padding: 0 16px;
  border-radius: var(--radius-btn);
  border: 1px solid transparent;
  font-size: 15px;
  font-weight: 700;
  transition:
    background-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard);
}

.cc__btn--primary {
  background: #007a30;
  color: #fff;
}

.cc__btn--primary:active {
  background: var(--mn-green-dark);
}

.cc__btn--ghost {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.72);
  color: #fff;
}

.cc__btn--ghost:active {
  background: rgba(255, 255, 255, 0.12);
}

/* ── 快门区（外层只吃安全区，内层负责视觉留白，避免 env 被 padding 简写覆盖） ── */
.cc__dock {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0) 100%);
}

.cc__dock__inner {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 0 30px;
}

.cc__shutter {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  padding: 0;
  border: 4px solid rgba(255, 255, 255, 0.92);
  border-radius: 50%;
  background: transparent;
}

/* 热区外扩到 88px（大于视觉尺寸，拇指盲按友好）；外层不裁切 */
.cc__shutter::before {
  content: '';
  position: absolute;
  inset: 50%;
  min-width: 88px;
  min-height: 88px;
  transform: translate(-50%, -50%);
}

.cc__shutter__core {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #fff;
  transition: transform var(--dur-fast) var(--ease-standard);
}

.cc__shutter:active .cc__shutter__core {
  transform: scale(0.88);
}

.cc__shutter:disabled {
  opacity: 0.5;
}

.cc__shutter--busy .cc__shutter__core {
  background: rgba(255, 255, 255, 0.65);
}

/* ── 静态确认态 ── */
.cc__review {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  background: #000;
}

.cc__review__img {
  flex: 1;
  min-height: 0;
  width: 100%;
  object-fit: contain;
  background: #000;
}

.cc__review__dock {
  flex: none;
  background: #0b0e0c;
}

.cc__review__bar {
  display: flex;
  gap: 12px;
  padding: 12px max(16px, env(safe-area-inset-right, 0px)) 28px max(16px, env(safe-area-inset-left, 0px));
}

.cc__review__bar .cc__btn {
  flex: 1;
  width: auto;
}

/* ── 快门白闪 ── */
.cc__flash {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: #fff;
  pointer-events: none;
  animation: cc-flash 0.12s ease-out forwards;
}

@keyframes cc-flash {
  from {
    opacity: 0.9;
  }
  to {
    opacity: 0;
  }
}
</style>
