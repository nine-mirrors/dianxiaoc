<script setup lang="ts">
/**
 * AdminMessagesView —— 管理端消息中心（/admin/messages）。
 *
 * 直接复用四端共用的 `MessageCenter` 核心组件（mode=desktop 双列并排），
 * 外层只负责给一个确定高度的容器把内容撑满，滚动交给组件内部的会话流 / 公告区，
 * 本页自身不另套滚动容器。
 */
import AdminShell from './AdminShell.vue'
import MessageCenter from '@/components/business/MessageCenter.vue'
</script>

<template>
  <AdminShell title="消息中心" subtitle="总部运营控制台 · 与业代 / 店主 / 区域经理实时沟通">
    <div class="amsg">
      <MessageCenter mode="desktop" />
    </div>
  </AdminShell>
</template>

<style scoped>
/* 确定高度撑满可视区（减去外壳顶栏与内容内边距），内部滚动由 MessageCenter 自理 */
.amsg {
  height: calc(100vh - 132px);
  min-height: 460px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  overflow: hidden;
  box-shadow: var(--sh-1);
}

@media (max-width: 1024px) {
  .amsg {
    height: calc(100vh - 124px);
  }
}
</style>
