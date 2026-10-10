<script setup lang="ts">
/**
 * 底部 4 项 Tab（今日巡店 / 拍照诊断 / 巡店记录 / 我的）。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'

const route = useRoute()
const router = useRouter()

interface TabItem {
  key: string
  label: string
  icon: string
  path: string
}

const tabs: TabItem[] = [
  { key: 'today', label: '今日巡店', icon: 'home', path: '/rep/today' },
  { key: 'capture', label: '拍照诊断', icon: 'camera', path: '/rep/capture/S3' },
  { key: 'history', label: '巡店记录', icon: 'history', path: '/rep/history' },
  { key: 'me', label: '我的', icon: 'user', path: '/rep/me' },
]

/** 当前激活 key */
const active = computed<string>(() => {
  const p = route.path
  if (p.startsWith('/rep/capture')) return 'capture'
  if (p.startsWith('/rep/history')) return 'history'
  if (p.startsWith('/rep/me')) return 'me'
  if (p.startsWith('/rep')) return 'today'
  return ''
})

/** 跳转 */
function go(tab: TabItem): void {
  router.push(tab.path)
}
</script>

<template>
  <nav class="tabbar">
    <button
      v-for="t in tabs"
      :key="t.key"
      class="tabbar__item"
      :class="{ 'tabbar__item--on': active === t.key }"
      @click="go(t)"
    >
      <AppIcon :name="t.icon" :size="21" />
      <span>{{ t.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.tabbar {
  display: flex;
  flex: none;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: #fff;
  border-top: 1px solid var(--border-color);
}

.tabbar__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 7px 0 6px;
  border: none;
  background: none;
  color: var(--text-3);
  font-size: 11px;
}

.tabbar__item--on {
  color: var(--mn-green);
  font-weight: 700;
}
</style>
