/**
 * useCamera —— 真机摄像头能力封装（getUserMedia），面向巡店拍照场景。
 *
 * 与 useDevice 的分工：
 * - useDevice.hasCamera() 是「不弹权限框」的前置探测，回答「当前环境能不能发起拍照」；
 * - 本模块真正发起 getUserMedia，回答「用户是否授权、摄像头是否可用」，
 *   并把各平台千奇百怪的失败原因收口为带 code 的 CameraError，交由 UI 分支展示。
 *
 * 覆盖的环境事实：
 * - 仅安全上下文可用：HTTPS / localhost / 127.0.0.1；HTTP 局域网 IP 下
 *   navigator.mediaDevices 整个为 undefined（旧机同理）→ code='unsupported'；
 * - iOS Safari 11+ 需 playsinline（组件侧处理）；拒绝后同一会话内再次调用
 *   仍会立即 reject（不弹框），需要 UI 引导用户去系统/浏览器设置改权限；
 * - Android 微信/自研 WebView：App 未授予系统相机权限时抛 NotAllowedError；
 * - 桌面无摄像头设备：NotFoundError；摄像头被其它应用占用：NotReadableError。
 *
 * 安全约定：
 * - 模块顶层零副作用，import 本文件不触碰 navigator/window，SSR / 单测安全；
 * - start() 失败绝不把原生弹窗/英文错误码抛给页面，一律转成 CameraError；
 * - 组件必须在不用时调用 stop()（或通过本模块的 stopCamera）停掉全部轨道，
 *   否则摄像头指示灯常亮、其它应用无法再占用相机。
 *
 * @module composables/useCamera
 */

/** 摄像头朝向：environment=后置主摄（货架拍摄默认）；user=前置 */
export type CameraFacingMode = 'environment' | 'user'

/**
 * 摄像头错误码（UI 只依赖这一层语义，不依赖 DOMException 英文名）：
 * - unsupported：环境不支持（非 HTTPS / 旧机 / mediaDevices 缺失）；
 * - not-allowed：用户拒绝授权，或系统/站点权限被关闭；
 * - not-found：没有满足约束的摄像头设备；
 * - not-readable：摄像头存在但无法打开（被其它应用占用、硬件/驱动异常）；
 * - security：安全上下文/权限策略禁止（document Policy 等）；
 * - over-constrained：请求参数无机型可满足（理论上 ideal 不会触发，WebView 兜底）；
 * - aborted：调用被中断（极少数浏览器并发抢占）；
 * - unknown：其它未分类异常。
 */
export type CameraErrorCode =
  | 'unsupported'
  | 'not-allowed'
  | 'not-found'
  | 'not-readable'
  | 'security'
  | 'over-constrained'
  | 'aborted'
  | 'unknown'

/** 摄像头异常：携带稳定 code 与原始 DOMException 名，便于日志与 UI 分支 */
export class CameraError extends Error {
  /** 归一化后的错误码 */
  readonly code: CameraErrorCode
  /** 原始 DOMException.name（诊断用，UI 不要直接展示英文） */
  readonly originalName: string

  constructor(code: CameraErrorCode, message: string, originalName = '') {
    super(message)
    this.name = 'CameraError'
    this.code = code
    this.originalName = originalName
  }
}

/** 拍照产物（dataUrl 供后端 base64 上传，blob 供本地预览/转 File） */
export interface CameraCapturedPhoto {
  /** data:image/jpeg;base64,… 形式，直接喂给 uploadPhoto(data, filename) */
  dataUrl: string
  /** 同一份 JPEG 的 Blob（本地用 URL.createObjectURL 预览，无需二次编码） */
  blob: Blob
  /** 建议文件名（photo_YYYYMMDD_HHMMSS.jpg） */
  name: string
}

/** getUserMedia 的视频约束（不导出 MediaStreamConstraints，保持调用面最小） */
interface CameraStreamConstraints {
  video: {
    facingMode: { ideal: CameraFacingMode }
  }
  audio: false
}

/* ─────────────────────────── SSR / 环境守卫 ─────────────────────────── */

function hasWindow(): boolean {
  return typeof window !== 'undefined'
}

function hasNavigator(): boolean {
  return typeof navigator !== 'undefined'
}

/**
 * 当前环境是否具备调用摄像头的硬性前提（纯特性检测、不弹权限框、永不抛错）。
 *
 * 判定：存在 navigator.mediaDevices.getUserMedia，且未明确处于非安全上下文
 * （window.isSecureContext === false）。HTTP 局域网 IP 访问时 mediaDevices
 * 通常直接为 undefined；isSecureContext 在老浏览器上可能缺字段（undefined
 * 不视为 false，避免误杀）。
 */
export function isCameraSupported(): boolean {
  if (!hasNavigator()) return false
  try {
    if (!('mediaDevices' in navigator) || !navigator.mediaDevices) return false
    if (typeof navigator.mediaDevices.getUserMedia !== 'function') return false
    if (hasWindow() && window.isSecureContext === false) return false
    return true
  } catch {
    return false
  }
}

/**
 * 把 getUserMedia 抛出的任意异常归一化为 CameraError。
 * 兼容历史前缀名（PermissionDeniedError / DevicesNotFoundError / TrackStartError）。
 */
function normalizeError(err: unknown): CameraError {
  if (err instanceof CameraError) return err

  const rawName = (err as DOMException | null)?.name ?? ''
  switch (rawName) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      // 用户点了拒绝，或站点/系统相机权限处于关闭状态
      return new CameraError('not-allowed', '用户拒绝了相机授权', rawName)
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new CameraError('not-found', '未找到可用的摄像头设备', rawName)
    case 'NotReadableError':
    case 'TrackStartError':
      // 相机被微信视频/系统相机等占用，或硬件层面打不开
      return new CameraError('not-readable', '摄像头被占用或暂时无法访问', rawName)
    case 'SecurityError':
      return new CameraError('security', '安全上下文或权限策略禁止使用相机', rawName)
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return new CameraError('over-constrained', '没有设备满足相机约束参数', rawName)
    case 'AbortError':
      return new CameraError('aborted', '相机启动被中断', rawName)
    default:
      return new CameraError('unknown', '相机启动失败', rawName)
  }
}

/**
 * 打开摄像头并返回实时 MediaStream。
 *
 * - 约束固定为 `{ video: { facingMode: { ideal } }, audio: false }`：
 *   用 ideal 而非 exact，单摄机型请求 user 时也能退回可用摄像头，不抛 Overconstrained；
 *   audio:false 避免触发麦克风权限（业代拍照不需要录音）。
 * - 环境不支持时直接抛 CameraError('unsupported')，**绝不调用原生接口、绝不弹原生报错**；
 * - 极端情况下拿到的流里没有视频轨道（个别 ROM 假流），立即释放并按 not-found 处理；
 * - 调用方负责在用完后 stopCamera(stream)。
 *
 * @param facingMode 期望朝向，默认后置 environment
 * @throws CameraError 统一错误（见 CameraErrorCode）
 */
export async function startCamera(
  facingMode: CameraFacingMode = 'environment',
): Promise<MediaStream> {
  if (!isCameraSupported()) {
    throw new CameraError('unsupported', '当前环境不支持调用摄像头（非 HTTPS 或浏览器过旧）')
  }

  const constraints: CameraStreamConstraints = {
    video: { facingMode: { ideal: facingMode } },
    audio: false,
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints)
  } catch (err) {
    throw normalizeError(err)
  }

  // 防御个别 WebView 返回空轨道/纯音频流：没有视频轨道等于失败，先释放再抛错
  const hasVideoTrack = stream.getVideoTracks().some((track) => {
    try {
      return track.readyState !== 'ended'
    } catch {
      return true
    }
  })
  if (!hasVideoTrack) {
    stopCamera(stream)
    throw new CameraError('not-found', '摄像头未返回有效的视频轨道')
  }

  return stream
}

/**
 * 停止一条 MediaStream 的全部轨道（音频/视频/未知 kind 一律 stop）。
 *
 * - null/undefined 安全（组件 teardown 可无条件调用）；
 * - 每条 track 的 stop 单独 try：个别轨道异常不影响其余轨道释放；
 * - 轨道停止后摄像头指示灯应立即熄灭，其它应用可重新占用相机。
 *
 * 注意：本函数只停轨道，不会自动清掉 video.srcObject——
 * 组件侧应先置空 srcObject 再调用本函数，避免个别浏览器显示最后一帧定格画面。
 */
export function stopCamera(stream: MediaStream | null | undefined): void {
  if (!stream) return
  let tracks: MediaStreamTrack[] = []
  try {
    tracks = stream.getTracks()
  } catch {
    return
  }
  tracks.forEach((track) => {
    try {
      track.stop()
    } catch {
      /* 单条轨道停止失败不阻断其它轨道释放 */
    }
  })
}

/**
 * 统计可用摄像头数量（用于决定是否显示「切换前后置」按钮）。
 *
 * 注意隐私模型：授权前 iOS 常返回空清单或匿名设备（kind 可能不可见），
 * 因此组件应在**拿到流之后**再调用本函数；任何异常都返回 0（宁可不显示切换钮，
 * 也不因此阻断主流程）。
 */
export async function countVideoInputs(): Promise<number> {
  if (!isCameraSupported()) return 0
  try {
    if (typeof navigator.mediaDevices.enumerateDevices !== 'function') return 0
    const devices = await navigator.mediaDevices.enumerateDevices()
    if (!Array.isArray(devices)) return 0
    return devices.filter((d) => {
      try {
        return d.kind === 'videoinput'
      } catch {
        return false
      }
    }).length
  } catch {
    return 0
  }
}

export interface UseCameraReturn {
  /** 当前环境是否具备调用摄像头的硬性前提（同步、不弹权限、SSR 安全） */
  isSupported: () => boolean
  /** 打开摄像头，失败抛 CameraError */
  start: (facingMode?: CameraFacingMode) => Promise<MediaStream>
  /** 释放流的全部轨道（null 安全，保证指示灯熄灭） */
  stop: (stream: MediaStream | null | undefined) => void
  /** 统计视频输入设备数（授权后调用更准，异常返回 0） */
  countVideoInputs: () => Promise<number>
}

/**
 * 摄像头能力组合式函数（无响应式状态、无生命周期依赖）。
 *
 * 纯函数集合，可在 setup 内外任意调用；轨道的持有与释放由组件自行管理，
 * 本模块不缓存任何 MediaStream，避免组件卸载后遗留不可见的占用。
 */
export function useCamera(): UseCameraReturn {
  return {
    isSupported: isCameraSupported,
    start: startCamera,
    stop: stopCamera,
    countVideoInputs,
  }
}

export default useCamera
