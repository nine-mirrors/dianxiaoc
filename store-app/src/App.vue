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
</script>

<template>
  <PhoneFrame v-if="usePhoneFrame">
    <!-- mot-route-host：转场定位上下文 + 溢出裁剪，盒模型与 ml-body 滚动不受影响 -->
    <div class="mot-route-host">
      <RouterView v-slot="{ Component }">
        <transition :name="mobileTransitionName">
          <component :is="Component" />
        </transition>
      </RouterView>
    </div>
    <!-- Toast 收在手机壳覆盖层内，桌面演示不漂出机壳 -->
    <template #overlay>
      <ToastHost confined />
    </template>
  </PhoneFrame>
  <RouterView v-else v-slot="{ Component }">
    <transition name="mot-route-desk" mode="out-in">
      <component :is="Component" />
    </transition>
  </RouterView>

  <!-- 桌面看板 Toast（手机壳分支已在壳内渲染，互斥只挂一份） -->
  <ToastHost v-if="!usePhoneFrame" />
</template>
