<script setup lang="ts">
/**
 * 招牌加载 ·「牛奶注入奶滴」（定稿见 design-preview/design-system-v5.html Loading 板块）。
 *
 * 全站等待统一语言：线描奶滴中奶白液面波浪注入、气泡上浮，注满盖过尖顶后停留、
 * 白闪重置循环（大滴 2.8s / 按钮迷你 1.8s）。三种规格：
 * - full：120px 奶滴，白描边 + 奶白填充，置于深绿品牌底（启动闪屏）；
 * - card：120px 奶滴，品牌绿描边 + 固定奶白填充（卡片内嵌，夜间描边提亮）；
 * - button：58px 品牌渐变圆钮 + 30px 迷你白奶滴，永不显示文字。
 * prefers-reduced-motion：全部动画停止，静止为满滴 + 静态文案。
 */
import { computed } from 'vue'

type LoaderSize = 'full' | 'card' | 'button'

interface Props {
  size?: LoaderSize
  /** 文案：full 默认「牛奶注入中 · AI 正在准备」，card 默认「AI 生成中」；
   *  传空串隐藏文字；button 规格恒不显示文字 */
  label?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'card',
  label: undefined,
})

const FULL_DEFAULT_LABEL = '牛奶注入中 · AI 正在准备'
const CARD_DEFAULT_LABEL = 'AI 生成中'

/** clipPath id 必须全文档唯一（同页可并存闪屏 + 遮罩多个实例） */
let seq = 0
const clipId = `dxc-drop-clip-${++seq}`

const labelText = computed<string>(() => {
  if (props.label !== undefined) return props.label
  return props.size === 'full' ? FULL_DEFAULT_LABEL : CARD_DEFAULT_LABEL
})
const showLabel = computed<boolean>(() => props.size !== 'button' && labelText.value.length > 0)
const isButton = computed<boolean>(() => props.size === 'button')
</script>

<template>
  <div
    class="mdl"
    :class="`mdl--${size}`"
    role="status"
    aria-live="polite"
    :aria-label="isButton ? '加载中' : undefined"
  >
    <!-- ── 按钮内迷你奶滴：58px 品牌渐变圆钮，仅图标 ── -->
    <span v-if="isButton" class="mdl__btn">
      <svg class="mdl__mini" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <clipPath :id="clipId">
            <path d="M12 3C12 3 6 10.5 6 15.5a6 6 0 0 0 12 0C18 10.5 12 3 12 3z" />
          </clipPath>
        </defs>
        <g :clip-path="`url(#${clipId})`">
          <g class="mdl__mini-wave">
            <!-- 奶柱一直延伸到画布深处（V70），任何帧下方不漏空 -->
            <path class="mdl__mini-milk" d="M-6 10 Q0 7 6 10 T18 10 T30 10 V70 H-6 Z" />
          </g>
        </g>
        <path
          class="mdl__mini-outline"
          d="M12 3C12 3 6 10.5 6 15.5a6 6 0 0 0 12 0C18 10.5 12 3 12 3z"
        />
      </svg>
    </span>

    <!-- ── 120px 奶滴（full 深绿底白描 / card 白底绿描） ── -->
    <template v-else>
      <svg class="mdl__drop" width="120" height="120" viewBox="0 0 100 120" aria-hidden="true">
        <defs>
          <clipPath :id="clipId">
            <path d="M50 6 C50 6 14 46 14 74 a36 36 0 0 0 72 0 C86 46 50 6 50 6z" />
          </clipPath>
        </defs>
        <g :clip-path="`url(#${clipId})`">
          <g class="mdl__wave">
            <!-- 奶柱 V 到 340：液面上升全程下方永不漏空 -->
            <path class="mdl__milk" d="M-10 40 Q15 32 40 40 T90 40 T140 40 V340 H-10 Z" />
            <circle class="mdl__bubble" cx="38" cy="86" r="2.4" />
            <circle class="mdl__bubble mdl__bubble--d1" cx="58" cy="96" r="1.8" />
            <circle class="mdl__bubble mdl__bubble--d2" cx="48" cy="100" r="1.5" />
          </g>
        </g>
        <path
          class="mdl__outline"
          d="M50 6 C50 6 14 46 14 74 a36 36 0 0 0 72 0 C86 46 50 6 50 6z"
        />
      </svg>
      <p v-if="showLabel" class="mdl__label">{{ labelText }}</p>
    </template>
  </div>
</template>

<style scoped>
.mdl {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: fit-content;
  margin: 0 auto;
}

/* ── 120px 奶滴共用结构 ── */
.mdl__drop {
  display: block;
  width: 120px;
  height: 120px;
}

.mdl__outline {
  fill: none;
}

/* full：深绿品牌底上的白描边 + 奶白 */
.mdl--full .mdl__outline {
  stroke: #fff;
  stroke-width: 3;
}

.mdl--full .mdl__milk {
  fill: #fdfdf7;
}

/* card：白底牌，奶固定奶白色（奶就是白的，不随主题反色）；描边夜间提亮 */
.mdl--card .mdl__outline {
  stroke: var(--brand-deep);
  stroke-width: 3.5;
}

.mdl--card .mdl__milk {
  fill: #f3faf5;
}

:global([data-theme='dark']) .mdl--card .mdl__outline {
  stroke: var(--brand);
}

/* 空 → 满：满帧液面 -40 盖过尖顶（y=6），停留后白闪重置，周期 2.8s */
.mdl__wave {
  animation: mdl-pour 2.8s cubic-bezier(0.45, 0.05, 0.35, 1) infinite;
}

@keyframes mdl-pour {
  0% {
    transform: translateY(72px);
  }
  45% {
    transform: translateY(-40px);
  }
  74% {
    transform: translateY(-40px);
  }
  84% {
    transform: translateY(-40px);
  }
  88% {
    transform: translateY(-40px);
    opacity: 1;
  }
  91% {
    transform: translateY(-40px);
    opacity: 0;
  }
  92% {
    transform: translateY(72px);
    opacity: 0;
  }
  100% {
    transform: translateY(72px);
    opacity: 1;
  }
}

.mdl__bubble {
  fill: #fff;
  opacity: 0.7;
  animation: mdl-bub 2.8s ease-in infinite;
}

.mdl__bubble--d1 {
  animation-delay: 0.7s;
}

.mdl__bubble--d2 {
  animation-delay: 1.2s;
}

@keyframes mdl-bub {
  0% {
    transform: translateY(10px);
    opacity: 0;
  }
  30% {
    opacity: 0.8;
  }
  60% {
    transform: translateY(-14px);
    opacity: 0;
  }
  100% {
    opacity: 0;
  }
}

/* ── 文案 ── */
.mdl__label {
  margin: 12px 0 0;
  text-align: center;
  white-space: nowrap;
}

.mdl--full .mdl__label {
  color: #bff0d4;
  font-size: 10.5px;
  letter-spacing: 2px;
}

.mdl--card .mdl__label {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-2);
}

/* ── 按钮规格：58px 圆钮 + 30px 迷你奶滴 ── */
.mdl__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: var(--grad-brand);
  box-shadow: var(--sh-brand);
}

.mdl__mini {
  display: block;
  width: 30px;
  height: 30px;
}

.mdl__mini-outline {
  fill: none;
  stroke: #fff;
  stroke-width: 2.4;
}

.mdl__mini-milk {
  fill: #fff;
}

.mdl__mini-wave {
  animation: mdl-pour-mini 1.8s cubic-bezier(0.45, 0.05, 0.35, 1) infinite;
}

@keyframes mdl-pour-mini {
  0% {
    transform: translateY(13px);
  }
  55% {
    transform: translateY(-7px);
  }
  85% {
    transform: translateY(-7px);
  }
  92% {
    opacity: 0;
    transform: translateY(-7px);
  }
  93% {
    transform: translateY(13px);
    opacity: 0;
  }
  100% {
    transform: translateY(13px);
    opacity: 1;
  }
}
</style>
