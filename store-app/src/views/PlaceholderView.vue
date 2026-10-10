<script setup lang="ts">
/**
 * 占位页：Tab4「我的」与未匹配路由共用。
 * 保持最小可用性：给出返回主线入口，避免评委点到死胡同。
 */
import { useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const session = useSessionStore()
const toast = useToast()

/** 退出登录：清 token 回登录页（换账号演示用） */
function logout(): void {
  session.logout()
  toast.info('已退出登录，请重新登录')
  router.replace('/login')
}

/** 「我的」页的功能入口 */
const entries = [
  { icon: 'history', label: '我的巡店记录', path: '/rep/history' },
  { icon: 'clipboard', label: '整改单 / 订货记录', path: '/rep/history' },
  { icon: 'store', label: '负责门店（128 家）', path: '/rep/today' },
]
</script>

<template>
  <MobileLayout title="我的" :show-tab-bar="true" :content-padding-bottom="60">
    <div class="me">
      <div class="me__card">
        <span class="me__avatar">{{ session.avatarText }}</span>
        <div>
          <p class="me__name">{{ session.user.name }}</p>
          <p class="me__sub">{{ session.roleLabel }} · {{ session.user.sub }}</p>
        </div>
      </div>

      <div class="me__entries">
        <button v-for="e in entries" :key="e.label" class="me__entry" @click="router.push(e.path)">
          <AppIcon :name="e.icon" :size="16" />
          <span>{{ e.label }}</span>
          <AppIcon name="chevron-right" :size="15" color="var(--text-3)" />
        </button>
      </div>

      <button class="me__logout" @click="logout">
        <AppIcon name="refresh" :size="15" /> 退出登录（换账号）
      </button>

      <p class="me__foot">✦ 个人中心 · 业绩看板与任务中心将在正式版开放</p>
    </div>
  </MobileLayout>
</template>

<style scoped>
.me__logout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 14px;
  padding: 10px 0;
  border: 1px solid var(--border-1, #e8eaec);
  border-radius: 10px;
  background: #fff;
  color: var(--text-2, #4b5563);
  font-size: 13px;
  cursor: pointer;
}

.me__logout:active {
  transform: scale(0.98);
}

.me {
  padding: 14px 12px;
}

.me__card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: var(--radius-card);
  background: linear-gradient(135deg, var(--mn-green) 0%, var(--mn-green-dark) 100%);
  color: #fff;
}

.me__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  font-size: 18px;
  font-weight: 700;
}

.me__name {
  font-size: 16px;
  font-weight: 700;
}

.me__sub {
  margin-top: 2px;
  font-size: 11.5px;
  opacity: 0.85;
}

.me__entries {
  margin-top: 12px;
  border-radius: var(--radius-card);
  background: #fff;
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.me__entry {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 13px 14px;
  border: none;
  border-bottom: 1px dashed var(--border-color);
  background: none;
  color: var(--text-1);
  font-size: 13.5px;
  text-align: left;
}

.me__entry span {
  flex: 1;
}

.me__foot {
  margin-top: 14px;
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
}
</style>
