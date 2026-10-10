<script setup lang="ts">
/**
 * 桌面端 390×844 手机壳（PRD 3.3 + 需求池 ㊺，录屏更专业）。
 *
 * 外挂一个演示设置齿轮：加载速度 1×/2×、骨架屏开关、重置演示数据。
 * ⚠ 齿轮只在外壳之外显示，不进手机屏截图。
 */
import { useRouter } from 'vue-router'
import { useDemoStore } from '@/stores/demo'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'
import { resetDemoData } from '@/api'
import AppIcon from './AppIcon.vue'

const demo = useDemoStore()
const session = useSessionStore()
const router = useRouter()
const toast = useToast()

/**
 * 切换账号（演示期入口）。
 * ⚠ 2026-10-09 修正：原实现 `session.login(next)` 只传角色值，
 *   与新签名 login(username, password) 不匹配 —— 点了必然失败。身份必须由账号决定。
 */
function switchAccount(): Promise<void> {
  session.logout()
  toast.info('请重新登录目标账号')
  return router.push('/login')
}

/** 重置演示数据 */
async function onReset(): Promise<void> {
  await resetDemoData()
  toast.success('演示数据已重置')
  setTimeout(() => window.location.reload(), 600)
}
</script>

<template>
  <div class="phone-shell">
    <!-- 演示设置齿轮：仅桌面可视，不属于手机屏内容 -->
    <button class="shell-gear" title="演示设置" @click="demo.togglePanel()">
      <AppIcon name="sliders" :size="18" />
    </button>

    <Transition name="fade">
      <div v-if="demo.panelVisible" class="shell-panel">
        <p class="shell-panel__title">演示设置</p>
        <div class="shell-panel__row">
          <span>加载速度</span>
          <div class="seg">
            <button
              v-for="s in [1, 2]"
              :key="s"
              class="seg__item"
              :class="{ 'seg__item--on': demo.speed === s }"
              @click="demo.setSpeed(s)"
            >
              {{ s }}×
            </button>
          </div>
        </div>
        <div class="shell-panel__row">
          <span>骨架屏</span>
          <button class="shell-panel__link" @click="demo.toggleSkeleton()">
            {{ demo.skeleton ? '开启' : '关闭' }}
          </button>
        </div>
        <div class="shell-panel__row">
          <span>AI 分析时长</span>
          <b>约 {{ (demo.aiDurationMs / 1000).toFixed(1) }}s</b>
        </div>
        <button class="shell-panel__link shell-panel__row-item" @click="switchAccount">
          <AppIcon name="refresh" :size="13" /> 切换账号（当前：{{ session.roleLabel }} · {{ session.user?.name ?? '—' }}）
        </button>
        <button class="shell-panel__link shell-panel__row-item" @click="onReset">
          <AppIcon name="trash" :size="13" /> 重置演示数据
        </button>
        <p class="shell-panel__hint">✦ AI 双模式：联网走千问真模型 · 断网自动离线兜底</p>
      </div>
    </Transition>

    <!-- 390×844 手机屏 -->
    <div class="phone">
      <div class="phone__notch" aria-hidden="true" />
      <div class="phone__screen">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.phone-shell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 24px 0;
}

.phone {
  position: relative;
  /* ★ 关键：作为「全屏」的裁剪边界。手机内的 fixed 元素（地图全屏）
     以此为定位上下文，不会穿透到整个浏览器窗口去撑满桌面视口 */
  z-index: 1;
  width: var(--phone-w);
  height: var(--phone-h);
  border-radius: 40px;
  background: #10140f;
  box-shadow:
    0 0 0 10px #1b1f1c,
    0 0 0 11px #2c322d,
    0 24px 60px rgba(0, 0, 0, 0.32);
  overflow: hidden;
}

.phone__notch {
  position: absolute;
  top: 8px;
  left: 50%;
  z-index: 20;
  width: 112px;
  height: 24px;
  border-radius: 999px;
  background: #10140f;
  transform: translateX(-50%);
  pointer-events: none;
}

.phone__screen {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-page);
  /* 预留刘海/灵动岛高度，避免顶栏标题被遮挡（真实手机状态栏位） */
  padding-top: 30px;
  box-sizing: border-box;
}

/* 演示设置齿轮 */
.shell-gear {
  position: fixed;
  right: 18px;
  top: 18px;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 50%;
  background: #fff;
  color: var(--text-2);
  box-shadow: var(--shadow-card);
}

.shell-gear:hover {
  color: var(--mn-green);
}

.shell-panel {
  position: fixed;
  right: 18px;
  top: 64px;
  z-index: 2000;
  width: 218px;
  padding: 12px;
  border-radius: var(--radius-card);
  background: #fff;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.14);
  font-size: 12px;
  color: var(--text-2);
}

.shell-panel__title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-1);
}

.shell-panel__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border-color);
}

.shell-panel__row-item {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  margin-top: 8px;
  padding: 6px 0;
  border: none;
  background: none;
  color: var(--mn-green);
  font-size: 12px;
  text-align: left;
}

.shell-panel__link {
  border: none;
  background: none;
  color: var(--mn-green);
  font-size: 12px;
}

.shell-panel__hint {
  margin-top: 10px;
  font-size: 11px;
  color: var(--ai-purple);
}

.seg {
  display: inline-flex;
  padding: 2px;
  border-radius: 999px;
  background: var(--bg-page);
}

.seg__item {
  min-width: 34px;
  height: 22px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 600;
}

.seg__item--on {
  background: var(--mn-green);
  color: #fff;
}

.fade-enter-active,
.fade-leave-active {
  transition: all 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* 窄屏（真机 / 手机模式）下自动退化为全屏，不再套壳 */
@media (max-width: 480px) {
  .phone,
  .phone__screen {
    width: 100%;
    height: 100vh;
    border-radius: 0;
    box-shadow: none;
  }

  .phone__notch,
  .shell-gear,
  .shell-panel {
    display: none;
  }
}
</style>
