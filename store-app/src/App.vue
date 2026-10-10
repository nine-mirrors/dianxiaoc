<script setup lang="ts">
/**
 * 根组件。
 *
 * 职责（ARCHITECTURE §8.8）：
 *  - 业代端 / 店员端：包一层桌面端手机壳（390×844），录屏更专业；
 *  - 经理看板（/manager/**）：桌面 1440 宽屏，不套壳；
 *  - 全站常驻 Toast 容器。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PhoneFrame from '@/components/common/PhoneFrame.vue'
import ToastHost from '@/components/common/ToastHost.vue'

const route = useRoute()

/** 经理看板走桌面宽屏形态，其余页面内嵌手机壳 */
const usePhoneFrame = computed<boolean>(() => !route.path.startsWith('/manager'))
</script>

<template>
  <PhoneFrame v-if="usePhoneFrame">
    <RouterView />
  </PhoneFrame>
  <RouterView v-else />

  <!-- 全站 Toast（任何接口失败都走友好文案，绝不弹原生报错） -->
  <ToastHost />
</template>
