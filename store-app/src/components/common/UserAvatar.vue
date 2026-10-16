<script setup lang="ts">
/**
 * UserAvatar —— 全站统一头像组件（有真实头像显图，无则回落到首字）。
 *
 * 使用：
 *   <UserAvatar :url="session.avatarUrl" :name="session.user?.name" :text="session.avatarText" :size="54" />
 *   <UserAvatar :url="u.avatarUrl" :name="u.name" :size="30" variant="glass" />
 *
 * 设计要点：
 *  - **形状 / 圆角 / 字号 / 回落色统一**：一律正圆、字号按 size 比例缩放，
 *    避免各处头像风格不一；回落色由 variant 统一（品牌绿底 / 品牌渐变上的半透明白）。
 *  - **绝不出现空白方块或裂图**：图片加载失败时自动回落到首字（onerror 标记）。
 *  - 四种展示位共用本组件，改样式只改这一处即全端一致。
 */
import { computed, ref, watch } from 'vue'

interface Props {
  /** 头像图片地址（后端 /uploads/... 绝对 URL）；为空走首字回落 */
  url?: string | null
  /** 用户姓名：用于 <img alt> 与无障碍标签；缺省时回落文本取其次 */
  name?: string | null
  /** 首字回落文本（后端 avatarText，如「李」「运」）；不传则取 name 首字 */
  text?: string | null
  /** 直径 px */
  size?: number
  /**
   * 视觉变体：
   *  - solid：品牌绿底白字（默认，浅底/侧栏等场景）；
   *  - glass：半透明白底 + 白色描边（用于品牌渐变或深色背景上的头像）。
   */
  variant?: 'solid' | 'glass'
}

const props = withDefaults(defineProps<Props>(), {
  url: '',
  name: '',
  text: '',
  size: 36,
  variant: 'solid',
})

/** 图片加载失败标记：一旦失败即永久回落首字，不再尝试显示裂图 */
const broken = ref<boolean>(false)
// 头像 URL 变化时重置失败标记（换新头像后重新尝试加载）
watch(
  () => props.url,
  () => {
    broken.value = false
  },
)

const showImg = computed<boolean>(() => !!props.url && !broken.value)

/** 回落首字：优先显式 text，其次 name 首字，最后给「—」占位（与 session.avatarText 口径一致） */
const initial = computed<string>(() => {
  const t = String(props.text ?? '').trim()
  if (t) return t.charAt(0)
  const n = String(props.name ?? '').trim()
  return n ? n.charAt(0) : '—'
})

/** 无障碍标签（读屏用） */
const label = computed<string>(() => (props.name ? `${props.name}的头像` : '用户头像'))

/** 首字字号：随直径等比缩放（0.4 倍），保证不同尺寸下视觉比例一致 */
const fontSize = computed<number>(() => Math.max(11, Math.round(props.size * 0.4)))
</script>

<template>
  <span
    class="ua"
    :class="`ua--${variant}`"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${fontSize}px` }"
    role="img"
    :aria-label="label"
  >
    <img v-if="showImg" class="ua__img" :src="url ?? ''" :alt="label" @error="broken = true" />
    <span v-else class="ua__text" aria-hidden="true">{{ initial }}</span>
  </span>
</template>

<style scoped>
/* 统一圆形：正圆 + 裁剪，图与首字都严格落在同一形状内 */
.ua {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  line-height: 1;
  user-select: none;
}

.ua__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ua__text {
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0;
}

/* 变体一：品牌绿底白字（浅底场景，回落态沿用原 dl-user 视觉） */
.ua--solid {
  background: var(--mn-green, #009639);
  color: #fff;
}

/* 变体二：半透明白（品牌渐变/深色场景，回落态沿用原 p2-head / me-card 视觉） */
.ua--glass {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.7);
}
</style>
