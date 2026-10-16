<script setup lang="ts">
/**
 * 问题清单（PRD 4.4-D：左侧 4px 严重度竖条，含位置 / 影响 / 快捷动作）。
 *
 * ★ hover 时向上抛出 hover 的标注 id 集合，供 AnnotatedImage 双向高亮联动（需求池 ㊲）。
 * ★ 触屏：点按整张卡抛出 select（点一下锁定、再点取消），hover 仅保留为桌面增强（P4-6）。
 */
import { severityMeta } from '@/domain/issueBuilder'
import type { Issue, Severity } from '@/types'

interface Props {
  issues: Issue[]
  /** 是否显示快捷动作按钮（只读历史态隐藏） */
  showActions?: boolean
  /** 需要高亮的 issue id（标注图 ↔ 问题清单双向联动反向链路） */
  highlightIssueIds?: string[]
  /** 已有整改回执的 issue id（置灰 + 删除线，表示已处理） */
  rectifiedIssueIds?: string[]
  /** 当前被点选锁定的 issue id（触屏锁定态，用于 aria-pressed） */
  lockedIssueId?: string | null
}
const props = withDefaults(defineProps<Props>(), {
  issues: () => [],
  showActions: true,
  highlightIssueIds: () => [],
  rectifiedIssueIds: () => [],
  lockedIssueId: null,
})

const emit = defineEmits<{
  (e: 'hover', ids: string[]): void
  (e: 'action', payload: { issue: Issue; action: string }): void
  /** 点按整张卡：通知父级切换该问题的锁定高亮（再点一次取消） */
  (e: 'select', issue: Issue): void
}>()

/**
 * 无真实后端动作的「假按钮」：不渲染（fixtures / issueBuilder 仍保留文案，
 * 展示层统一过滤，业务数据与 API 不动）。打印价签、申请物料均无落地接口。
 */
const FAKE_ACTIONS = ['打印价签', '申请物料']
function visibleActions(issue: Issue): string[] {
  return (issue.actions ?? []).filter((a) => !FAKE_ACTIONS.some((f) => a.includes(f)))
}

/** 影响文案 / 徽标的严重度层级 class（警报分级：severe 红 / medium 橙 / low 灰） */
const IMPACT_TONE_CLASS: Record<Severity, string> = {
  severe: 'issue__impact--severe',
  medium: 'issue__impact--medium',
  low: 'issue__impact--low',
}

/** 当前 issue 是否被标注图反向高亮（含触屏锁定） */
function isOn(issue: Issue): boolean {
  return props.highlightIssueIds.includes(issue.id)
}

/** 当前 issue 是否被触屏点选锁定 */
function isLocked(issue: Issue): boolean {
  return props.lockedIssueId === issue.id
}

/** 当前 issue 是否已有整改回执（已处理态） */
function isRectified(issue: Issue): boolean {
  return props.rectifiedIssueIds.includes(issue.id)
}

/** 鼠标进入：高亮关联标注框 */
function onEnter(issue: Issue): void {
  emit('hover', issue.relatedAnnotationIds ?? [])
}

/** 鼠标离开：取消高亮 */
function onLeave(): void {
  emit('hover', [])
}

/**
 * 点按问题卡（触屏 / 鼠标单击）：切换锁定高亮。
 * 点击动作按钮时不触发（按钮自带处理并阻止冒泡）。
 */
function onCardClick(e: MouseEvent, issue: Issue): void {
  const target = e.target as HTMLElement | null
  if (target?.closest('button, .issue__actions')) return
  emit('select', issue)
}

/** 键盘（回车 / 空格）在问题标题行上切换锁定 */
function onSelectKey(issue: Issue, e: KeyboardEvent): void {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  emit('select', issue)
}
</script>

<template>
  <div class="issue-list mot-stagger">
    <div v-if="!issues.length" class="issue-list__empty">本次巡店未发现明显问题，保持当前陈列水平。</div>

    <div
      v-for="issue in issues"
      :key="issue.id"
      class="issue"
      :class="[
        `issue--${issue.severity}`,
        { 'issue--on': isOn(issue), 'issue--locked': isLocked(issue), 'issue--done': isRectified(issue) },
      ]"
      @mouseenter="onEnter(issue)"
      @mouseleave="onLeave"
      @click="onCardClick($event, issue)"
    >
      <div
        class="issue__head u-tap mot-tap"
        role="button"
        tabindex="0"
        :aria-pressed="isLocked(issue)"
        :aria-label="`在标注图中定位：${issue.title}`"
        @keydown="onSelectKey(issue, $event)"
      >
        <span
          class="issue__sev"
          :class="[`issue__sev--${issue.severity}`, { 'mot-pulse': issue.severity === 'severe' }]"
        >
          {{ severityMeta(issue.severity).label }}
        </span>
        <p class="issue__title">{{ issue.title }}</p>
        <span v-if="isRectified(issue)" class="issue__done-tag">已处理</span>
      </div>

      <p class="issue__loc">{{ issue.location }}</p>
      <p v-if="issue.impact" class="issue__impact" :class="IMPACT_TONE_CLASS[issue.severity]">{{ issue.impact }}</p>

      <div v-if="showActions && visibleActions(issue).length" class="issue__actions">
        <button
          v-for="act in visibleActions(issue)"
          :key="act"
          type="button"
          class="issue__btn u-tap"
          @click.stop="emit('action', { issue, action: act })"
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
  background: var(--bg-card);
  /* 不用 overflow:hidden：避免裁掉 .u-tap 外扩的 44px 热区；竖条自身用圆角收口 */
  transition:
    box-shadow var(--dur-fast) var(--ease-standard),
    transform var(--dur-fast) var(--ease-standard),
    background-color var(--dur-fast) var(--ease-standard);
  cursor: pointer;
}

.issue::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  border-radius: 10px 0 0 10px;
  background: var(--text-3);
}

/* 警报分级竖条：severe 深红 / medium 深橙 / low 灰 */
.issue--severe::before {
  background: var(--danger-fg);
}

.issue--medium::before {
  background: var(--warning-fg);
}

.issue--low::before {
  background: var(--text-3);
}

.issue:hover {
  box-shadow: var(--shadow-card);
}

/* hover 联动：轻位移 + 紫环 */
.issue--on {
  box-shadow: 0 0 0 2px var(--ai-purple);
  background: var(--ai-purple-light);
  transform: translateX(2px);
}

/* 触屏锁定：紫环常驻但不位移（避免布局长期偏移） */
.issue--locked {
  box-shadow: 0 0 0 2px var(--ai-purple);
  background: var(--ai-purple-light);
  transform: none;
}

/* 已留证：置灰 + 标题删除线 + 「已处理」标记 */
.issue--done {
  opacity: 0.62;
}

.issue--done.issue--locked,
.issue--done.issue--on {
  opacity: 0.85;
}

.issue--done .issue__title {
  text-decoration: line-through;
}

.issue__done-tag {
  flex: none;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--brand);
  color: var(--milk);
  font-size: 10px;
  font-weight: 600;
}

.issue__head {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

/* 徽标浅底 + AA 深字（不再用白字橙底——橙底白字仅 2:1） */
.issue__sev {
  flex: none;
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--bg-page);
  color: var(--text-3);
  font-size: 10px;
  font-weight: 700;
}

.issue__sev--severe {
  background: var(--danger-bg);
  color: var(--danger-fg);
}

.issue__sev--medium {
  background: var(--warning-bg);
  color: var(--warning-fg);
}

.issue__sev--low {
  background: var(--bg-page);
  color: var(--text-3);
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

/* 影响文案分级：严重才用红，中度用深橙，轻度用灰（警报疲劳治理） */
.issue__impact--severe {
  color: var(--danger-fg);
  font-weight: 600;
}

.issue__impact--medium {
  color: var(--warning-fg);
}

.issue__impact--low {
  color: var(--text-3);
}

.issue__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.issue__btn {
  padding: 4px 10px;
  border: 1px solid var(--brand);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--brand);
  font-size: 11px;
  font-weight: 600;
}

.issue__btn:active {
  background: var(--mn-green-light);
}

/* 容器级联入场结束后释放 transform：保留既有 hover / 锁定联动的 translateX 位移
   （仅改 fill-mode，不锁 to 帧，入场动画仍完整播放） */
.issue-list > .issue {
  animation-fill-mode: backwards;
}
</style>
