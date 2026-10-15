<script setup lang="ts">
/**
 * 手机端消息中心薄包装（路由 /messages）。
 *
 * 仅负责「手机壳 + 顶栏 + TabBar」外壳，内容全部委托给共用组件
 * components/business/MessageCenter.vue（mode=mobile）。
 * 经理端 / 管理端各自有桌面形态包装（manager/MessagesView.vue、
 * admin/AdminMessagesView.vue），三端共用同一份业务组件，零逻辑重复。
 */
import MobileLayout from '@/components/layout/MobileLayout.vue'
import MessageCenter from '@/components/business/MessageCenter.vue'
</script>

<template>
  <MobileLayout title="消息中心" show-tab-bar :content-padding-bottom="0">
    <MessageCenter mode="mobile" />
  </MobileLayout>
</template>
