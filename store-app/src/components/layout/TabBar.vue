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
  <nav class="tabbar" aria-label="主导航">
    <button
      v-for="t in tabs"
      :key="t.key"
      class="tabbar__item"
      :class="{ 'tabbar__item--on': active === t.key }"
      :aria-current="active === t.key ? 'page' : undefined"
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
  /* 底部安全区（全面屏手势条）与左右安全区（横屏侧边刘海）直接吃在导航栏
     自身上：白色背景与上边框随 padding 一起延伸进安全区，不会留白边。
     桌面机壳 / 非全面屏 env=0，与原视觉完全一致。 */
  padding: 0 env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px)
    env(safe-area-inset-left, 0px);
  background: #fff;
  border-top: 1px solid var(--border-color);
}

.tabbar__item {
  flex: 1;
  /* min-width:0 允许在超窄屏内收缩，不把相邻项挤出换行 */
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
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

/* 真机全屏（≤480px = 真机退化线，--bp-sm:640px 内子集）：
   图标与字号随视口宽度小幅弹性，320px 窄屏不挤；clamp 上下限保证
   390 以上视觉不变，桌面机壳（>480px）整条规则不触发。 */
@media (max-width: 480px) {
  .tabbar__item {
    gap: 1px;
    font-size: clamp(10px, 3.2vw, 11px);
  }

  /* 文字不换行、行高收紧：320px 下 4 个 4 字标签仍可一行等宽排列；
     仅真机分支生效，桌面机壳内栏高与原设计一致 */
  .tabbar__item span {
    white-space: nowrap;
    line-height: 1.2;
  }

  /* AppIcon 的 svg 是本组件的子根节点，携带本组件作用域属性，可直接命中；
     宽高等比缩放，避免只缩文字不缩图标导致的视觉失衡 */
  .tabbar__item .app-icon {
    width: clamp(19px, 6.4vw, 21px);
    height: clamp(19px, 6.4vw, 21px);
  }
}

/* 超小屏（≤360px）再收半档间距，触控热区仍约 ≥40px 高 */
@media (max-width: 360px) {
  .tabbar__item {
    padding-top: 6px;
    padding-bottom: 5px;
  }
}

/* 横屏矮高度（≤480px 高且 landscape）：压缩上下内边距，保证内容区与
   TabBar 在矮视口内同时可见、主操作不被挤出屏幕 */
@media (max-height: 480px) and (orientation: landscape) {
  .tabbar__item {
    padding-top: 4px;
    padding-bottom: 3px;
  }
}
</style>
