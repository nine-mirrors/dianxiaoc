<script setup lang="ts">
/**
 * PosterShare —— 战报海报分享（W7 平台层）。
 *
 * 通用模态组件：组件**不取数、不造数**，一切数字均由调用方通过 props 传入。
 *
 * 能力：
 *  - <canvas> 绘制 1080×1920 竖版海报：品牌绿渐变底、奶滴 logo、「店小C」品牌字、
 *    门店名、若干数据块、底部 slogan；
 *  - 预览按容器等比缩放；「下载图片」用 toDataURL → <a download>；
 *  - 「复制文案」用 navigator.clipboard.writeText，失败降级为 Toast 提示；
 *  - 海报是按 devicePixelRatio 提升 backing store 后绘制的定稿图，不受日夜主题影响
 *    （与 splash 定稿渐变同源，色值固定，属品牌图像而非可换肤 UI）。
 */
import { onMounted, ref, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useToast } from '@/composables/useToast'

interface PosterStat {
  label: string
  value: string
}

interface Props {
  title: string
  stats: PosterStat[]
  storeName?: string
}
const props = withDefaults(defineProps<Props>(), {
  storeName: '',
})
const emit = defineEmits<{ (e: 'close'): void }>()

const toast = useToast()

const W = 1080
const H = 1920
const FONT = "'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
/** 品牌定稿色（与启动闪屏渐变同源，海报为固定品牌图像） */
const GREEN_TOP = '#06964c'
const GREEN_BOTTOM = '#02803f'
const ACCENT = '#bff0d4'

const canvasRef = ref<HTMLCanvasElement | null>(null)

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function draw(): void {
  const cv = canvasRef.value
  if (!cv) return
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)
  cv.width = W * dpr
  cv.height = H * dpr
  const ctx = cv.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)
  ctx.textBaseline = 'alphabetic'

  /* ── 背景：品牌绿渐变 ── */
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, GREEN_TOP)
  bg.addColorStop(1, GREEN_BOTTOM)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  /* ── 装饰光晕 ── */
  const glow = ctx.createRadialGradient(W * 0.82, H * 0.16, 20, W * 0.82, H * 0.16, 520)
  glow.addColorStop(0, 'rgba(255,255,255,0.16)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  /* ── 奶滴 logo ── */
  roundRect(ctx, 90, 120, 132, 132, 40)
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.fill()
  ctx.save()
  ctx.translate(156, 186)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(0, -40)
  ctx.bezierCurveTo(0, -40, -34, 6, -34, 26)
  ctx.arc(0, 26, 34, Math.PI, 0)
  ctx.bezierCurveTo(34, 6, 0, -40, 0, -40)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  /* ── 品牌字 ── */
  ctx.fillStyle = '#ffffff'
  ctx.font = `900 60px ${FONT}`
  ctx.fillText('店小C', 262, 196)
  ctx.fillStyle = ACCENT
  ctx.font = `600 26px ${FONT}`
  ctx.fillText('MENGNIU AI · 巡店助手', 264, 238)

  /* ── 标题 ── */
  ctx.fillStyle = '#ffffff'
  ctx.font = `900 96px ${FONT}`
  ctx.fillText(props.title || '今日战报', 90, 440)

  if (props.storeName) {
    ctx.fillStyle = ACCENT
    ctx.font = `600 42px ${FONT}`
    ctx.fillText(props.storeName, 92, 510)
  }

  /* ── 数据块 ── */
  const stats = props.stats ?? []
  const startY = 620
  const rowH = 168
  stats.forEach((s, i) => {
    const y = startY + i * rowH
    roundRect(ctx, 90, y, W - 180, 140, 28)
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `800 84px ${FONT}`
    ctx.fillText(String(s.value), 134, y + 96)
    ctx.fillStyle = ACCENT
    ctx.font = `600 34px ${FONT}`
    ctx.fillText(String(s.label), 138, y + 128)
  })

  /* ── 中部留白装饰 + 底部 slogan ── */
  const sloganY = H - 150
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(90, sloganY - 60)
  ctx.lineTo(W - 90, sloganY - 60)
  ctx.stroke()

  ctx.fillStyle = '#ffffff'
  ctx.font = `700 44px ${FONT}`
  ctx.fillText('让每一家店，都被 AI 看明白', 90, sloganY)

  ctx.fillStyle = ACCENT
  ctx.font = `500 28px ${FONT}`
  ctx.fillText('店小C · 蒙牛 AI 巡店助手', 90, sloganY + 52)
}

onMounted(() => {
  void Promise.resolve().then(draw)
})
watch(
  () => [props.title, props.storeName, props.stats],
  () => draw(),
)

function download(): void {
  const cv = canvasRef.value
  if (!cv) return
  try {
    const url = cv.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `店小C-${props.title || '战报'}.png`
    a.click()
  } catch {
    toast.error('图片导出失败，请重试')
  }
}

function copyText(): void {
  const lines = [`店小C · ${props.title}`, props.storeName || '', ...props.stats.map((s) => `${s.label}：${s.value}`)]
    .filter(Boolean)
    .join('\n')
  const clip = navigator.clipboard
  if (clip && typeof clip.writeText === 'function') {
    clip.writeText(lines).then(
      () => toast.success('文案已复制'),
      () => toast.info('当前环境不支持自动复制，请手动选择文案'),
    )
  } else {
    toast.info('当前环境不支持自动复制，请手动选择文案')
  }
}
</script>

<template>
  <div class="ps" @click.self="emit('close')">
    <div class="ps__panel">
      <header class="ps__head">
        <span class="ps__head-title">战报海报</span>
        <button type="button" class="ps__close u-tap" aria-label="关闭" @click="emit('close')">
          <AppIcon name="close" :size="18" color="var(--text-2)" />
        </button>
      </header>

      <div class="ps__preview">
        <canvas ref="canvasRef" class="ps__canvas" />
      </div>

      <footer class="ps__ops">
        <button type="button" class="u-btn u-btn--ghost ps__btn" @click="copyText">
          <AppIcon name="clipboard" :size="16" color="currentColor" />
          <span>复制文案</span>
        </button>
        <button type="button" class="u-btn u-btn--primary ps__btn" @click="download">
          <AppIcon name="download" :size="16" color="var(--milk)" />
          <span>下载图片</span>
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.ps {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--bg-mask);
}

.ps__panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 320px;
  max-height: 92%;
  padding: 14px;
  border-radius: 18px;
  background: var(--bg-card);
  box-shadow: var(--sh-3);
}

.ps__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
}

.ps__head-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

.ps__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  background: none;
}

.ps__preview {
  flex: 1;
  min-height: 0;
  margin-top: 12px;
  border-radius: 12px;
  overflow-y: auto;
  background: var(--bg-page);
}

.ps__canvas {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 12px;
}

.ps__ops {
  display: flex;
  gap: 10px;
  flex: none;
  margin-top: 12px;
}

.ps__btn {
  flex: 1;
}
</style>
