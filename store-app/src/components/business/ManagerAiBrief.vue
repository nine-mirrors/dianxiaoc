<script setup lang="ts">
/**
 * 经理 AI 晨报（P0-2）。
 *
 * AI 每天上班先把区域风险门店排好、拟好下派任务草稿；经理在弹层里确认后才真正下发
 * （human-in-the-loop）：点击某条草稿的「下派」会打开看板唯一的 TaskDispatchDialog，
 * 并带入 storeId / taskType / dueAt / note，下派仍走 POST /tasks
 * （落库 + WebSocket 实时推给业代）。草稿与看板风险 Top5 严格同源。
 */
import { ref, watch } from 'vue'
import { getMorningBrief, type MorningBrief, type MorningDraft } from '@/api'
import { useToast } from '@/composables/useToast'
import AppIcon from '@/components/common/AppIcon.vue'
import type { TaskType } from '@/types'

/** 交给看板的下派预置（与 TaskDispatchDialog 的 initial* props 对齐） */
interface DraftDispatchPreset {
  storeId: string
  taskType: TaskType
  dueAt: string
  note: string
}

const props = defineProps<{ regionId: string }>()
const emit = defineEmits<{
  /** 请求打开看板唯一的下派弹层，并带入本草稿内容 */
  (e: 'dispatch', preset: DraftDispatchPreset): void
}>()

const toast = useToast()
const loading = ref(false)
const brief = ref<MorningBrief | null>(null)

async function loadBrief(): Promise<void> {
  if (loading.value) return
  loading.value = true
  try {
    brief.value = await getMorningBrief(props.regionId)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '晨报生成失败，请重试')
  } finally {
    loading.value = false
  }
}

/** 下派成功后由看板调用：重新生成晨报（已下派门店不再重复出草稿） */
defineExpose({ reload: loadBrief })

/** 切换区域后清空旧晨报，避免把 A 区草稿派到 B 区 */
watch(
  () => props.regionId,
  () => {
    brief.value = null
  },
)

/** 草稿「下派」：打开看板统一弹层（紫=AI 发起动作，绿=人工在弹层确认） */
function requestDispatch(d: MorningDraft): void {
  emit('dispatch', {
    storeId: d.storeId,
    taskType: d.taskType,
    dueAt: d.dueAt,
    note: d.reason,
  })
}

function levelText(d: MorningDraft): string {
  return d.level === 'risk' ? '红灯' : '预警'
}
</script>

<template>
  <section class="brief">
    <header class="brief__head">
      <h2 class="brief__title">
        <AppIcon name="sparkles" :size="16" color="var(--ai-purple)" />
        <span>AI 晨报 · 今日风险与拟派任务</span>
        <span v-if="brief" class="brief__src" :class="brief.source === 'llm' ? 'is-llm' : 'is-rule'">
          {{ brief.source === 'llm' ? 'AI 生成' : '规则摘要' }}
        </span>
      </h2>
      <button class="brief__btn" :disabled="loading" @click="loadBrief">
        {{ loading ? '生成中…' : brief ? '重新生成' : '生成今日晨报' }}
      </button>
    </header>

    <div v-if="loading" class="brief__loading">AI 正在汇总本区域风险门店、拟定任务草稿…</div>

    <template v-else-if="brief">
      <p class="brief__headline">{{ brief.headline }}</p>

      <div v-if="brief.drafts.length" class="brief__list">
        <div v-for="d in brief.drafts" :key="d.storeId" class="draft">
          <span class="draft__main">
            <span class="draft__name">
              {{ d.storeName }}
              <em class="draft__level" :class="d.level === 'risk' ? 'is-risk' : 'is-warn'">
                {{ levelText(d) }} {{ d.score }}
              </em>
            </span>
            <span class="draft__sub">{{ d.taskTypeLabel }} · {{ d.dueAt }} 前 · {{ d.reason }}</span>
          </span>
          <button type="button" class="brief__dispatch" @click="requestDispatch(d)">
            <AppIcon name="send" :size="12" /> 下派
          </button>
        </div>
      </div>
      <p v-else class="brief__empty">当前没有需要立即下派的高风险门店。</p>

      <p v-if="brief.drafts.length" class="brief__footnote">
        共 {{ brief.drafts.length }} 条 AI 草稿：点击「下派」后在弹层中确认，任务实时推送业代。
      </p>
    </template>

    <p v-else class="brief__hint">
      点击「生成今日晨报」，AI 会先替你巡检整个片区，把今天最该处理的门店排成任务草稿。
    </p>
  </section>
</template>

<style scoped>
.brief {
  padding: 16px 18px;
  border-radius: var(--radius-card, 14px);
  background: linear-gradient(135deg, var(--ai-mist) 0%, var(--bg-card) 60%);
  border: 1px solid var(--ai-mist);
}

.brief__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.brief__title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1, #1f2937);
}

.brief__src {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
}
.brief__src.is-llm {
  background: var(--ai-mist);
  color: var(--ai);
}
.brief__src.is-rule {
  background: var(--bg-page);
  color: var(--text-2);
}

/* AI 发起动作：紫色；最终人工确认在弹层的绿色主按钮上 */
.brief__btn,
.brief__dispatch {
  border: none;
  border-radius: 999px;
  background: var(--ai);
  color: var(--milk);
  font-weight: 700;
  cursor: pointer;
  transition: background var(--dur-fast) ease;
}

.brief__btn {
  flex: none;
  padding: 7px 14px;
  font-size: 12.5px;
}
.brief__btn:hover {
  background: var(--ai-bright);
}
.brief__btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.brief__loading,
.brief__hint {
  margin: 12px 0 0;
  font-size: 12.5px;
  color: var(--text-3);
}

.brief__headline {
  margin: 12px 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ai-mist);
  font-size: 13px;
  line-height: 1.6;
  color: var(--ai);
}

.brief__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.draft {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--ai-mist);
  border-radius: 10px;
  background: var(--bg-card);
}

.draft__main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.draft__name {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-1);
}

.draft__level {
  margin-left: 8px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-style: normal;
  font-weight: 700;
}
.draft__level.is-risk {
  background: var(--danger-bg);
  color: var(--danger-fg);
}
.draft__level.is-warn {
  background: var(--warning-bg);
  color: var(--warning-fg);
}

.draft__sub {
  font-size: 11.5px;
  color: var(--text-3);
}

/* 行内 AI 下派：浅紫底 + 紫字（比实心大按钮弱一级，避免与整卡主操作抢视觉） */
.brief__dispatch {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  background: var(--ai-mist);
  color: var(--ai);
  font-size: 12px;
}
.brief__dispatch:hover {
  background: var(--ai);
  color: var(--milk);
}

.brief__empty {
  margin: 10px 0 0;
  font-size: 12.5px;
  color: var(--text-3);
}

.brief__footnote {
  margin: 12px 0 0;
  padding-top: 10px;
  border-top: 1px dashed var(--ai-mist);
  font-size: 12px;
  color: var(--text-3);
}
</style>
