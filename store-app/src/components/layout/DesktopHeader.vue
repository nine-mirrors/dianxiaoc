<script setup lang="ts">
/**
 * 桌面看板顶栏（P5 用，1440 宽屏形态）。
 * 包含 Logo / 产品名 / 区域下拉 / 角色切换；数据由外部 props 注入，不直接调接口。
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useSessionStore } from '@/stores/session'

interface Props {
  regionIds: { id: string; name: string }[]
  regionId: string
  userName: string
  roleLabel: string
}
const props = withDefaults(defineProps<Props>(), {
  regionIds: () => [],
  regionId: '',
  userName: '',
  roleLabel: '',
})

const emit = defineEmits<{ (e: 'change-region', id: string): void; (e: 'switch-role'): void }>()

/**
 * 后端不可用提示（测评报告发现：桌面端没有断网提示，经理看板会整页空白）。
 * 与移动端 MobileLayout 监听同一个 `api:offline` 事件，保证两端一致。
 */
const session = useSessionStore()
/**
 * 断网提示同时由两路驱动：
 *  1. `api:offline` 事件（运行期请求失败）
 *  2. `session.offlineNotice` 状态（首屏 restore 阶段就失败，事件早于组件挂载）
 */
const offline = ref<boolean>(session.offlineNotice)
watch(() => session.offlineNotice, (v) => {
  offline.value = v
})
function markOffline(): void {
  offline.value = true
}
function markOnline(): void {
  offline.value = false
}
onMounted(() => {
  window.addEventListener('api:offline', markOffline)
  window.addEventListener('api:online', markOnline)
})
onBeforeUnmount(() => {
  window.removeEventListener('api:offline', markOffline)
  window.removeEventListener('api:online', markOnline)
})
</script>

<template>
  <header class="desk-header">
    <!-- 后端未连接提示：避免看板整页空白却毫无说明 -->
    <p v-if="offline" class="desk-header__offline">
      <AppIcon name="warning" :size="13" color="#b26a00" />
      后端未连接 · 请确认服务已启动（cd server &amp;&amp; npm start），页面数据暂不可用
    </p>
    <div class="desk-header__brand">
      <span class="desk-header__logo"><AppIcon name="milk" :size="20" color="#fff" /></span>
      <div>
        <p class="desk-header__title">一眼千店 · 区域经营看板</p>
        <p class="desk-header__sub">店小C · 蒙牛 AI 巡店助手</p>
      </div>
    </div>

    <div class="desk-header__right">
      <label class="desk-header__region">
        区域：
        <select :value="props.regionId" @change="emit('change-region', ($event.target as HTMLSelectElement).value)">
          <option v-for="r in props.regionIds" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
      </label>
      <button class="desk-header__role" @click="emit('switch-role')">
        <AppIcon name="user" :size="15" />
        <span>{{ props.roleLabel }} · {{ props.userName }}</span>
        <AppIcon name="refresh" :size="13" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.desk-header {
  /* 定位上下文：断网提示条要挂在 header 下沿 */
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  padding: 0 24px;
  background: linear-gradient(135deg, var(--mn-green) 0%, var(--mn-green-dark) 100%);
  color: #fff;
}

.desk-header__offline {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
  padding: 7px 14px;
  background: #fff8e6;
  border-bottom: 1px solid #ffe0a3;
  color: #b26a00;
  font-size: 12px;
  font-weight: 600;
}

.desk-header__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.desk-header__logo {
  font-size: 24px;
}

.desk-header__title {
  font-size: 17px;
  font-weight: 700;
}

.desk-header__sub {
  font-size: 12px;
  opacity: 0.75;
}

.desk-header__right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.desk-header__region select {
  padding: 5px 8px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 13px;
}

.desk-header__region select option {
  color: var(--text-1);
}

.desk-header__role {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 13px;
}
</style>
