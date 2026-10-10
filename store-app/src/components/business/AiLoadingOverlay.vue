<script setup lang="ts">
/**
 * AI 分步加载遮罩（PRD 4.4 加载态 / T04.5）。
 *
 * 全屏紫渐变 + 5 步文字流，每步打绿勾 + 进度条推进 0→100%，约 2.4s（演示设置可调慢）。
 */
import AppIcon from '@/components/common/AppIcon.vue'
import type { Step } from '@/types'

interface Props {
  visible: boolean
  steps: Step[]
  /** 当前步骤下标 */
  current: number
  /** 已完成步骤数 */
  done: number
  /** 进度百分比 */
  percent: number
}
withDefaults(defineProps<Props>(), { visible: false, steps: () => [], current: -1, done: 0, percent: 0 })
</script>

<template>
  <Transition name="overlay">
    <div v-if="visible" class="overlay">
      <div class="overlay__inner">
        <div class="overlay__orb">
          <AppIcon name="sparkles" :size="26" color="#fff" />
        </div>
        <p class="overlay__title">✦ AI 正在分析这家店</p>
        <p class="overlay__sub">识别 → 比对标准 → 结合动销推理</p>

        <ul class="overlay__steps">
          <li
            v-for="(s, i) in steps"
            :key="i"
            class="overlay__step"
            :class="{
              'overlay__step--done': i < done,
              'overlay__step--active': i === current,
              'overlay__step--idle': i > current,
            }"
          >
            <span class="overlay__dot">
              <AppIcon v-if="i < done" name="check" :size="12" color="#fff" />
            </span>
            <span class="overlay__text">{{ s.text }}</span>
          </li>
        </ul>

        <div class="overlay__bar">
          <div class="overlay__fill" :style="{ width: `${percent}%` }" />
        </div>
        <p class="overlay__pct">{{ percent }}%</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.overlay {
  position: absolute;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(160deg, #2a1d6b 0%, var(--ai-purple) 55%, var(--ai-purple-2) 100%);
}

.overlay__inner {
  width: 100%;
  max-width: 320px;
  text-align: center;
  color: #fff;
}

.overlay__orb {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 62px;
  height: 62px;
  margin-bottom: 14px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  animation: orb-pulse 1.6s ease infinite;
}

@keyframes orb-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.32);
  }
  50% {
    box-shadow: 0 0 0 14px rgba(255, 255, 255, 0);
  }
}

.overlay__title {
  font-size: 16px;
  font-weight: 700;
}

.overlay__sub {
  margin-top: 3px;
  font-size: 12px;
  opacity: 0.78;
}

.overlay__steps {
  margin: 20px 0 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
}

.overlay__step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  opacity: 0.45;
  transition: all 0.3s ease;
}

.overlay__step--active {
  opacity: 1;
  transform: translateX(2px);
}

.overlay__step--done {
  opacity: 0.9;
}

.overlay__dot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.55);
}

.overlay__step--done .overlay__dot {
  border-color: transparent;
  background: var(--mn-green);
}

.overlay__text {
  line-height: 1.5;
}

.overlay__bar {
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  overflow: hidden;
}

.overlay__fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--mn-green) 0%, #6ee7a0 100%);
  transition: width 0.4s ease;
}

.overlay__pct {
  margin-top: 6px;
  font-size: 11px;
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.28s ease;
}

.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}
</style>
