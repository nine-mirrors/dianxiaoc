<script setup lang="ts">
/**
 * 问题清单（PRD 4.4-D：左侧 4px 严重度竖条，含位置 / 影响 / 快捷动作）。
 *
 * ★ hover 时向上抛出 hover 的标注 id 集合，供 AnnotatedImage 双向高亮联动（需求池 ㊲）。
 */
import { computed } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { severityMeta } from '@/domain/issueBuilder'
import type { Issue } from '@/types'

interface Props {
  issues: Issue[]
  /** 是否显示快捷动作按钮（只读历史态隐藏） */
  showActions?: boolean
  /** 需要高亮的 issue id（标注图 ↔ 问题清单双向联动反向链路） */
  highlightIssueIds?: string[]
  /** 已有整改回执的 issue id（置灰 + 删除线，表示已处理） */
  rectifiedIssueIds?: string[]
}
const props = withDefaults(defineProps<Props>(), {
  issues: () => [],
  showActions: true,
  highlightIssueIds: () => [],
  rectifiedIssueIds: () => [],
})

const emit = defineEmits<{
  (e: 'hover', ids: string[]): void
  (e: 'action', payload: { issue: Issue; action: string }): void
}>()

/** 当前 issue 是否被标注图反向高亮 */
function isOn(issue: Issue): boolean {
  return props.highlightIssueIds.includes(issue.id)
}

/** 当前 issue 是否已有整改回执（已处理态） */
function isRectified(issue: Issue): boolean {
  return props.rectifiedIssueIds.includes(issue.id)
}

/** 各严重度数量，用于标题「问题清单（4）」 */
const counts = computed(() => {
  const acc = { severe: 0, medium: 0, low: 0 }
  props.issues.forEach((i) => (acc[i.severity] += 1))
  return acc
})

/** 鼠标进入：高亮关联标注框 */
function onEnter(issue: Issue): void {
  emit('hover', issue.relatedAnnotationIds ?? [])
}

/** 鼠标离开：取消高亮 */
function onLeave(): void {
  emit('hover', [])
}
</script>

<template>
  <div class="issue-list">
    <div v-if="!issues.length" class="issue-list__empty">本次巡店未发现明显问题，保持当前陈列水平。</div>

    <div
      v-for="issue in issues"
      :key="issue.id"
      class="issue"
      :class="{ 'issue--on': isOn(issue), 'issue--done': isRectified(issue) }"
      @mouseenter="onEnter(issue)"
      @mouseleave="onLeave"
    >
      <div class="issue__head">
        <span class="issue__sev" :style="{ '--c': severityMeta(issue.severity).color }">
          {{ severityMeta(issue.severity).label }}
        </span>
        <p class="issue__title">{{ issue.title }}</p>
        <span v-if="isRectified(issue)" class="issue__done-tag">已处理</span>
      </div>

      <p class="issue__loc">{{ issue.location }}</p>
      <p v-if="issue.impact" class="issue__impact">{{ issue.impact }}</p>

      <div v-if="showActions && issue.actions?.length" class="issue__actions">
        <button
          v-for="act in issue.actions"
          :key="act"
          class="issue__btn"
          @click="emit('action', { issue, action: act })"
        >
          {{ act }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.issue-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.issue-list__empty {
  padding: 14px;
  border-radius: 8px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-size: 12px;
}

.issue {
  position: relative;
  padding: 10px 12px 10px 14px;
  border-radius: 10px;
  background: #fafbfa;
  overflow: hidden;
  transition: box-shadow 0.2s ease;
}

.issue::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--c, var(--text-3));
}

.issue:hover {
  box-shadow: var(--shadow-card);
}

.issue--on {
  box-shadow: 0 0 0 2px var(--ai-purple);
  background: var(--ai-purple-light, #f1ebff);
  transform: translateX(2px);
}

/* 已留证：置灰 + 标题删除线 + 「已处理」标记 */
.issue--done {
  opacity: 0.62;
}

.issue--done .issue__title {
  text-decoration: line-through;
}

.issue__done-tag {
  flex: none;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--mn-green);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
}

.issue__head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.issue__sev {
  flex: none;
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--c);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

.issue__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}

.issue__loc,
.issue__impact {
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-3);
}

.issue__impact {
  color: var(--level-risk);
}

.issue__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.issue__btn {
  padding: 4px 10px;
  border: 1px solid var(--mn-green);
  border-radius: 999px;
  background: #fff;
  color: var(--mn-green);
  font-size: 11px;
  font-weight: 600;
}

.issue__btn:active {
  background: var(--mn-green-light);
}
</style>
