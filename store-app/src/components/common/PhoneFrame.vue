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

/* 窄屏（真机 / 手机模式）下自动退化为全屏，不再套壳 */
@media (max-width: 480px) {
  .phone,
  .phone__screen {
    width: 100%;
    height: 100vh;
    border-radius: 0;
    box-shadow: none;
  }

  .phone__notch {
    display: none;
  }
}
</style>
