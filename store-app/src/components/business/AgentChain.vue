<script setup lang="ts">
/**
 * Agent 工作链（P0-1）——把一次诊断背后「AI 真正做了什么」摆到台面上。
 *
 * 数据来自后端 diagnosis.agentTrace，是本次请求的**真实执行轨迹**：
 *   视觉大模型 → MCP 进销存工具 → 六维诊断引擎 → Holt 预测补货 → 大模型表达
 * 每一步标注能力类型（大模型 / 工具 / 算法）与真实来源、状态、耗时，
 * 主动回答评委的灵魂问题："你这到底是不是套了个聊天框？"
 */
import { computed } from 'vue'
import type { AgentTraceStep } from '@/types'

const props = defineProps<{ steps: AgentTraceStep[] }>()

const list = computed<AgentTraceStep[]>(() => props.steps ?? [])

/** 能力类型 → 徽标文案/样式 */
const KIND_META: Record<string, { label: string; cls: string }> = {
  llm: { label: '大模型', cls: 'is-llm' },
  tool: { label: 'MCP 工具', cls: 'is-tool' },
  algorithm: { label: '算法引擎', cls: 'is-algo' },
}
function kindMeta(kind: string) {
  return KIND_META[kind] ?? { label: '规则', cls: 'is-algo' }
}

/** 状态 → 文案/点样式 */
function statusText(s: string): string {
  if (s === 'done') return '已完成'
  if (s === 'fallback') return '已降级'
  if (s === 'ready') return '待你触发'
  return s
}
function fmtMs(ms?: number): string {
  if (!ms || ms <= 0) return ''
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}
</script>

<template>
  <section v-if="list.length" class="chain">
    <header class="chain__head">
      <h3 class="chain__title">AI 工作链：这张照片背后发生了什么</h3>
      <div class="chain__legend">
        <span class="tag is-llm">大模型</span>
        <span class="tag is-tool">真实数据·MCP</span>
        <span class="tag is-algo">算法引擎</span>
      </div>
    </header>

    <ol class="chain__list">
      <li v-for="(s, i) in list" :key="s.key || i" class="step" :class="`step--${s.status}`">
        <div class="step__rail">
          <span class="step__dot" :class="`step__dot--${s.status}`">
            <template v-if="s.status === 'done'">✓</template>
            <template v-else-if="s.status === 'fallback'">≈</template>
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span v-if="i < list.length - 1" class="step__line" />
        </div>

        <div class="step__body">
          <div class="step__top">
            <b class="step__title">{{ s.title }}</b>
            <span class="tag" :class="kindMeta(s.kind).cls">{{ kindMeta(s.kind).label }}</span>
          </div>
          <p class="step__detail">{{ s.detail }}</p>
          <div class="step__meta">
            <span class="step__source">{{ s.source }}</span>
            <span v-if="fmtMs(s.ms)" class="step__ms">耗时 {{ fmtMs(s.ms) }}</span>
            <span class="step__status" :class="`step__status--${s.status}`">{{ statusText(s.status) }}</span>
          </div>
        </div>
      </li>
    </ol>

    <p class="chain__note">
      效期与价签由 MCP 从进销存读取、健康分与补货量由可解释算法算出，大模型负责识别与表达；
      任何数字都能在对应卡片展开算式溯源。
    </p>
  </section>
</template>

<style scoped>
.chain {
  margin: 10px 0;
  padding: 14px 14px 10px;
  border-radius: var(--radius-card, 14px);
  background: linear-gradient(180deg, var(--bg-page) 0%, var(--bg-card) 100%);
  border: 1px solid var(--border-color);
}

.chain__head {
  margin-bottom: 10px;
}

.chain__title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-1);
}

.chain__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1.5;
}

.tag.is-llm {
  background: var(--ai-mist);
  color: var(--ai-deep);
}

.tag.is-tool {
  background: var(--sky-mist);
  color: var(--info-fg);
}

.tag.is-algo {
  background: var(--brand-mist);
  color: var(--success-fg);
}

.chain__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.step {
  display: flex;
  gap: 10px;
}

.step__rail {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  width: 20px;
}

.step__dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 800;
  /* 序号/勾压在彩色圆点上：奶白文字（夜间随 --milk 转深字） */
  color: var(--milk);
  background: var(--brand);
  z-index: 1;
}

.step__dot--fallback {
  background: var(--warning-fg);
}

.step__dot--ready {
  background: var(--text-3);
}

.step__line {
  flex: 1;
  width: 2px;
  min-height: 18px;
  margin: 2px 0;
  background: var(--border-color);
}

.step__body {
  flex: 1;
  min-width: 0;
  padding-bottom: 12px;
}

.step:last-child .step__body {
  padding-bottom: 2px;
}

.step__top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.step__title {
  font-size: 13.5px;
  color: var(--text-1);
}

.step__detail {
  margin: 4px 0 5px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-2);
}

.step__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 10.5px;
  color: var(--text-3);
}

.step__source {
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

.step__status {
  margin-left: auto;
  font-weight: 700;
}

.step__status--done {
  color: var(--brand-deep);
}

.step__status--fallback {
  color: var(--warning-fg);
}

.step__status--ready {
  color: var(--text-3);
}

.chain__note {
  margin: 8px 0 0;
  padding-top: 8px;
  border-top: 1px dashed var(--border-color);
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--text-3);
}
</style>
