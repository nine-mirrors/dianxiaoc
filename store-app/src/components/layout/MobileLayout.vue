<script setup lang="ts">
/**
 * 页面外壳：**同一个外壳，两种设备形态**。
 *
 *  - 真机 / 窄窗（isMobile）：顶栏 + 内容区 + 底部 TabBar（原移动端形态，完全不变）；
 *  - PC（!isMobile）：左侧导航栏 + 顶栏 + 宽内容区（桌面形态，不套手机壳）。
 *
 * ★ 形态只由「设备」决定，不由「角色」决定 —— 业代 / 店主 / 经理 / 管理员
 *   在 PC 上都拿到桌面形态，在手机上都拿到移动形态（经理手机端由路由守卫
 *   分流到移动门户 /m，不经过本组件）。
 *
 * 顶栏通过 #nav / #header 插槽自定义，内容区可滚动；两种形态共用同一套插槽，
 * 页面无需为桌面形态改一行代码。
 */
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import TabBar from './TabBar.vue'
import { useDeviceType } from '@/composables/useDeviceType'
import { useSessionStore } from '@/stores/session'

/** 后端是否不可用（由 api 层广播 api:offline） */
const degraded = ref<boolean>(false)
function markDegraded(): void {
  degraded.value = true
}
onMounted(() => window.addEventListener('api:offline', markDegraded))
onBeforeUnmount(() => window.removeEventListener('api:offline', markDegraded))

interface Props {
  title?: string
  /** 是否显示返回键 */
  back?: boolean
  /** 顶栏是否用品牌绿渐变（P2 首页用） */
  gradient?: boolean
  /** 是否显示底部 Tab */
  showTabBar?: boolean
  /** 内容区是否需要底部内边距（避开悬浮按钮） */
  contentPaddingBottom?: number
}
withDefaults(defineProps<Props>(), {
  title: '',
  back: false,
  gradient: false,
  showTabBar: false,
  contentPaddingBottom: 12,
})

const emit = defineEmits<{ (e: 'back'): void }>()

/** 设备形态（只看设备，不看角色）：PC = 桌面外壳，真机/窄窗 = 移动外壳 */
const { isMobile } = useDeviceType()
const isDesk = computed<boolean>(() => !isMobile.value)
const session = useSessionStore()
</script>

<template>
  <!-- ══════════ 形态一：PC 桌面外壳（左侧导航 + 宽内容区） ══════════ -->
  <div v-if="isDesk" class="desk-layout">
    <!-- 侧边导航：品牌 + 角色主导航（复用 TabBar 的 side 形态） -->
    <aside class="dl-side">
      <div class="dl-brand">
        <span class="dl-brand__logo">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3C12 3 6 10.5 6 15.5a6 6 0 0 0 12 0C18 10.5 12 3 12 3z" fill="#fff" />
          </svg>
        </span>
        <span class="dl-brand__name">
          <b>店小C</b>
          <small>MENGNIU AI</small>
        </span>
      </div>

      <TabBar v-if="showTabBar" variant="side" />

      <div class="dl-side__foot">
        <span class="dl-user__avatar">{{ session.avatarText }}</span>
        <span class="dl-user__name">{{ session.user?.name ?? '未登录' }}</span>
      </div>
    </aside>

    <!-- 主区：顶栏 + 内容 + 吸底操作栏（两种形态共用同一套插槽） -->
    <div class="dl-main">
      <header class="dl-head" :class="{ 'dl-head--gradient': gradient }">
        <!-- 页面自绘顶栏优先（如 P2 首页的问候/天气/头像），否则用通用「返回 + 标题」 -->
        <slot name="nav">
          <button v-if="back" type="button" class="dl-head__back u-tap" @click="emit('back')">
            ‹ 返回
          </button>
          <h1 v-if="title" class="dl-head__title">{{ title }}</h1>
          <div class="dl-head__right">
            <slot name="right" />
          </div>
        </slot>
      </header>

      <div v-if="degraded" class="ml-degraded">⚠ 网络开小差了，当前显示上次刷新的数据，恢复后会自动同步</div>

      <main class="dl-body u-scroll-y" :style="{ paddingBottom: `${contentPaddingBottom}px` }">
        <slot />
      </main>

      <footer v-if="$slots.footer" class="dl-foot">
        <slot name="footer" />
      </footer>
    </div>
  </div>

  <!-- ══════════ 形态二：真机 / 窄窗移动外壳（原形态，未做任何改动） ══════════ -->
  <div v-else class="mobile-layout">
    <!-- 顶栏 -->
    <header class="ml-head" :class="{ 'ml-head--gradient': gradient }">
      <slot name="nav">
        <button
          v-if="back"
          type="button"
          class="ml-head__back u-tap"
          aria-label="返回"
          @click="emit('back')"
        >
          ‹
        </button>
        <h1 v-if="title" class="ml-head__title">{{ title }}</h1>
        <div class="ml-head__right">
          <slot name="right" />
        </div>
      </slot>
    </header>

    <!-- 后端降级提示条 -->
    <div v-if="degraded" class="ml-degraded">⚠ 网络开小差了，当前显示上次刷新的数据，恢复后会自动同步</div>

    <!-- 内容 -->
    <main class="ml-body u-scroll-y" :style="{ paddingBottom: `${contentPaddingBottom}px` }">
      <slot />
    </main>

    <!-- 底部 Tab -->
    <TabBar v-if="showTabBar" />

    <!-- footer 插槽宿主：页面自带的吸底/悬浮 CTA 栏渲染于此。
         宿主本身不加安全区内边距（页面栏位已使用 .u-safe-bottom
         或 var(--u-safe-bottom) 自行处理），避免底距被叠加两次。 -->
    <footer v-if="$slots.footer" class="ml-foot">
      <slot name="footer" />
    </footer>
  </div>
</template>


<style scoped>
.mobile-layout {
  display: flex;
  flex-direction: column;
  /* 高度只依赖父盒：父链最终取 100dvh（移动形态为全屏 App、桌面形态为外壳内容区），
     不硬编码 844，矮屏/横屏自然适应 */
  height: 100%;
  background: var(--bg-page);
}

.ml-head {
  display: flex;
  align-items: center;
  gap: 8px;
  /* 头部高度固定基线（flex:none 不参与压缩），顶部安全区让内容避开
     刘海/灵动岛；头部背景延伸到屏幕边缘，env 内边距只推内容不推底色。
     左右 env 为横屏侧边刘海预留：竖屏/桌面机壳 env=0，视觉不变。 */
  min-height: 52px;
  padding: 8px max(14px, env(safe-area-inset-right, 0px)) 8px max(14px, env(safe-area-inset-left, 0px));
  padding-top: max(14px, env(safe-area-inset-top, 0px));
  /* 令牌化：PC 手机壳内恒为日间白卡；真机全屏跟随日夜主题（夜间为墨绿卡） */
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  flex: none;
}

.ml-head--gradient {
  /* 起点由 --mn-green(#009639) 换成 AA 加深绿 #007a30（白字 ≈5.5:1）；
     终点仍是 --mn-green-dark(#00662a)，渐变全程对比度均 ≥ AA */
  background: linear-gradient(135deg, #007a30 0%, var(--mn-green-dark) 100%);
  border-bottom: none;
  color: #fff;
}

/* 视觉盒子保持 26px（标题居中位置不受影响）；
   触控热区由模板上的全局 .u-tap 伪元素外扩到 ≥44px（--touch-target-min），
   父级 .ml-head 无 overflow:hidden，热区不会被裁切。 */
.ml-head__back {
  flex: none;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font-size: 26px;
  line-height: 1;
}

.ml-head__title {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
}

.ml-head__right {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ml-degraded {
  flex: none;
  padding: 6px 14px;
  background: var(--warning-bg);
  color: var(--warning-fg);
  font-size: 12px;
  text-align: center;
  border-bottom: 1px solid var(--border-color);
}

.ml-body {
  /* 内容滚动区：flex 撑满头部与底部栏之间的剩余高度（min-height:0 允许收缩），
     高度由 flex 计算而非固定 844；真机全屏下父链为 100dvh。 */
  flex: 1;
  min-height: 0;
  /* 横向溢出兜底：任何卡片/表格都不允许顶出横向滚动（overflow-y 仍由
     .u-scroll-y 接管为 auto）；position:fixed 的地图全屏以 .phone 为
     包含块，不受本容器裁切。 */
  overflow-x: hidden;
  /* 长英文单词 / 数字串（订单号、URL 等）可断行，不撑破卡片 */
  overflow-wrap: break-word;
  word-break: break-word;
  /* 横屏侧边刘海：竖屏与桌面机壳 env=0，视觉零变化 */
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
}

/* footer 插槽宿主：不自带内边距与定位，吸底栏的定位上下文仍是页面级
   定位祖先（与改造前一致）；安全区底距统一用全局 .u-safe-bottom /
   var(--u-safe-bottom)，由页面栏位按需取用，避免宿主与页面双重留白。 */
.ml-foot {
  flex: none;
}

/* 横屏矮高度（≤480px 高且 landscape，如手机横屏 844×390 / 超宽矮窗口）：
   压缩头部，把垂直空间让给内容与主操作；桌面常规高度窗口不触发。 */
@media (max-height: 480px) and (orientation: landscape) {
  .ml-head {
    min-height: 40px;
    padding-top: max(8px, env(safe-area-inset-top, 0px));
    padding-bottom: 4px;
  }
}

/* 超小屏（≤360px，真机退化线 480px 内的子集）：头部间距/字号收敛一档，
   390 设计稿（>360px）不受任何影响。 */
@media (max-width: 360px) {
  .ml-head {
    padding-left: max(12px, env(safe-area-inset-left, 0px));
    padding-right: max(12px, env(safe-area-inset-right, 0px));
  }

  .ml-head__title {
    font-size: 15px;
  }
}

/* ══════════════════════════════════════════════════════════════════
 * PC 桌面外壳（形态一）——形态判定只看设备，不看角色：
 * 业代 / 店主 / 经理 / 管理员在 PC 上都是这一套；真机/窄窗走上面的移动外壳。
 *
 * 结构：左侧固定导航栏 + 右侧「顶栏 / 内容 / 吸底操作栏」纵向主区。
 * 下方 .mobile-layout 的规则全部保留，两个形态互不影响。
 * ══════════════════════════════════════════════════════════════════ */
.desk-layout {
  display: flex;
  /* 与移动外壳同口径：高度只依赖视口，不硬编码像素值，
     笔记本矮屏 / 高分屏自然适应；内部各区块自管滚动 */
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--bg-page);
  color: var(--text-1);
}

/* ── 左侧导航栏 ── */
.dl-side {
  flex: none;
  width: 232px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 14px 14px;
  box-sizing: border-box;
  overflow-y: auto;
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
}

.dl-brand {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 2px 8px 12px;
}

.dl-brand__logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: var(--mn-green, #009639);
  flex: none;
}

.dl-brand__name b {
  display: block;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 1px;
  line-height: 1.2;
}

.dl-brand__name small {
  display: block;
  margin-top: 1px;
  color: var(--text-3);
  font-size: 8px;
  letter-spacing: 2.4px;
}

/* 侧栏底部：当前登录人（与移动端「我的」页头信息同源） */
.dl-side__foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 8px 4px;
  border-top: 1px solid var(--border-color);
}

.dl-user__avatar {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--mn-green, #009639);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.dl-user__name {
  font-size: 13px;
  font-weight: 600;
}

/* ── 主区 ── */
.dl-main {
  /* 定位上下文：页面自带的吸底 CTA 栏（position:absolute）以此为准，
     不会跑到左侧导航栏上方去 */
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.dl-head {
  flex: none;
  width: 100%;
  max-width: var(--dl-max, 1240px);
  margin-inline: auto;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 12px 28px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
}

/* 品牌绿渐变顶栏（P2 首页等自绘白色顶栏的页面用，否则白字会落在白底上不可见） */
.dl-head--gradient {
  background: linear-gradient(135deg, #007a30 0%, var(--mn-green-dark) 100%);
  border-bottom: none;
  color: #fff;
}

.dl-head__back {
  flex: none;
  padding: 6px 12px 6px 8px;
  border: none;
  border-radius: 8px;
  background: none;
  color: inherit;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
}

.dl-head__back:hover {
  background: rgba(0, 0, 0, 0.06);
}

.dl-head__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 17px;
  font-weight: 700;
}

.dl-head__right {
  flex: none;
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.dl-body {
  /* flex 撑满顶栏与吸底栏之间的剩余高度（min-height:0 允许收缩），
     页面内 height:100% 的根元素仍能拿到确定高度，与移动形态语义一致 */
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: var(--dl-max, 1240px);
  margin-inline: auto;
  box-sizing: border-box;
  padding: 20px 28px;
  /* 与移动外壳同口径的溢出兜底：横向不出现滚动条，长串可断行 */
  overflow-x: hidden;
  overflow-wrap: break-word;
  word-break: break-word;
}

.dl-foot {
  flex: none;
  width: 100%;
  max-width: var(--dl-max, 1240px);
  margin-inline: auto;
}

/* 桌面内容区纵向节奏放宽一档：大面积留白比移动端更舒展（不改页面自身样式） */
@media (min-width: 1025px) {
  .dl-body {
    padding: 24px 32px;
  }

  .dl-head {
    padding-inline: 32px;
  }
}
</style>
