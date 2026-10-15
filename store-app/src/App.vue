<script lang="ts">
/**
 * 普通 <script> 块：仅用于在模块求值阶段（main.ts import App 时、mount 之前）
 * 同步首帧主题，避免整页加载瞬间的日 / 夜白闪。逻辑本身在 useTheme 单例内幂等。
 */
import { initTheme } from '@/composables/useTheme'

initTheme()
</script>

<script setup lang="ts">
/**
 * 根组件。
 *
 * 职责（ARCHITECTURE §8.8）：
 *  - 业代端 / 店员端：包一层桌面端手机壳（390×844），录屏更专业；
 *  - 经理看板（/manager/**）：桌面 1440 宽屏，不套壳；
 *  - 全站常驻 Toast 容器。
 *
 * 路由转场（见 styles/motion.css）：
 *  - 手机壳内：新页从右轻推入、浏览器/手势返回向左（方向由 history.state.position
 *    增减判定，仅用于观感，不参与任何业务与守卫逻辑）；
 *  - 桌面看板：out-in 淡入 + ≤8px 上移，不使用绝对定位，避免干扰窗口滚动。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PhoneFrame from '@/components/common/PhoneFrame.vue'
import ToastHost from '@/components/common/ToastHost.vue'
import AppErrorBoundary from '@/components/common/AppErrorBoundary.vue'
import MilkDropLoader from '@/components/common/MilkDropLoader.vue'
import AiFab from '@/components/common/AiFab.vue'
import BootCover from '@/components/platform/BootCover.vue'
import AppTour from '@/components/platform/AppTour.vue'
import OnboardingGuide from '@/components/platform/OnboardingGuide.vue'
import { useDocumentBadge } from '@/composables/useDocumentBadge'

const route = useRoute()
const router = useRouter()

/**
 * 后台标签新消息标题角标：切走页面收到 message:new / announcement:new 时
 * 标题变 `(n) 店小C`，回页面清零恢复；纯副作用，不渲染任何 UI。
 */
useDocumentBadge()

/* ═══════════════ 经理桌面端：全局键盘快捷键 ═══════════════ */

/**
 * 当前焦点是否落在可编辑控件内（input / textarea / select / contenteditable）。
 * 聚焦中按 "/" 应原样输入到控件，不触发跳转。
 */
function isEditableFocused(): boolean {
  const el = document.activeElement
  if (!el || el === document.body) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return (el as HTMLElement).isContentEditable === true
}

/** 当前是否有弹窗 / 对话框打开（全站弹层统一 role="dialog"，v-if 挂载即为打开） */
function hasOpenDialog(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).some(
    (el) => el.getClientRects().length > 0,
  )
}

/**
 * 经理桌面形态（route.path 以 /manager 开头）下：
 * 按 "/" → 跳转 AI 问答并要求自动聚焦输入（?focus=1 由 AiAskView 自行处理）。
 * Escape 不在此处理（保持各弹窗 / 既有逻辑原样）。
 */
function onManagerKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
  if (!route.path.startsWith('/manager')) return
  if (event.key !== '/') return
  if (isEditableFocused() || hasOpenDialog()) return
  event.preventDefault()
  void router.push({ path: '/manager/ask', query: { focus: '1' } })
}

/** 经理看板（/manager/**）与总控后台（/admin/**）走桌面宽屏形态，其余页面内嵌手机壳 */
const usePhoneFrame = computed<boolean>(
  () => !route.path.startsWith('/manager') && !route.path.startsWith('/admin'),
)

/**
 * 转场方向：只依据 history.state.position 的增减。
 *  - push / replace：position 不变或增大 → forward（新页自右推入）
 *  - 后退（浏览器后退、router.back、手势返回）：position 减小 → back（自左返回）
 * afterEach 早于新组件渲染，ref 在此更新可保证 <transition :name> 取到当次方向。
 */
const historyPosition = ref<number>(
  (window.history.state as { position?: number } | null)?.position ?? 0,
)
const routeDirection = ref<'forward' | 'back'>('forward')

/**
 * 路由转场「看门狗」—— 防 Vue <transition> 的 rAF 链断裂导致页面永久卡死。
 *
 * 背景：Vue 的 enter/leave 在挂载/卸载类名之间用双 requestAnimationFrame 切帧。
 * 当浏览器标签非激活、窗口最小化、手机息屏或 WebView 被宿主节流时，rAF 回调
 * 可能被无限推迟且事后不补跑 —— 现象是 URL 已变、旧组件永远停在
 * `*-leave-from`、新组件停在 `*-enter-from`（白屏或旧页不换）。
 * 评委演示切窗口、手机锁屏后回到页面都可能触发，属高危，必须自愈。
 *
 * 策略：每次路由切换后 900ms（正常转场最长约 320ms，留足余量）扫描 DOM，
 * 若仍有转场起止帧类名残留，说明转场已死，bump retrySeed 强制重挂载
 * RouterView 内容（AppErrorBoundary 内 :key="retrySeed"），一次恢复。
 */
const STUCK_FROM_RE = /(?:mot-route-desk|mot-route-mob|mot-route-mob-back)-(?:enter|leave)-from\b/
let watchdogTimer: number | undefined

router.afterEach(() => {
  const position = (window.history.state as { position?: number } | null)?.position
  if (typeof position === 'number') {
    routeDirection.value = position < historyPosition.value ? 'back' : 'forward'
    historyPosition.value = position
  }

  if (watchdogTimer !== undefined) window.clearTimeout(watchdogTimer)
  watchdogTimer = window.setTimeout(() => {
    watchdogTimer = undefined
    const stuck = Array.from(document.querySelectorAll<HTMLElement>('[class*="mot-route-"]')).some(
      (el) => STUCK_FROM_RE.test(el.className),
    )
    if (stuck) retrySeed.value += 1
  }, 900)
})

/** 移动端转场名（前进 / 返回两套方向） */
const mobileTransitionName = computed<string>(() =>
  routeDirection.value === 'back' ? 'mot-route-mob-back' : 'mot-route-mob',
)

/**
 * 错误边界「重试当前页」种子：仅在用户点击重试时 +1，作为路由内容子树的 key
 * 强制重新挂载出错页面；正常路由切换时该值不变，同路由改参数的实例复用语义
 * （如拍照页切换门店）与历史行为完全一致。手机壳/桌面两种形态互斥，共享一份即可。
 */
const retrySeed = ref(0)
function retryRouteContent(): void {
  retrySeed.value += 1
}

/**
 * 启动品牌闪屏：仅整页加载出现一次（SPA 内部导航不挂载，自然不出现）。
 * 独立 fixed 层（z 1300 高于 Toast），不包裹、不阻塞 RouterView 渲染；
 * 「最短展示时长到达」且「路由首次就绪」两个条件都满足后才淡出移除。
 */
const prefersReducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
const SPLASH_MIN_MS = prefersReducedMotion ? 600 : 1700

const splashOn = ref(true)
let splashMinElapsed = false
let splashRouteReady = false
let splashDone = false
let splashTimer: number | undefined

function dismissSplash(): void {
  if (splashDone || !splashMinElapsed || !splashRouteReady) return
  splashDone = true
  splashOn.value = false
}

onMounted(() => {
  splashTimer = window.setTimeout(() => {
    splashMinElapsed = true
    dismissSplash()
  }, SPLASH_MIN_MS)
  void router.isReady().then(() => {
    splashRouteReady = true
    dismissSplash()
  })
  // 经理端全局快捷键（处理器内部按 route.path 判定，仅 /manager 生效）
  document.addEventListener('keydown', onManagerKeydown)
})

onBeforeUnmount(() => {
  if (splashTimer !== undefined) window.clearTimeout(splashTimer)
  if (watchdogTimer !== undefined) window.clearTimeout(watchdogTimer)
  document.removeEventListener('keydown', onManagerKeydown)
})
</script>

<template>
  <PhoneFrame v-if="usePhoneFrame">
    <!-- 错误边界包在内容区外层、转场外层：渲染异常只替换壳内内容，手机壳/顶栏/Toast 不被炸没。
         注意：边界不能嵌进 <transition> 内（其默认插槽根为 Fragment，会让 Transition
         丢失可动画的元素根），故保持 mot-route-host → RouterView → transition 原结构不动。 -->
    <AppErrorBoundary @retry="retryRouteContent">
      <!-- mot-route-host：转场定位上下文 + 溢出裁剪，盒模型与 ml-body 滚动不受影响 -->
      <div class="mot-route-host">
        <RouterView v-slot="{ Component }">
          <transition :name="mobileTransitionName">
            <component :is="Component" :key="retrySeed" />
          </transition>
        </RouterView>
      </div>
    </AppErrorBoundary>
    <!-- Toast 收在手机壳覆盖层内，桌面演示不漂出机壳 -->
    <template #overlay>
      <ToastHost confined />
      <!-- AI 悬浮球 + 抽屉：与 Toast 同处壳内覆盖层，自身按路由/角色决定是否显示 -->
      <AiFab />
    </template>
  </PhoneFrame>
  <AppErrorBoundary v-else @retry="retryRouteContent">
    <RouterView v-slot="{ Component }">
      <transition name="mot-route-desk" mode="out-in">
        <component :is="Component" :key="retrySeed" />
      </transition>
    </RouterView>
  </AppErrorBoundary>

  <!-- 桌面看板 Toast（手机壳分支已在壳内渲染，互斥只挂一份） -->
  <ToastHost v-if="!usePhoneFrame" />

  <!-- ══ 平台层浮层：与 splash / ToastHost 平级，显示条件均由组件内部按路由/角色判断 ══ -->
  <!-- 开场战报层（?boot=1 或本次会话未播过） -->
  <BootCover />
  <!-- ?tour=1 聚光灯导览 -->
  <AppTour />
  <!-- 角色化新手引导（每角色一次，仅手机形态） -->
  <OnboardingGuide />

  <!-- ══ 启动品牌闪屏：整页加载一次，独立 fixed 层（z 1300 高于 Toast），
       与 PhoneFrame / RouterView / ToastHost 完全平级，不包裹任何既有结构，
       路由在其下方照常首帧渲染，不阻塞 ══ -->
  <Transition name="app-splash">
    <div v-if="splashOn" class="app-splash">
      <MilkDropLoader size="full" label="" />
      <div class="app-splash__brand">
        <span class="app-splash__logo">
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3C12 3 6 10.5 6 15.5a6 6 0 0 0 12 0C18 10.5 12 3 12 3z" fill="#fff" />
          </svg>
        </span>
        <span class="app-splash__name">
          <b>店小C</b>
          <small>MENGNIU AI</small>
        </span>
      </div>
      <p class="app-splash__tip">牛奶注入中 · AI 正在准备</p>
    </div>
  </Transition>
</template>

<style scoped>
/* 深绿品牌底全屏（色值对齐 design-system-v5 定稿 splash 渐变） */
.app-splash {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: linear-gradient(150deg, #06964c, #02803f);
}

.app-splash__brand {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #fff;
}

.app-splash__logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.16);
}

.app-splash__name b {
  display: block;
  font-size: 16px;
  font-weight: 900;
  line-height: 1.2;
  letter-spacing: 2px;
}

.app-splash__name small {
  display: block;
  margin-top: 1px;
  font-size: 8px;
  letter-spacing: 3px;
  opacity: 0.75;
}

.app-splash__tip {
  margin: 0;
  color: #bff0d4;
  font-size: 10.5px;
  letter-spacing: 2px;
}

.app-splash-leave-active {
  transition: opacity 320ms var(--ease-standard);
  pointer-events: none;
}

.app-splash-leave-to {
  opacity: 0;
}

/* 减弱动效：0.6s 到时直接移除，无淡出过渡 */
@media (prefers-reduced-motion: reduce) {
  .app-splash-leave-active {
    transition: none;
  }
}
</style>
