<script setup lang="ts">
/**
 * 手机端页面外壳：顶栏 + 内容区 + 底部 TabBar。
 *
 * 顶栏通过 #nav / #header 插槽自定义，内容区可滚动。
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import TabBar from './TabBar.vue'

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
</script>

<template>
  <div class="mobile-layout">
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
    <div v-if="degraded" class="ml-degraded">⚠ 后端未连接 · 请确认服务已启动</div>

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
  /* 高度只依赖父盒：桌面机壳内为 844 设计高度，真机全屏下父链最终取
     100dvh（见 PhoneFrame），不硬编码 844，矮屏/横屏自然适应 */
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
  background: #fff;
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
  background: #fff7e6;
  color: #d46b08;
  font-size: 12px;
  text-align: center;
  border-bottom: 1px solid #ffe7ba;
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
</style>
