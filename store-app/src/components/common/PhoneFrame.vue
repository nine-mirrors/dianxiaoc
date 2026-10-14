<script setup lang="ts">
/**
 * 桌面端 390×844 手机外壳（录屏与展示更专业）。
 * 仅负责外壳与屏幕裁剪边界；屏幕内部由各页面自行滚动。
 */
</script>

<template>
  <div class="phone-shell">
    <!-- 390×844 手机屏 -->
    <div class="phone">
      <div class="phone__notch" aria-hidden="true" />
      <div class="phone__screen">
        <slot />
        <!-- 覆盖层槽：Toast 等浮层渲染在此，被手机屏裁剪、随壳定位，桌面演示不会漂到视口中央 -->
        <div class="phone__overlay">
          <slot name="overlay" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.phone-shell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 24px 0;
}

.phone {
  position: relative;
  /* ★ 关键：作为「全屏」的裁剪边界。手机内的 fixed 元素（地图全屏）
     以此为定位上下文，不会穿透到整个浏览器窗口去撑满桌面视口 */
  z-index: 1;
  width: var(--phone-w);
  height: var(--phone-h);
  border-radius: 40px;
  background: #10140f;
  box-shadow:
    0 0 0 10px #1b1f1c,
    0 0 0 11px #2c322d,
    0 24px 60px rgba(0, 0, 0, 0.32);
  overflow: hidden;
}

.phone__notch {
  position: absolute;
  top: 8px;
  left: 50%;
  z-index: 20;
  width: 112px;
  height: 24px;
  border-radius: 999px;
  background: #10140f;
  transform: translateX(-50%);
  pointer-events: none;
}

.phone__screen {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-page);
  /* 预留刘海/灵动岛高度，避免顶栏标题被遮挡（真实手机状态栏位） */
  padding-top: 30px;
  box-sizing: border-box;
}

/* 覆盖层：随手机屏定位与裁剪（Toast 不逃出机壳）；本身不吃指针事件 */
.phone__overlay {
  position: absolute;
  inset: 0;
  z-index: 3000;
  overflow: hidden;
  pointer-events: none;
}

/* ════════════════════════════════════════════════════════════
 * 响应式适配（断点像素值口径与 tokens.css --bp-* 对齐）
 *  - 480px：真机全屏退化线（< --bp-sm:640px 的真机子集）
 *  - 桌面矮窗口：宽度 >480 但高度不足时，机壳等比收缩，整壳完整可见
 * ════════════════════════════════════════════════════════════ */

/* 窄屏（真机 / 手机模式，≤480px = 真机退化线）下自动退化为全屏，不再套壳。
 * 安全区归属（单点负责，避免与内部组件叠加成双内边距）：
 *  - 顶部 env(safe-area-inset-top) 由 MobileLayout 的 .ml-head 承担；
 *  - 底部 env(safe-area-inset-bottom) 由 TabBar / 全局 .u-safe-bottom 承担；
 *  - 不套 MobileLayout 的全屏页（登录页）由 global.css 的 .mot-route-host
 *    直系根兜底规则承担。故本层只移除桌面壳的 30px 假状态栏，不重复加 env。 */
@media (max-width: 480px) {
  .phone-shell {
    padding: 0;
  }

  .phone,
  .phone__screen {
    width: 100%;
    /* 100vh 打底，100dvh 覆写：旧浏览器取 vh，支持 dvh 的浏览器地址栏
       收起/展开时高度实时跟随，不会出现底部被工具栏遮挡 */
    height: 100vh;
    height: 100dvh;
    border-radius: 0;
    box-shadow: none;
  }

  .phone__screen {
    /* 移除桌面壳专用的 30px 假状态栏位（真机由 .ml-head 的 env 安全区接管） */
    padding-top: 0;
  }

  .phone__notch {
    display: none;
  }
}

/* 桌面矮窗口（笔记本矮屏 / 压扁的浏览器窗口，宽度仍 >480px）：
 * 视口高度放不下「844 机壳 + 上下 24px×2 留白」（即 <892px）时，
 * 机壳高度按 min(844px, 100dvh-留白) 取值并以 390/844 宽高比反推宽度，
 * 保证整壳完整可见、内部仍由 .ml-body 自行滚动，不依赖固定 844。
 * ≥892px（含常规 1440×900 演示视口）本规则不触发，桌面视觉零变化。 */
@media (min-width: 481px) and (max-height: 891px) {
  .phone-shell {
    padding: 12px 0;
  }

  .phone {
    /* flex 容器内禁止收缩，宽度完全交给 aspect-ratio */
    flex: none;
    height: min(844px, calc(100vh - 24px));
    height: min(844px, calc(100dvh - 24px)); /* dvh 覆写 100vh */
    width: auto; /* 高度确定时由 aspect-ratio 反推宽度，避免比例失真 */
    aspect-ratio: 390 / 844;
  }
}

/* 超宽矮屏（如横屏 844×390）与小屏横屏：策略为「限高 + 最小可读宽」——
 * 若按视口反推的机壳宽度会跌破 320px（最小适配机型宽度），则保住 320 宽、
 * 机壳高度随宽高比回到 ≈693px，超出矮视口的部分由浏览器页面纵向滚动
 * 展现，绝不裁切内容；视口放得下时仍是完整可见的缩小整壳。
 * 主内容在 .ml-body 内滚动、吸底 CTA 与 TabBar 始终锚在壳底。 */
@media (min-width: 481px) and (max-height: 560px) {
  .phone-shell {
    padding: 8px 0;
  }

  .phone {
    flex: none;
    /* max() 兜底：320px 宽对应的等比高度 = 320×844/390 ≈ 693px */
    height: max(693px, min(844px, calc(100vh - 16px)));
    height: max(693px, min(844px, calc(100dvh - 16px))); /* dvh 覆写 100vh */
    width: auto;
    aspect-ratio: 390 / 844;
    border-radius: 28px;
  }

  /* 极矮壳内假状态栏留白同步收敛（刘海装饰已隐藏） */
  .phone__screen {
    padding-top: 14px;
  }

  .phone__notch {
    display: none;
  }
}

/* 尊重「减少动态效果」：机壳随窗口的尺寸变化本就是即时响应、不加过渡，
   此处仅显式禁止任何残留位移动画，矮屏横屏切换不产生滑动/缩放动画。 */
@media (min-width: 481px) and (max-height: 891px) and (prefers-reduced-motion: reduce) {
  .phone,
  .phone__screen {
    transition: none;
  }
}
</style>
