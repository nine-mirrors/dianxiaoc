<script setup lang="ts">
/**
 * 「我的」页（Tab4）/ 未匹配路由共用。
 *
 * 刻意保持极简：只回答两件事——「我是谁（姓名/角色，来自 session store）」
 * 与「换账号/退出」。不再放重复跳转的占位入口，避免把人带进死胡同。
 */
import { useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const session = useSessionStore()
const toast = useToast()

/** 退出登录：复用 session store 的登出（清 token + 断实时推送），再回登录页 */
function logout(): void {
  session.logout()
  toast.info('已退出登录，请重新登录')
  void router.replace('/login')
}
</script>

<template>
  <MobileLayout title="我的" :show-tab-bar="true" :content-padding-bottom="24">
    <div class="me">
      <div class="me__card">
        <span class="me__avatar">{{ session.avatarText }}</span>
        <div class="me__id">
          <p class="me__name">{{ session.user?.name ?? '未登录' }}</p>
          <p class="me__sub">{{ session.roleLabel }}<template v-if="session.user?.sub"> · {{ session.user.sub }}</template></p>
        </div>
      </div>

      <button type="button" class="me__logout u-tap mot-tap" @click="logout">
        <AppIcon name="refresh" :size="15" />
        切换账号 / 退出登录
      </button>
    </div>
  </MobileLayout>
</template>

<style scoped>
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
  flex: none;
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

.me__id {
  min-width: 0;
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

/* 唯一主动作：命中盒 ≥44px，与手机壳内其它页面的按钮体系一致 */
.me__logout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-height: 44px;
  margin-top: 14px;
  padding: 10px 0;
  border: 1px solid var(--border-color, #e8eaec);
  border-radius: 10px;
  background: var(--bg-card, #fff);
  color: var(--text-2, #4b5563);
  font-size: 14px;
}
</style>
