<script setup lang="ts">
/**
 * AdminShell —— 管理端统一桌面外壳（W4）。
 *
 * 结构：左侧固定深色侧栏（品牌 + 导航组 + 返回看板）｜右侧顶栏（页标题 + 操作插槽
 * + 主题切换）｜内容槽。被下方全部 /admin 页面 import 复用，页面只需传 `title`
 * 与 `#actions` 插槽，其余布局与导航统一在此维护。
 *
 * 响应式：视口 < 1024px 时侧栏收成 68px 图标条，保证内容不被挤压。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import ThemeToggle from '@/components/common/ThemeToggle.vue'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'

interface Props {
  /** 顶栏页面标题 */
  title: string
  /** 顶栏副标题（可选，默认给一句管理端定位说明） */
  subtitle?: string
}

const props = withDefaults(defineProps<Props>(), {
  subtitle: '蒙牛 AI 巡店助手 · 总部运营控制台',
})

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const toast = useToast()

/**
 * 「返回经营看板」仅对经理有意义：演示期经理 wangmin 可兼任管理端职能；
 * 独立 admin 账号无权访问 /manager/**（路由守卫会弹回），故对 admin 隐藏。
 */
const isManager = computed<boolean>(() => session.role === 'manager')

/** 退出登录 → 回登录页（管理员端此前缺少退出入口，admin 账号无法切换身份） */
function logout(): void {
  session.logout()
  toast.info('已退出登录')
  void router.push('/login')
}

interface NavItem {
  path: string
  label: string
  icon: string
  /** 仅 /admin 需要精确匹配，避免误高亮所有子页 */
  exact?: boolean
}

const NAV_MAIN: NavItem[] = [
  { path: '/admin', label: '运营总览', icon: 'home', exact: true },
  { path: '/admin/accounts', label: '账号派发', icon: 'user' },
  { path: '/admin/blacklist', label: '黑名单管理', icon: 'shield' },
  { path: '/admin/knowledge', label: 'FAQ 知识库', icon: 'layers' },
  { path: '/admin/announcements', label: '公告发布', icon: 'bell' },
  { path: '/admin/audit', label: '审计日志', icon: 'clipboard' },
  { path: '/admin/messages', label: '消息中心', icon: 'message' },
]

/** 当前路由是否命中导航项：/admin 精确，其余前缀匹配 */
function isActive(item: NavItem): boolean {
  if (item.exact) return route.path === item.path
  return route.path === item.path || route.path.startsWith(`${item.path}/`)
}

const operatorName = computed<string>(() => session.user?.name || '未登录')
const operatorRole = computed<string>(() => session.roleLabel || '—')
</script>

<template>
  <div class="as">
    <!-- ══ 左侧深色侧栏 ══ -->
    <aside class="as__side" aria-label="管理端导航">
      <div class="as__brand">
        <span class="as__logo">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3C12 3 6 10.5 6 15.5a6 6 0 0 0 12 0C18 10.5 12 3 12 3z" fill="#fff" opacity="0.95" />
          </svg>
        </span>
        <span class="as__brand-text">
          <b>店小C</b>
          <small>运营控制台</small>
        </span>
      </div>

      <nav class="as__nav u-scroll-y">
        <router-link
          v-for="item in NAV_MAIN"
          :key="item.path"
          :to="item.path"
          class="as__item u-tap"
          :class="{ 'is-active': isActive(item) }"
          :title="item.label"
        >
          <AppIcon :name="item.icon" :size="18" />
          <span class="as__label">{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="as__foot">
        <router-link
          v-if="isManager"
          to="/manager/dashboard"
          class="as__item as__item--back u-tap"
          title="返回经营看板"
        >
          <AppIcon name="store" :size="18" />
          <span class="as__label">返回经营看板</span>
        </router-link>
        <button type="button" class="as__item as__item--logout u-tap" title="退出登录" @click="logout">
          <AppIcon name="close" :size="18" />
          <span class="as__label">退出登录</span>
        </button>
      </div>
    </aside>

    <!-- ══ 右侧主区 ══ -->
    <div class="as__main">
      <header class="as__top">
        <div class="as__heading">
          <h1 class="as__title">{{ props.title }}</h1>
          <p class="as__sub">{{ props.subtitle }}</p>
        </div>
        <div class="as__top-right">
          <div class="as__slots">
            <slot name="actions" />
          </div>
          <div class="as__operator" :title="`${operatorRole} · ${operatorName}`">
            <AppIcon name="user" :size="15" />
            <span>{{ operatorRole }} · {{ operatorName }}</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main class="as__content u-scroll-y">
        <div class="as__inner">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.as {
  display: flex;
  height: 100vh;
  background: var(--bg-page);
  color: var(--text-1);
}

/* ── 侧栏（深绿渐变，固定 224px） ── */
.as__side {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 224px;
  background: var(--grad-brand-deep);
  color: #fff;
  overflow: hidden;
}

.as__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 18px 16px;
}

.as__logo {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.16);
}

.as__brand-text b {
  display: block;
  font-size: 17px;
  font-weight: 900;
  letter-spacing: 1px;
  line-height: 1.2;
}

.as__brand-text small {
  display: block;
  margin-top: 2px;
  font-size: 10.5px;
  letter-spacing: 1.5px;
  opacity: 0.78;
}

.as__nav {
  flex: 1;
  min-height: 0;
  padding: 6px 10px;
}

.as__item {
  display: flex;
  align-items: center;
  gap: 11px;
  height: 42px;
  margin-bottom: 4px;
  padding: 0 12px;
  border-radius: 11px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 13.5px;
  font-weight: 600;
  text-decoration: none;
  transition: background var(--dur-fast) ease, color var(--dur-fast) ease;
}

.as__item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.as__item.is-active {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
}

.as__item:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.75);
  outline-offset: 2px;
}

.as__label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.as__foot {
  flex: none;
  padding: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.14);
}

.as__item--back {
  background: rgba(255, 255, 255, 0.08);
}

/* 退出按钮：重置 button 默认样式，与侧栏链接视觉一致 */
button.as__item {
  width: calc(100% - 20px);
  margin-left: 0;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.as__item--logout {
  color: rgba(255, 255, 255, 0.72);
}

.as__item--logout:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* ── 主区 ── */
.as__main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}

.as__top {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 28px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
}

.as__title {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 0.3px;
}

.as__sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-3);
}

.as__top-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.as__slots {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.as__operator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--bg-page);
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
}

.as__content {
  flex: 1;
  min-height: 0;
}

/* 内容栅格：1440 基准居中，最大 1360，窄屏自适应 */
.as__inner {
  max-width: 1360px;
  margin: 0 auto;
  padding: 22px 28px 32px;
}

/* ── 响应式：< 1024px 侧栏收成图标条 ── */
@media (max-width: 1024px) {
  .as__side {
    width: 68px;
  }

  .as__brand {
    justify-content: center;
    padding: 16px 0 12px;
  }

  .as__brand-text {
    display: none;
  }

  .as__item {
    justify-content: center;
    padding: 0;
  }

  .as__label {
    display: none;
  }

  .as__inner {
    padding: 18px 18px 26px;
  }

  .as__operator span {
    display: none;
  }

  .as__operator {
    padding: 0 9px;
  }
}

@media (max-width: 720px) {
  .as__top {
    padding: 12px 16px;
  }

  .as__sub {
    display: none;
  }
}
</style>
