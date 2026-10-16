<script setup lang="ts">
/**
 * 个人资料编辑弹层（姓名 / 电话 / 辖区）。
 *
 * 三端复用：业代端「我的」（views/rep/MeView.vue）与移动门户「我的」页签
 * （views/mobile/MobileConsoleView.vue）共用本组件，避免弹层 UI 与保存逻辑各写一份。
 *
 * 交互与无障碍：
 * - 受控 visible，接入 useDialogFocus：Esc 关闭、焦点陷阱、关闭后焦点还原；
 * - role=dialog + aria-modal + aria-labelledby；三个字段均带 aria-label；
 * - 进出场动画：遮罩淡入淡出 + 面板 mot-fade-up；
 * - 保存中禁用按钮 + .mot-press-loading；成功后 toast + 关闭；失败 toast 带「再试一次」。
 */
import { ref, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { updateUserProfile } from '@/api/user-profile'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'
import { useDialogFocus } from '@/composables/useDialogFocus'

interface Props {
  /** 弹层显隐（由调用方持有） */
  visible: boolean
}

const props = withDefaults(defineProps<Props>(), { visible: false })
const emit = defineEmits<{ (e: 'close'): void }>()

const session = useSessionStore()
const toast = useToast()

/** 表单字段（打开时从当前会话回填） */
const name = ref<string>('')
const phone = ref<string>('')
const region = ref<string>('')
/** 保存中（loading 态，防重复提交） */
const saving = ref<boolean>(false)

/** Esc 关闭（useDialogFocus 在 document 捕获阶段调用） */
function close(): void {
  emit('close')
}

const visibleRef = ref<boolean>(props.visible)
watch(
  () => props.visible,
  (v) => {
    visibleRef.value = v
    if (v) {
      // 每次打开都回填当前真实资料，取消后不残留上次编辑
      name.value = session.user?.name ?? ''
      phone.value = session.user?.phone ?? ''
      region.value = session.user?.region ?? ''
      saving.value = false
    }
  },
  { immediate: true },
)

const { panelRef } = useDialogFocus({ visible: visibleRef, onClose: close })

/** 保存：仅提交已填字段（空串=清除），成功后同步 session 并 toast */
async function save(): Promise<void> {
  if (saving.value) return
  saving.value = true
  const patch = {
    name: name.value.trim(),
    phone: phone.value.trim(),
    region: region.value.trim(),
  }
  try {
    const updated = await updateUserProfile(patch)
    session.setProfile({
      name: updated?.name,
      avatarText: updated?.avatarText,
      phone: updated?.phone,
      region: updated?.region,
    })
    toast.success('资料已更新')
    emit('close')
  } catch (e) {
    const msg = (e as { message?: string })?.message || '资料保存失败，请稍后重试'
    toast.error(msg, { action: { text: '再试一次', onAction: () => void save() } })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Transition name="ped-fade">
    <div v-if="visible" class="ped-mask" @click.self="close">
      <section
        ref="panelRef"
        class="ped"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ped-title"
      >
        <header class="ped__head">
          <h2 class="ped__title" id="ped-title">
            <AppIcon name="user" :size="15" color="var(--mn-green)" /> 编辑资料
          </h2>
          <button type="button" class="ped__x u-tap" data-close aria-label="关闭" @click="close">
            <AppIcon name="close" :size="16" color="var(--text-3)" />
          </button>
        </header>

        <div class="ped__body">
          <div class="ped__field">
            <label class="ped__label" for="ped-name">姓名</label>
            <input
              id="ped-name"
              v-model="name"
              type="text"
              class="ped__input"
              maxlength="20"
              aria-label="姓名"
              placeholder="请输入姓名"
              data-autofocus
            />
          </div>
          <div class="ped__field">
            <label class="ped__label" for="ped-phone">联系电话</label>
            <input
              id="ped-phone"
              v-model="phone"
              type="tel"
              class="ped__input"
              maxlength="20"
              aria-label="联系电话"
              placeholder="如 138 0000 0000"
            />
          </div>
          <div class="ped__field">
            <label class="ped__label" for="ped-region">辖区</label>
            <input
              id="ped-region"
              v-model="region"
              type="text"
              class="ped__input"
              maxlength="30"
              aria-label="辖区"
              placeholder="如 城东片区"
            />
          </div>
          <p class="ped__hint">留空并保存将清除对应字段；姓名清空后回落到账号默认姓名。</p>
        </div>

        <footer class="ped__foot">
          <button type="button" class="u-btn u-btn--ghost" @click="close">取消</button>
          <button
            type="button"
            class="u-btn u-btn--primary"
            :class="{ 'mot-press-loading': saving }"
            :disabled="saving"
            @click="save"
          >
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.ped-mask {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15, 20, 17, 0.42);
}

.ped {
  width: 400px;
  max-width: 92vw;
  max-height: 90dvh;
  overflow-y: auto;
  border-radius: 14px;
  background: var(--bg-elevated);
  box-shadow: var(--sh-3);
  /* 面板入场：与全站一致的淡入 + 轻微上移（进出场动画） */
  animation: mot-fade-up var(--dur-base) var(--ease-decel) both;
}

/* 遮罩进出场：淡入淡出（时长/缓动走动效令牌） */
.ped-fade-enter-active {
  transition: opacity var(--dur-base) var(--ease-decel);
}

.ped-fade-leave-active {
  transition: opacity var(--dur-fast) var(--ease-standard);
}

.ped-fade-enter-from,
.ped-fade-leave-to {
  opacity: 0;
}

.ped__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color);
}

.ped__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.ped__x {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: none;
  cursor: pointer;
}

.ped__x:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.ped__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px;
}

.ped__field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.ped__label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-2);
}

.ped__input {
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-1);
  /* ≥14px：避免输入聚焦时 iOS 自动放大 */
  font-size: 14px;
  outline: none;
  transition: border-color var(--dur-fast) var(--ease-standard),
    box-shadow var(--dur-fast) var(--ease-standard);
}

.ped__input:focus {
  border-color: var(--mn-green);
  box-shadow: 0 0 0 2px var(--mn-green-light);
}

.ped__input::placeholder {
  color: var(--text-3);
}

.ped__hint {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-3);
}

.ped__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-color);
}
</style>
