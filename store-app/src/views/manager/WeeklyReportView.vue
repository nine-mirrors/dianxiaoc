<script setup lang="ts">
/**
 * WeeklyReportView（/manager/report）—— AI 周报。
 *
 * 主体来自 `POST /ai-insights/weekly-report` 的真 SSE 流式周报，
 * 四个段落（本周概览 / 关键改善 / 主要风险 / 下周动作）解析为视觉分节卡片；
 * 结束帧的 source 决定来源标注（llm →「AI 生成 · qwen」，否则「规则兜底」）。
 *
 * 右侧 KPI 摘要从小看板 `GET /dashboard/overview` 取真实数（与经理看板同源），
 * 区域下拉也直接复用该接口的 regionIds，避免另建一份字典。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import DesktopHeader from '@/components/layout/DesktopHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import MilkDropLoader from '@/components/common/MilkDropLoader.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import { useToast } from '@/composables/useToast'
import { useSessionStore } from '@/stores/session'
import { streamWeeklyReport } from '@/api/insights'
import { getDashboardOverview } from '@/api'
import type { DashboardOverview, Kpi } from '@/types'

/**
 * 后端看板实际比共享类型多 regionName / regionStoreTotal，且 kpis 会产出 trend:'flat'。
 * 共享 types/index.ts 不归本代理所有，故在本地做结构扩展（仅本页渲染使用）。
 */
type KpiExt = Omit<Kpi, 'trend'> & { trend: 'up' | 'down' | 'flat' }
type OverviewExt = Omit<DashboardOverview, 'kpis'> & {
  kpis: KpiExt[]
  regionName?: string
  regionStoreTotal?: number
}

const session = useSessionStore()
const { success, info, error: toastError } = useToast()

const regionId = ref<string>('R_EAST')
const overview = ref<OverviewExt | null>(null)
const kpiLoading = ref<boolean>(true)

const report = ref<string>('')
const streaming = ref<boolean>(false)
const generated = ref<boolean>(false)
const source = ref<'llm' | 'fallback' | null>(null)
let ctrl: AbortController | null = null

const SECTION_ORDER = ['本周概览', '关键改善', '主要风险', '下周动作'] as const

/** 段落视觉分节：把「【X】」与兜底文案「一、X：」统一解析为节 */
const sections = computed<{ title: string; body: string }[]>(() => {
  // 归一化：兜底格式「一、本周概览：」→「【本周概览】」，与模型输出对齐
  const normalized = report.value.replace(
    /(?:^|\n)\s*[一二三四五六]、\s*(本周概览|关键改善|主要风险|下周动作)\s*[:：]?/g,
    '\n【$1】',
  )
  const heads = [...normalized.matchAll(/【(本周概览|关键改善|主要风险|下周动作)】/g)]
  if (!heads.length) return []
  const firstIdx = heads[0].index ?? 0
  return heads.map((h, i) => {
    const start = (h.index ?? 0) + h[0].length
    const end = i + 1 < heads.length ? (heads[i + 1].index ?? normalized.length) : normalized.length
    return {
      title: h[1],
      body: normalized.slice(start, end).trim().replace(/^[:：]\s*/, ''),
    }
  })
})

/** 首个段落之前的文字（兜底周报有「【XX本周经营周报】」标题行） */
const leadIn = computed<string>(() => {
  const normalized = report.value.replace(
    /(?:^|\n)\s*[一二三四五六]、\s*(本周概览|关键改善|主要风险|下周动作)\s*[:：]?/g,
    '\n【$1】',
  )
  const idx = normalized.search(/【(本周概览|关键改善|主要风险|下周动作)】/)
  return idx > 0 ? normalized.slice(0, idx).trim() : ''
})

const sourceLabel = computed<string>(() =>
  source.value === 'llm'
    ? 'AI 生成 · qwen'
    : source.value === 'fallback'
      ? '规则兜底（未配置大模型 Key）'
      : '未获取来源标注',
)

/** 取 KPI 摘要（真实数，与经理看板同源） */
async function loadOverview(): Promise<void> {
  kpiLoading.value = true
  try {
    const res = await getDashboardOverview(regionId.value)
    overview.value = res.overview
  } catch {
    overview.value = null
    toastError('KPI 摘要加载失败，周报正文不受影响')
  } finally {
    kpiLoading.value = false
  }
}

/** 生成周报（SSE 流式） */
async function generate(): Promise<void> {
  if (streaming.value) return
  streaming.value = true
  generated.value = false
  report.value = ''
  source.value = null
  ctrl = new AbortController()
  try {
    const res = await streamWeeklyReport(
      (d) => {
        report.value += d
      },
      { region: regionId.value, signal: ctrl.signal },
    )
    source.value = res.source
    generated.value = res.ok && !!report.value
    if (!res.ok && !report.value) {
      report.value = '周报生成失败：后端未连接或服务异常，请稍后重新生成。'
      toastError('周报生成失败，请稍后重试')
    }
  } catch {
    report.value = report.value || '周报生成被中断，请重新生成。'
    toastError('周报生成失败，请稍后重试')
  } finally {
    streaming.value = false
    ctrl = null
  }
}

async function changeRegion(id: string): Promise<void> {
  regionId.value = id
  overview.value = null
  await loadOverview()
  info('已切换区域，可重新生成周报')
}

/** 复制全文 */
async function copyAll(): Promise<void> {
  if (!report.value) return
  try {
    await navigator.clipboard.writeText(report.value)
    success('已复制周报全文')
  } catch {
    toastError('复制失败，请手动选择文本')
  }
}

/** 下载为 .md */
function downloadMd(): void {
  if (!report.value) return
  const blob = new Blob([`# ${overview.value?.regionName ?? '本区域'}经营周报\n\n${report.value}\n`], {
    type: 'text/markdown;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `AI周报_${regionId.value}_${new Date().toISOString().slice(0, 10)}.md`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  success('已下载为 Markdown 文件')
}

onMounted(() => {
  void loadOverview()
  void generate()
})

onBeforeUnmount(() => {
  ctrl?.abort()
})
</script>

<template>
  <div class="wr">
    <h1 class="u-sr-only">AI 经营周报</h1>

    <DesktopHeader
      :region-ids="overview?.regionIds ?? []"
      :region-id="regionId"
      :user-name="session.user?.name ?? ''"
      :role-label="session.roleLabel"
      @switch-role="() => {}"
      @change-region="changeRegion"
    />

    <div class="wr__body">
      <!-- 顶部工具条：区域选择 + 生成 -->
      <section class="u-card wr__bar">
        <div class="wr__bar-left">
          <AppIcon name="clipboard" :size="16" color="var(--mn-green)" />
          <h2 class="wr__bar-title">AI 经营周报</h2>
          <label class="wr__region">
            区域：
            <select :value="regionId" @change="changeRegion(($event.target as HTMLSelectElement).value)">
              <option v-for="r in overview?.regionIds ?? []" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
          </label>
        </div>
        <button type="button" class="u-btn u-btn--ai" :disabled="streaming" @click="generate">
          <AppIcon name="sparkles" :size="15" />
          {{ streaming ? '生成中…' : generated ? '重新生成' : '生成周报' }}
        </button>
      </section>

      <div class="wr__grid">
        <!-- 主体：周报正文 -->
        <section class="u-card wr__main">
          <header class="wr__main-head">
            <h2 class="wr__main-title">
              <AppIcon name="sparkles" :size="16" color="var(--ai-purple)" />
              {{ overview?.regionName ?? '本区域' }}本周经营周报
            </h2>
            <span v-if="generated && !streaming" class="wr__source">{{ sourceLabel }}</span>
          </header>

          <!-- 生成中：奶滴图标（仅图标）+ 骨架 -->
          <div v-if="streaming && !report" class="wr__loading">
            <MilkDropLoader size="card" label="" />
            <div class="wr__skeleton">
              <SkeletonBlock height="16px" radius="6px" />
              <SkeletonBlock height="16px" radius="6px" />
              <SkeletonBlock height="16px" radius="6px" />
            </div>
          </div>

          <!-- 正文：视觉分节 -->
          <div v-else class="wr__content">
            <p v-if="leadIn" class="wr__lead">{{ leadIn }}</p>

            <template v-if="sections.length">
              <article v-for="s in sections" :key="s.title" class="wr__section">
                <h3 class="wr__section-title">【{{ s.title }}】</h3>
                <p class="wr__section-body">{{ s.body }}<span v-if="streaming" class="wr__caret" /></p>
              </article>
            </template>

            <!-- 尚未解析出分节：原文流式渲染（流式过程中标题可能还没到） -->
            <p v-else class="wr__raw">{{ report || '正在生成…' }}<span v-if="streaming" class="wr__caret" /></p>
          </div>

          <!-- 底部动作 -->
          <footer class="wr__actions">
            <button type="button" class="wr__mini-btn" :disabled="!report" @click="copyAll">
              <AppIcon name="clipboard" :size="13" /> 复制全文
            </button>
            <button type="button" class="wr__mini-btn" :disabled="!report" @click="downloadMd">
              <AppIcon name="download" :size="13" /> 下载 .md
            </button>
            <button type="button" class="wr__mini-btn" :disabled="streaming" @click="generate">
              <AppIcon name="refresh" :size="13" /> 重新生成
            </button>
            <span class="wr__actions-hint">周报仅引用看板底稿数字，不编造、不外推</span>
          </footer>
        </section>

        <!-- 侧栏：本周关键 KPI 摘要 -->
        <aside class="u-card wr__side">
          <header class="wr__side-head">
            <AppIcon name="zap" :size="15" color="var(--mn-green)" />
            <h2>本周关键 KPI</h2>
          </header>
          <div v-if="kpiLoading" class="wr__side-loading">
            <SkeletonBlock v-for="i in 4" :key="i" height="52px" radius="10px" />
          </div>
          <ul v-else-if="overview?.kpis?.length" class="wr__kpi-list">
            <li v-for="k in overview.kpis" :key="k.key" class="wr__kpi">
              <span class="wr__kpi-label">{{ k.label }}</span>
              <span class="wr__kpi-value">{{ k.value }}</span>
              <span
                class="wr__kpi-delta"
                :class="k.trend === 'down' ? 'is-down' : k.trend === 'flat' ? 'is-flat' : 'is-up'"
              >{{ k.delta }}</span>
            </li>
          </ul>
          <p v-else class="wr__side-hint">KPI 摘要暂不可用，周报正文仍按后端底稿生成。</p>
          <p class="wr__side-foot">口径：与「区域经营看板」同一份 dashboard 底稿，数字可直接对照。</p>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wr {
  min-height: 100vh;
  background: var(--bg-page);
}

.wr__body {
  max-width: 1760px;
  margin: 0 auto;
  padding: 16px 24px 28px;
}

.wr__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
  padding: 12px 16px;
}

.wr__bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.wr__bar-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

.wr__region {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-2);
}

.wr__region select {
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-1);
  font-size: 13px;
}

.wr__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 14px;
  align-items: start;
}

/* ── 主体 ── */
.wr__main {
  padding: 16px 18px;
}

.wr__main-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
}

.wr__main-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 800;
  color: var(--text-1);
}

.wr__source {
  font-size: 11.5px;
  color: var(--text-3);
}

.wr__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 28px 0;
}

.wr__skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.wr__content {
  padding: 14px 2px 6px;
}

.wr__lead {
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 800;
  color: var(--mn-green-dark);
}

.wr__section {
  margin-bottom: 14px;
  padding: 12px 14px;
  border-left: 3px solid var(--mn-green);
  border-radius: 0 10px 10px 0;
  background: var(--bg-subtle, var(--bg-page));
}

.wr__section-title {
  margin-bottom: 6px;
  font-size: 13.5px;
  font-weight: 800;
  color: var(--mn-green-dark);
  letter-spacing: 0.5px;
}

.wr__section-body,
.wr__raw {
  font-size: 13.5px;
  line-height: 1.8;
  color: var(--text-1);
  white-space: pre-wrap;
  word-break: break-word;
}

.wr__caret {
  display: inline-block;
  width: 7px;
  height: 14px;
  margin-left: 2px;
  vertical-align: -2px;
  background: var(--ai-purple);
  animation: wr-blink 1s steps(2) infinite;
}

@keyframes wr-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.wr__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.wr__mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 30px;
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 12px;
  transition: border-color var(--dur-fast) ease, color var(--dur-fast) ease;
}

.wr__mini-btn:hover:not(:disabled) {
  border-color: var(--mn-green);
  color: var(--mn-green-dark);
}

.wr__mini-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.wr__actions-hint {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
}

/* ── 侧栏 ── */
.wr__side {
  padding: 14px 16px;
}

.wr__side-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.wr__side-head h2 {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.wr__side-loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wr__kpi-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wr__kpi {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: baseline;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 10px;
  background: var(--bg-subtle, var(--bg-page));
}

.wr__kpi-label {
  font-size: 12.5px;
  color: var(--text-2);
}

.wr__kpi-value {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.wr__kpi-delta {
  font-size: 11.5px;
  font-weight: 600;
}

.wr__kpi-delta.is-up { color: var(--mn-green); }
.wr__kpi-delta.is-down { color: var(--level-risk); }
.wr__kpi-delta.is-flat { color: var(--text-3); }

.wr__side-hint,
.wr__side-foot {
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.6;
}

.wr__side-foot {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-color);
}

@media (max-width: 1024px) {
  .wr__grid {
    grid-template-columns: 1fr;
  }
}
</style>
