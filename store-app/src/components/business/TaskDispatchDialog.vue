<script setup lang="ts">
/**
 * 下派任务弹层（P5 看板 · ARCHITECTURE T05.3 ★ 跨角色闭环）。
 *
 * 经理选门店 + 任务类型 + 时限 + 备注 → 调契约层 createTask 落库，
 * 业代端 P2 待办即时可见（tasks store + localStorage 持久化）。
 */
import { computed, ref } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { createTask } from '@/api'
import { TASK_TYPES } from '@/domain/constants'
import { useToast } from '@/composables/useToast'
import type { Task, TaskType } from '@/types'

interface Props {
  /** 可选门店（来自看板风险 Top5） */
  stores: { storeId: string; storeName: string }[]
}

const props = withDefaults(defineProps<Props>(), { stores: () => [] })

const emit = defineEmits<{ (e: 'close'): void; (e: 'dispatched', task: Task): void }>()

const toast = useToast()

/** 目标业代（演示固定李强） */
const ASSIGNEE_ID = 'U_REP'

const storeId = ref<string>(props.stores[0]?.storeId ?? '')
const taskType = ref<TaskType>('OOS')
const dueAt = ref<string>('今日 18:00')
const note = ref<string>('')
const submitting = ref<boolean>(false)

/** 时限预设 */
const DUE_OPTIONS = ['今日 12:00', '今日 18:00', '明日 10:00', '明日 18:00']

/** 当前选中门店名 */
const storeName = computed<string>(() => {
  const s = props.stores.find((x) => x.storeId === storeId.value)
  return s?.storeName ?? ''
})

async function submit(): Promise<void> {
  if (!storeId.value || submitting.value) return
  submitting.value = true
  try {
    const { task } = await createTask({
      storeId: storeId.value,
      taskType: taskType.value,
      dueAt: dueAt.value,
      note: note.value.trim() || `请尽快处理「${storeName.value}」的${TASK_TYPES.find((t) => t.key === taskType.value)?.label ?? '整改'}问题。`,
      assigneeId: ASSIGNEE_ID,
    })
    emit('dispatched', task)
    toast.success(`任务已下派给 李强（${task.taskTypeLabel}）`)
    emit('close')
  } catch {
    toast.error('下派失败，请重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="dlg-mask" @click.self="emit('close')">
    <div class="dlg">
      <header class="dlg__head">
        <b><AppIcon name="send" :size="15" color="var(--ai-purple)" /> 下派整改任务</b>
        <button class="dlg__x" @click="emit('close')">✕</button>
      </header>

      <div class="dlg__body">
        <!-- 选门店 -->
        <label class="dlg__field">
          <span class="dlg__label">目标门店</span>
          <select v-model="storeId" class="dlg__select">
            <option v-for="s in props.stores" :key="s.storeId" :value="s.storeId">{{ s.storeName }}</option>
          </select>
        </label>

        <!-- 任务类型 -->
        <div class="dlg__field">
          <span class="dlg__label">任务类型</span>
          <div class="dlg__types">
            <button
              v-for="t in TASK_TYPES"
              :key="t.key"
              class="dlg__type"
              :class="{ 'is-active': taskType === t.key }"
              @click="taskType = t.key"
            >
              {{ t.label }}
            </button>
          </div>
        </div>

        <!-- 时限 -->
        <div class="dlg__field">
          <span class="dlg__label">完成时限</span>
          <div class="dlg__types">
            <button
              v-for="d in DUE_OPTIONS"
              :key="d"
              class="dlg__type"
              :class="{ 'is-active': dueAt === d }"
              @click="dueAt = d"
            >
              {{ d }}
            </button>
          </div>
        </div>

        <!-- 备注 -->
        <label class="dlg__field">
          <span class="dlg__label">备注（可留空）</span>
          <textarea v-model="note" class="dlg__note" rows="3" placeholder="补充要求，如：重点关注优益C 排面与价签…" />
        </label>
      </div>

      <footer class="dlg__foot">
        <button class="u-btn u-btn--ghost" @click="emit('close')">取消</button>
        <button class="u-btn u-btn--primary" :disabled="submitting || !storeId" @click="submit">
          {{ submitting ? '下派中…' : '确认下派' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.dlg-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 20, 17, 0.42);
}

.dlg {
  width: 420px;
  max-width: 92vw;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.dlg__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color);
  font-size: 14px;
}

.dlg__head b {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dlg__x {
  border: none;
  background: none;
  font-size: 16px;
  color: var(--text-3);
  cursor: pointer;
}

.dlg__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px;
}

.dlg__field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.dlg__label {
  font-size: 12.5px;
  color: var(--text-2);
  font-weight: 600;
}

.dlg__select {
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-1);
  background: #fff;
}

.dlg__types {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.dlg__type {
  padding: 5px 12px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: #fff;
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
}

.dlg__type.is-active {
  border-color: var(--ai-purple);
  background: var(--ai-purple-light);
  color: var(--ai-purple);
  font-weight: 600;
}

.dlg__note {
  padding: 9px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-1);
  resize: vertical;
  font-family: inherit;
}

.dlg__note::placeholder {
  color: var(--text-3);
}

.dlg__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-color);
}
</style>
