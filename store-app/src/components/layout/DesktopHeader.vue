<script setup lang="ts">
/**
 * 桌面看板顶栏（P5 用，1440 宽屏形态）。
 * 包含 Logo / 产品名 / 区域下拉 / 角色切换；数据由外部 props 注入，不直接调接口。
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import ThemeToggle from '@/components/common/ThemeToggle.vue'
import DemoModeToggle from '@/components/common/DemoModeToggle.vue'
import { useSessionStore } from '@/stores/session'

interface Props {
  regionIds: { id: string; name: string }[]
  regionId: string
  userName: string
  roleLabel: string
}
const props = withDefaults(defineProps<Props>(), {
  regionIds: () => [],
  regionId: '',
  userName: '',
  roleLabel: '',
})

const emit = defineEmits<{ (e: 'change-region', id: string): void; (e: 'switch-role'): void }>()

/**
 * 经理端桌面导航（W3 新增）——本头部是全部 /manager/** 页面共用的桌面外壳，
 * 在此统一挂导航项，各页面只需正常挂本组件即自带导航。
 */
const route = useRoute()
const NAV: { to: string; label: string; icon: string }[] = [
  { to: '/manager/dashboard', label: '经营看板', icon: 'home' },
  { to: '/manager/ask', label: 'AI 问答', icon: 'sparkles' },
  { to: '/manager/store/S1', label: '门店体检', icon: 'store' },
  { to: '/manager/report', label: 'AI 周报', icon: 'clipboard' },
  { to: '/manager/leaderboard', label: '排行榜', icon: 'layers' },
  { to: '/manager/value', label: '价值看板', icon: 'zap' },
  { to: '/manager/regions', label: '区域对比', icon: 'bar-chart' },
  { to: '/manager/blacklist', label: '黑名单', icon: 'shield' },
  { to: '/manager/screen', label: '投屏', icon: 'compare' },
  { to: '/manager/messages', label: '消息中心', icon: 'message' },
]

/** 命中的导航项（门店体检是动态路径，用前缀匹配） */
function isActive(to: string): boolean {
  if (to.startsWith('/manager/store')) return route.path.startsWith('/manager/store')
  return route.path === to
}

/**
 * 后端不可用提示（测评报告发现：桌面端没有断网提示，经理看板会整页空白）。
 * 与移动端 MobileLayout 监听同一个 `api:offline` 事件，保证两端一致。
 */
const session = useSessionStore()
/**
 * 断网提示同时由两路驱动：
 *  1. `api:offline` 事件（运行期请求失败）
 *  2. `session.offlineNotice` 状态（首屏 restore 阶段就失败，事件早于组件挂载）
 */
const offline = ref<boolean>(session.offlineNotice)
watch(() => session.offlineNotice, (v) => {
  offline.value = v
})
function markOffline(): void {
  offline.value = true
}
function markOnline(): void {
  offline.value = false
}
onMounted(() => {
  window.addEventListener('api:offline', markOffline)
  window.addEventListener('api:online', markOnline)
})
onBeforeUnmount(() => {
  window.removeEventListener('api:offline', markOffline)
  window.removeEventListener('api:online', markOnline)
})
</script>

<template>
  <header class="desk-header">
    <!-- 后端未连接提示：避免看板整页空白却毫无说明 -->
    <p v-if="offline" class="desk-header__offline">
      <AppIcon name="warning" :size="13" color="var(--warning-fg)" />
      服务暂不可用 · 页面数据暂时无法更新，请稍后重试
    </p>
    <div class="desk-header__top">
      <div class="desk-header__brand">
        <span class="desk-header__logo"><AppIcon name="milk" :size="20" color="#fff" /></span>
        <div>
          <p class="desk-header__title">一眼千店 · 区域经营看板</p>
          <p class="desk-header__sub">店小C · 蒙牛 AI 巡店助手</p>
        </div>
      </div>

      <div class="desk-header__right">
        <!-- 日 / 夜主题开关：经理端宽屏外壳此前没有入口，补在右上角 -->
        <ThemeToggle class="desk-header__theme" />
        <!-- 演示模式开关：经理端宽屏外壳入口（一键演示），只追加 -->
        <DemoModeToggle class="desk-header__demo" variant="header" tone="on-dark" />
        <label v-if="props.regionIds.length" class="desk-header__region">
          区域：
          <select class="mot-tap" :value="props.regionId" @change="emit('change-region', ($event.target as HTMLSelectElement).value)">
            <option v-for="r in props.regionIds" :key="r.id" :value="r.id">{{ r.name }}</option>
          </select>
        </label>
        <button class="desk-header__role mot-tap" @click="emit('switch-role')">
          <!-- 当前登录用户头像：品牌渐变底 → glass 变体；尺寸≈原 user 图标，换人不改版式 -->
          <UserAvatar
            :url="session.avatarUrl"
            :name="session.user?.name"
            :text="session.avatarText"
            :size="20"
            variant="glass"
          />
          <span>{{ props.roleLabel }} · {{ props.userName }}</span>
          <AppIcon name="refresh" :size="13" />
        </button>
      </div>
    </div>

    <!-- 经理端导航：全部 /manager/** 页面共用 -->
    <nav class="desk-header__nav" aria-label="经理端导航">
      <RouterLink
        v-for="n in NAV"
        :key="n.to"
        :to="n.to"
        class="desk-header__nav-item mot-tap"
        :class="{ 'is-active': isActive(n.to) }"
      >
        <AppIcon :name="n.icon" :size="15" />
        <span>{{ n.label }}</span>
      </RouterLink>
    </nav>
  </header>
</template>

<style scoped>
.desk-header {
  /* 定位上下文：断网提示条要挂在 header 下沿 */
  position: relative;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, var(--mn-green) 0%, var(--mn-green-dark) 100%);
  color: #fff;
}

/* 品牌 + 区域 / 角色 行（原 60px 单行头部改为列布局中的第一行） */
.desk-header__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 60px;
  padding: 0 24px;
}

/* ── 经理端导航行 ── */
.desk-header__nav {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  padding: 0 18px 8px;
}

.desk-header__nav-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12.5px;
  font-weight: 600;
  transition: background var(--dur-fast) ease, color var(--dur-fast) ease;
}

.desk-header__nav-item:hover {
  background: rgba(255, 255, 255, 0.24);
  color: #fff;
}

.desk-header__nav-item.is-active {
  background: var(--bg-card);
  color: var(--mn-green-dark);
}

.desk-header__nav-item:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

/* ── 交互反馈（仅追加动效）─────────────────────────────────
   导航项 / 区域下拉 / 角色按钮挂 .mot-tap 后，保留既有背景/文字过渡，
   并把按下 scale 的 transform 过渡一并纳入（避免被组件样式覆盖而按压生硬）。 */
.desk-header__nav-item.mot-tap {
  transition:
    background var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard),
    transform var(--dur-instant) var(--ease-standard);
}

/* 区域下拉：切换时的轻量过渡（背景 / 描边 / 文字） */
.desk-header__region select {
  transition:
    background var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard);
}

/* 角色按钮文字：切换角色时给被切换文本一个轻量过渡 */
.desk-header__role span {
  transition:
    color var(--dur-fast) var(--ease-standard),
    opacity var(--dur-fast) var(--ease-standard);
}

.desk-header__offline {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
  padding: 7px 14px;
  /* 断网提示走警示语义令牌对：日间浅橙底深橙字，夜间自动提亮 */
  background: var(--warning-bg);
  border-bottom: 1px solid var(--color-warning);
  color: var(--warning-fg);
  font-size: 12px;
  font-weight: 600;
}

.desk-header__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.desk-header__logo {
  font-size: 24px;
}

.desk-header__title {
  font-size: 17px;
  font-weight: 700;
}

.desk-header__sub {
  font-size: 12px;
  opacity: 0.75;
}

.desk-header__right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.desk-header__demo {
  flex: none;
}

.desk-header__region select {
  padding: 5px 8px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 13px;
}

.desk-header__region select option {
  color: var(--text-1);
}

.desk-header__role {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 13px;
}

/* ── 窄窗口兜底（<900px，--bp-md:1024px 内的更窄子集） ──
 * 仅保证品牌区 / 区域选择 / 角色按钮不互相压叠：允许折行并收紧间距。
 * 看板主体的完整响应式由其他任务负责；≥1024px（含 1440 设计视口）
 * 本规则不触发，桌面视觉零回归。 */
@media (max-width: 900px) {
  .desk-header__top {
    flex-wrap: wrap;
    align-items: center;
    height: auto;
    min-height: 60px;
    padding: 8px 16px;
    row-gap: 6px;
  }

  .desk-header__brand {
    min-width: 0;
    gap: 8px;
  }

  .desk-header__title {
    font-size: 15px;
    white-space: nowrap;
  }

  .desk-header__right {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    margin-left: auto;
  }
}

/* 极窄窗口（≤560px，真机退化线 480px 附近）：隐藏纯装饰副标题，
   功能信息（标题、区域、角色按钮文字）全部保留，只收紧不删减。 */
@media (max-width: 560px) {
  .desk-header__top {
    padding: 8px 12px;
  }

  .desk-header__nav {
    padding: 0 12px 8px;
  }

  .desk-header__sub {
    display: none;
  }

  .desk-header__region select,
  .desk-header__role {
    font-size: 12px;
  }

  .desk-header__role {
    padding: 5px 10px;
  }
}
</style>
