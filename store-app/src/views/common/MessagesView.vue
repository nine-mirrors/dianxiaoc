<script setup lang="ts">
/**
 * 消息中心薄包装（路由 /messages，业代 / 店主）。
 *
 * 仅负责「外壳 + 顶栏」与形态选择，内容全部委托给共用组件
 * components/business/MessageCenter.vue。
 * 经理端 / 管理端各自有桌面形态包装（manager/MessagesView.vue、
 * admin/AdminMessagesView.vue），三端共用同一份业务组件，零逻辑重复。
 *
 * ★ 形态只看设备（与全局形态判定一致）：PC / 宽窗 → mode=desktop 双列并排
 *   （左侧会话列表常显，不用「返回」在列表与消息流之间来回切）；真机 / 窄窗 →
 *   mode=mobile 单列，点开会话即隐藏列表，回到列表用「‹」。
 */
import MobileLayout from '@/components/layout/MobileLayout.vue'
import MessageCenter from '@/components/business/MessageCenter.vue'
import { useDeviceType } from '@/composables/useDeviceType'

const { isMobile } = useDeviceType()
</script>

<template>
  <MobileLayout title="消息中心" show-tab-bar :content-padding-bottom="0">
    <MessageCenter :mode="isMobile ? 'mobile' : 'desktop'" />
  </MobileLayout>
</template>
