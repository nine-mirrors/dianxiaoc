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
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PhoneFrame from '@/components/common/PhoneFrame.vue'
import ToastHost from '@/components/common/ToastHost.vue'
import AppErrorBoundary from '@/components/common/AppErrorBoundary.vue'

const route = useRoute()
const router = useRouter()

/** 经理看板走桌面宽屏形态，其余页面内嵌手机壳 */
const usePhoneFrame = computed<boolean>(() => !route.path.startsWith('/manager'))

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
router.afterEach(() => {
  const position = (window.history.state as { position?: number } | null)?.position
  if (typeof position === 'number') {
    routeDirection.value = position < historyPosition.value ? 'back' : 'forward'
    historyPosition.value = position
  }
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
</template>
