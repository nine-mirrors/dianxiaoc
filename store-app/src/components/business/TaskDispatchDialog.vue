<script setup lang="ts">
/**
 * 下派任务弹层（P5 看板 · ARCHITECTURE T05.3 ★ 跨角色闭环）。
 *
 * 经理选门店 + 任务类型 + 时限 + 备注 → 调契约层 createTask 落库，
 * 业代端 P2 待办即时可见（tasks store + localStorage 持久化）。
 *
 * 交互（企业级改造）：
 * - 44 店原生 select → 纯前端可搜索 combobox（输入过滤、健康分升序、
 *   默认选中风险最高店；↑↓ / Enter / Esc 全键盘可用；role=combobox/listbox/option）；
 * - 弹层受控 visible，接入 useDialogFocus：Esc 关闭、焦点陷阱、关闭后焦点还原；
 * - 任务类型 / 时限两组伪单选使用 radiogroup + radio + aria-checked；
 * - 支持 initialStoreId/initialTaskType/initialDueAt/initialNote 预置
 *   （风险行内下派、AI 晨报草稿下派均打开本弹层并带入草稿）。
 */
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { createTask } from '@/api'
import { TASK_TYPES } from '@/domain/constants'
import { useToast } from '@/composables/useToast'
import { useDialogFocus } from '@/composables/useDialogFocus'
import type { Task, TaskType } from '@/types'

interface DispatchStore {
  storeId: string
  storeName: string
  /** 健康分（可缺省）：列表按分数升序，风险最高门店排第一 */
  score?: number
  /** 健康档 key（excellent/good/warning/risk）：列表内分数着色 */
  level?: string
}

interface Props {
  /** 弹层显隐（由看板持有；useDialogFocus 据此做焦点陷阱与焦点还原） */
  visible: boolean
  /** 可选门店（来自看板该区域门店明细 storeRows） */
  stores: DispatchStore[]
  /** 打开时预选门店（风险卡行内 / AI 晨报草稿带入） */
  initialStoreId?: string
  /** 打开时预置任务类型（AI 晨报草稿带入） */
  initialTaskType?: TaskType
  /** 打开时预置时限（AI 晨报草稿带入） */
  initialDueAt?: string
  /** 打开时预置备注（AI 晨报草稿带入） */
  initialNote?: string
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  stores: () => [],
  initialStoreId: '',
  initialTaskType: undefined,
  initialDueAt: '',
  initialNote: '',
})

const emit = defineEmits<{ (e: 'close'): void; (e: 'dispatched', task: Task): void }>()

const toast = useToast()

/** 目标业代（演示固定李强） */
const ASSIGNEE_ID = 'U_REP'

/* storeId 初值不能用 props.stores[0] 直接取：
   本弹层的 stores 来自异步加载的看板数据，弹层打开时可能还是空数组。
   visible 每次变 true 都会走 applyPreset 重新落值，异步到达也有 watcher 兜底。*/
const storeId = ref<string>('')
const taskType = ref<TaskType>('OOS')
const dueAt = ref<string>('今日 18:00')
const note = ref<string>('')
const submitting = ref<boolean>(false)

/* ── combobox 状态 ──────────────────────────────────────────────── */

/** 下拉列表是否展开（aria-expanded） */
const comboOpen = ref<boolean>(false)
/** 输入框筛选文本 */
const query = ref<string>('')
/** 键盘高亮项（aria-activedescendant 指向的 option 下标，-1 = 无高亮） */
const activeIndex = ref<number>(-1)

const LISTBOX_ID = 'dispatch-store-listbox'

/** 受控 visible（只读 Ref 即可，useDialogFocus 只读取监听） */
const visibleRef = computed<boolean>(() => props.visible)

/**
 * Esc 先收 combobox，再关弹层：
 * useDialogFocus 在 document 捕获阶段处理 Esc，这里通过 onClose 回调拦截，
 * 保证列表展开时按 Esc 只收起列表、不把整个弹层关掉。
 */
function closeDialog(): void {
  if (comboOpen.value) {
    comboOpen.value = false
    query.value = ''
    return
  }
  emit('close')
}

const { panelRef } = useDialogFocus({
  visible: visibleRef,
  onClose: closeDialog,
})

/** 门店按健康分升序（分数缺失排最后），风险最高店始终在最前 */
const sortedStores = computed<DispatchStore[]>(() =>
  [...props.stores].sort(
    (a, b) =>
      (a.score ?? Number.POSITIVE_INFINITY) - (b.score ?? Number.POSITIVE_INFINITY) ||
      a.storeName.localeCompare(b.storeName, 'zh-Hans-CN'),
  ),
)

/** 输入店名后的过滤结果（纯前端，不打接口） */
const filteredStores = computed<DispatchStore[]>(() => {
  const kw = query.value.trim()
  if (!kw) return sortedStores.value
  return sortedStores.value.filter((s) => s.storeName.includes(kw))
})

/** 无可选门店：给用户明确原因，而不是一个点不动的按钮 */
const emptyStores = computed<boolean>(() => props.stores.length === 0)

/** 时限预设 */
const DUE_OPTIONS = ['今日 12:00', '今日 18:00', '明日 10:00', '明日 18:00']

/** 当前选中门店名 */
const storeName = computed<string>(() => {
  const s = props.stores.find((x) => x.storeId === storeId.value)
  return s?.storeName ?? ''
})

/** 输入框展示值：展开时显示正在输入的筛选词，收起时显示已选门店名 */
const comboDisplay = computed<string>(() => (comboOpen.value ? query.value : storeName.value))

/** 每次打开弹层：应用外部预置（风险行 / AI 草稿），无预置则选风险最高店 */
function applyPreset(): void {
  const list = sortedStores.value
  const want = props.initialStoreId
  storeId.value = want && list.some((s) => s.storeId === want) ? want : list[0]?.storeId ?? ''
  taskType.value = props.initialTaskType ?? 'OOS'
  dueAt.value = props.initialDueAt || '今日 18:00'
  note.value = props.initialNote ?? ''
  query.value = ''
  comboOpen.value = false
  activeIndex.value = -1
}

watch(
  () => props.visible,
  (open) => {
    if (open) applyPreset()
  },
  { immediate: true },
)

/** 门店数据异步到达后，若当前选中已失效则落到风险最高店 */
watch(sortedStores, (list) => {
  if (!props.visible) return
  if (storeId.value && list.some((s) => s.storeId === storeId.value)) return
  storeId.value = list[0]?.storeId ?? ''
})

/** 列表项分数文字颜色（沿用四档令牌） */
function levelColor(level?: string): string {
  return level ? `var(--level-${level})` : 'var(--text-3)'
}

function openCombo(): void {
  if (emptyStores.value) return
  query.value = ''
  comboOpen.value = true
  const cur = filteredStores.value.findIndex((s) => s.storeId === storeId.value)
  activeIndex.value = cur >= 0 ? cur : filteredStores.value.length ? 0 : -1
}

function toggleCombo(): void {
  if (comboOpen.value) {
    comboOpen.value = false
  } else {
    openCombo()
  }
}

function onComboInput(event: Event): void {
  query.value = (event.target as HTMLInputElement).value
  comboOpen.value = true
  activeIndex.value = filteredStores.value.length ? 0 : -1
}

/** 让键盘高亮项滚动到可视区内（44 行长列表时高亮项不会被裁切） */
function scrollActiveIntoView(): void {
  if (activeIndex.value < 0) return
  void nextTick(() => {
    document
      .getElementById(`${LISTBOX_ID}-opt-${activeIndex.value}`)
      ?.scrollIntoView({ block: 'nearest' })
  })
}

function onComboKeydown(event: KeyboardEvent): void {
  const list = filteredStores.value
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      if (!comboOpen.value) {
        openCombo()
      } else if (list.length) {
        activeIndex.value = Math.min(activeIndex.value + 1, list.length - 1)
      }
      scrollActiveIntoView()
      break
    case 'ArrowUp':
      event.preventDefault()
      if (!comboOpen.value) {
        openCombo()
      } else {
        activeIndex.value = Math.max(activeIndex.value - 1, 0)
      }
      scrollActiveIntoView()
      break
    case 'Enter':
      if (comboOpen.value) {
        event.preventDefault()
        const hit = list[activeIndex.value]
        if (hit) selectStore(hit.storeId)
      }
      break
    case 'Escape':
      // 兜底：正常情况下 Esc 会先被 useDialogFocus（document 捕获）拦走并收列表
      if (comboOpen.value) {
        event.preventDefault()
        event.stopPropagation()
        comboOpen.value = false
        query.value = ''
      }
      break
    case 'Tab':
      comboOpen.value = false
      break
  }
}

function selectStore(id: string): void {
  storeId.value = id
  comboOpen.value = false
  query.value = ''
}

async function submit(): Promise<void> {
  if (!storeId.value || submitting.value) return
  submitting.value = true
  try {
    const { task } = await createTask({
      storeId: storeId.value,
      taskType: taskType.value,
      dueAt: dueAt.value,
      note:
        note.value.trim() ||
        `请尽快处理「${storeName.value}」的${TASK_TYPES.find((t) => t.key === taskType.value)?.label ?? '整改'}问题。`,
      assigneeId: ASSIGNEE_ID,
    })
    // 成功提示只在看板侧弹 1 条 toast（见 DashboardView.onDispatched），此处不再重复
    emit('dispatched', task)
    emit('close')
  } catch {
    toast.error('下派失败，请重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div v-if="visible" class="dlg-mask" @click.self="closeDialog">
    <div
      ref="panelRef"
      class="dlg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dispatch-dialog-title"
    >
      <header class="dlg__head">
        <h2 class="dlg__title" id="dispatch-dialog-title">
          <AppIcon name="send" :size="15" color="var(--ai-purple)" /> 下派整改任务
        </h2>
        <button type="button" class="dlg__x u-tap" data-close aria-label="关闭" @click="closeDialog">
          ✕
        </button>
      </header>

      <div class="dlg__body">
        <!-- 选门店：可搜索 combobox（role=combobox + listbox，全键盘可用） -->
        <div class="dlg__field">
          <span class="dlg__label" id="store-field-label">目标门店</span>
          <div class="combo">
            <input
              :value="comboDisplay"
              type="text"
              class="combo__input"
              role="combobox"
              aria-autocomplete="list"
              :aria-expanded="comboOpen"
              aria-haspopup="listbox"
              :aria-controls="LISTBOX_ID"
              :aria-activedescendant="
                comboOpen && activeIndex >= 0 ? `${LISTBOX_ID}-opt-${activeIndex}` : undefined
              "
              aria-labelledby="store-field-label"
              placeholder="输入店名筛选，默认选中风险最高门店"
              autocomplete="off"
              :disabled="emptyStores"
              data-autofocus
              @input="onComboInput"
              @keydown="onComboKeydown"
              @focus="openCombo"
              @blur="comboOpen = false"
            />
            <button
              type="button"
              class="combo__caret"
              :class="{ 'is-open': comboOpen }"
              tabindex="-1"
              :aria-label="comboOpen ? '收起门店列表' : '展开门店列表'"
              @mousedown.prevent
              @click="toggleCombo"
            >
              <AppIcon name="chevron-down" :size="14" />
            </button>

            <ul
              v-show="comboOpen && !emptyStores"
              :id="LISTBOX_ID"
              class="combo__list"
              role="listbox"
              aria-labelledby="store-field-label"
            >
              <li
                v-for="(s, i) in filteredStores"
                :id="`${LISTBOX_ID}-opt-${i}`"
                :key="s.storeId"
                role="option"
                :aria-selected="s.storeId === storeId"
                class="combo__opt"
                :class="{ 'is-active': i === activeIndex, 'is-selected': s.storeId === storeId }"
                @mousedown.prevent="selectStore(s.storeId)"
                @mouseenter="activeIndex = i"
              >
                <span class="combo__opt-name">{{ s.storeName }}</span>
                <span v-if="typeof s.score === 'number'" class="combo__opt-score" :style="{ color: levelColor(s.level) }">
                  {{ s.score }} 分
                </span>
              </li>
              <li v-if="!filteredStores.length" class="combo__empty" role="presentation">
                没有匹配「{{ query }}」的门店
              </li>
            </ul>
          </div>
          <p v-if="emptyStores" class="dlg__hint dlg__hint--warn">
            当前区域没有可下派的门店数据，请先刷新看板或切换区域
          </p>
        </div>

        <!-- 任务类型（伪单选：radiogroup） -->
        <div class="dlg__field">
          <span class="dlg__label" id="task-type-label">任务类型</span>
          <div class="dlg__types" role="radiogroup" aria-labelledby="task-type-label">
            <button
              v-for="t in TASK_TYPES"
              :key="t.key"
              type="button"
              role="radio"
              :aria-checked="taskType === t.key"
              class="dlg__type"
              :class="{ 'is-active': taskType === t.key }"
              @click="taskType = t.key"
            >
              {{ t.label }}
            </button>
          </div>
        </div>

        <!-- 时限（伪单选：radiogroup） -->
        <div class="dlg__field">
          <span class="dlg__label" id="due-label">完成时限</span>
          <div class="dlg__types" role="radiogroup" aria-labelledby="due-label">
            <button
              v-for="d in DUE_OPTIONS"
              :key="d"
              type="button"
              role="radio"
              :aria-checked="dueAt === d"
              class="dlg__type"
              :class="{ 'is-active': dueAt === d }"
              @click="dueAt = d"
            >
              {{ d }}
            </button>
          </div>
        </div>

        <!-- 备注 -->
        <div class="dlg__field">
          <label class="dlg__label" for="dispatch-note">备注（可留空）</label>
          <textarea
            id="dispatch-note"
            v-model="note"
            class="dlg__note"
            rows="3"
            placeholder="补充要求，如：重点关注优益C 排面与价签…"
          />
        </div>
      </div>

      <footer class="dlg__foot">
        <button type="button" class="u-btn u-btn--ghost" @click="closeDialog">取消</button>
        <button
          type="button"
          class="u-btn u-btn--primary"
          :disabled="submitting || !storeId"
          @click="submit"
        >
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
  padding: 16px;
  background: rgba(15, 20, 17, 0.42);
}

.dlg {
  width: 420px;
  max-width: 92vw;
  max-height: 90dvh;
  overflow-y: auto;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}

.dlg__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color);
  font-size: 14px;
}

.dlg__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.dlg__x {
  flex: none;
  border: none;
  background: none;
  font-size: 16px;
  line-height: 1;
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

/* ── 可搜索 combobox ── */
.combo {
  position: relative;
}

.combo__input {
  width: 100%;
  height: 38px;
  padding: 0 36px 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  /* ≥14px：避免输入框聚焦时 iOS 自动放大页面 */
  font-size: 14px;
  color: var(--text-1);
  background: #fff;
  outline: none;
  transition: border-color var(--dur-fast) ease, box-shadow var(--dur-fast) ease;
}

.combo__input:focus {
  border-color: var(--ai-purple);
  box-shadow: 0 0 0 2px var(--ai-purple-light);
}

.combo__input:disabled {
  background: var(--bg-2, #f5f6f8);
  color: var(--text-3);
  cursor: not-allowed;
}

.combo__caret {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.combo__caret.is-open {
  transform: translateY(-50%) rotate(180deg);
}

.combo__list {
  position: absolute;
  z-index: 10;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 224px;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14);
}

.combo__opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-1);
  cursor: pointer;
}

.combo__opt.is-active {
  background: var(--ai-purple-light);
}

.combo__opt.is-selected .combo__opt-name {
  font-weight: 700;
  color: var(--ai-purple);
}

.combo__opt.is-selected .combo__opt-name::after {
  content: ' ✓';
}

.combo__opt-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.combo__opt-score {
  flex: none;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.combo__empty {
  padding: 10px;
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
}

/* 空态提示：说明「为什么不能下派」，避免只有一个点不动的按钮 */
.dlg__hint {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
}

.dlg__hint--warn {
  color: var(--warning-fg, #ba7517);
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
  transition: background var(--dur-fast) ease, border-color var(--dur-fast) ease,
    color var(--dur-fast) ease;
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
