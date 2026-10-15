<script setup lang="ts">
/**
 * MessagesView（/manager/messages）—— 经理端消息中心（桌面形态）。
 *
 * 直接复用四端共用的 `MessageCenter` 核心组件（mode=desktop 双列并排），
 * 外层只给一个确定高度的容器把内容撑满，滚动交给组件内部的会话流 / 公告区，
 * 本页自身不另套滚动容器（避免滚动嵌套打架）。
 */
import { useRouter } from 'vue-router'
import DesktopHeader from '@/components/layout/DesktopHeader.vue'
import MessageCenter from '@/components/business/MessageCenter.vue'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const session = useSessionStore()
const toast = useToast()

/** 切换账号（身份由后端账号决定，前端不允许自选角色） */
function switchAccount(): void {
  session.logout()
  toast.info('请重新登录目标账号')
  void router.push('/login')
}
</script>

<template>
  <div class="mmsg">
    <h1 class="u-sr-only">消息中心</h1>

    <DesktopHeader
      :region-ids="[]"
      region-id=""
      :user-name="session.user?.name ?? ''"
      :role-label="session.roleLabel"
      @change-region="() => {}"
      @switch-role="switchAccount"
    />

    <div class="mmsg__body">
      <div class="mmsg__frame">
        <MessageCenter mode="desktop" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.mmsg {
  min-height: 100vh;
  background: var(--bg-page);
}

.mmsg__body {
  max-width: 1760px;
  margin: 0 auto;
  padding: 16px 24px 24px;
}

/* 确定高度撑满可视区（减去外壳两行头部与内容内边距），内部滚动由 MessageCenter 自理 */
.mmsg__frame {
  height: calc(100vh - 152px);
  min-height: 460px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
}

@media (max-width: 1366px) {
  .mmsg__body {
    padding-left: 16px;
    padding-right: 16px;
  }
}

@media (max-width: 1024px) {
  .mmsg__frame {
    height: calc(100vh - 144px);
  }
}

@media (max-width: 768px) {
  .mmsg__body {
    padding: 12px;
  }
}
</style>
