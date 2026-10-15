<script setup lang="ts">
/**
 * 底部主导航（角色感知）。
 *
 *  - 业代 rep ：今日巡店 / 巡店记录 / 消息 / 我的
 *  - 店主 owner：自助诊断 / 补货模拟 / 我的订单 / 消息
 *  - 经理 manager：桌面看板形态，不渲染 TabBar（由调用方不挂载，本组件亦兜底返回空）
 *
 * 「消息」Tab 带未读角标：进入时拉一次汇总，并订阅实时推送 `message:new` /
 * `announcement:new` 增量 +1（后端不可用时静默降级，不显示角标、不报错）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { useSessionStore } from '@/stores/session'
import { getUnreadSummary } from '@/api/messages'
import { onRealtime } from '@/realtime/client'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

interface TabItem {
  key: string
  label: string
  icon: string
  path: string
}

/** 业代主导航 */
const REP_TABS: TabItem[] = [
  { key: 'today', label: '今日巡店', icon: 'home', path: '/rep/today' },
  { key: 'history', label: '巡店记录', icon: 'history', path: '/rep/history' },
  { key: 'messages', label: '消息', icon: 'message', path: '/messages' },
  { key: 'me', label: '我的', icon: 'user', path: '/rep/me' },
]

/** 店主主导航 */
const OWNER_TABS: TabItem[] = [
  { key: 'owner', label: '自助诊断', icon: 'camera', path: '/owner' },
  { key: 'restock', label: '补货模拟', icon: 'package', path: '/owner/restock' },
  { key: 'orders', label: '我的订单', icon: 'cart', path: '/owner/orders' },
  { key: 'messages', label: '消息', icon: 'message', path: '/messages' },
]

/** 当前角色的 Tab 集合 */
const tabs = computed<TabItem[]>(() => (session.role === 'owner' ? OWNER_TABS : REP_TABS))

/** 当前激活 key：按路径前缀匹配（消息中心为全角色共用路径 /messages） */
const active = computed<string>(() => {
  const p = route.path
  if (p.startsWith('/messages')) return 'messages'
  if (p.startsWith('/owner/restock')) return 'restock'
  if (p.startsWith('/owner/orders')) return 'orders'
  if (p.startsWith('/owner')) return 'owner'
  if (p.startsWith('/rep/history')) return 'history'
  if (p.startsWith('/rep/me')) return 'me'
  if (p.startsWith('/rep')) return 'today'
  return ''
})

/** 消息未读总数（角标） */
const unread = ref(0)

/** 拉一次未读汇总（失败静默：后端未连接时不显示角标） */
async function refreshUnread(): Promise<void> {
  try {
    const res = await getUnreadSummary()
    unread.value = res.total
  } catch {
    unread.value = 0
  }
}

let offMsg: (() => void) | null = null
let offAnn: (() => void) | null = null

onMounted(() => {
  void refreshUnread()
  // 实时增量：收到新消息 / 新公告即 +1（当前正停在消息页时由页面标记已读后归零）
  offMsg = onRealtime('message:new', () => {
    if (!route.path.startsWith('/messages')) unread.value += 1
  })
  offAnn = onRealtime('announcement:new', () => {
    if (!route.path.startsWith('/messages')) unread.value += 1
  })
})

onBeforeUnmount(() => {
  offMsg?.()
  offAnn?.()
})

/** 跳转 */
function go(tab: TabItem): void {
  if (route.path === tab.path) return
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
      <span class="tabbar__icon">
        <AppIcon :name="t.icon" :size="21" />
        <span v-if="t.key === 'messages' && unread > 0" class="tabbar__badge">
          {{ unread > 99 ? '99+' : unread }}
        </span>
      </span>
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
  background: var(--bg-card, #fff);
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

/* 图标外层：承载未读角标的定位上下文 */
.tabbar__icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tabbar__badge {
  position: absolute;
  top: -5px;
  left: 50%;
  margin-left: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--red, #e5484d);
  color: #fff;
  font-size: 9.5px;
  font-weight: 700;
  line-height: 1;
}

/* 真机全屏（≤480px = 真机退化线，--bp-sm:640px 内子集）：
   图标与字号随视口宽度小幅弹性，320px 窄屏不挤；clamp 上下限保证
   390 以上视觉不变，桌面机壳（>480px）整条规则不触发。 */
@media (max-width: 480px) {
  .tabbar__item {
    gap: 1px;
    font-size: clamp(10px, 3.2vw, 11px);
  }

  /* 文字不换行、行高收紧：320px 下 4 个标签仍可一行等宽排列；
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
