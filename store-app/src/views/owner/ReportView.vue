<script setup lang="ts">
/**
 * 经营报告 · 说人话版（店主端 /owner/report）。
 *
 * 数据：GET /stores/:id/profile（门店名 / 健康分 / 趋势 / 六维 / 问题分布 / 单据小结）
 *      + GET /visits/:id 取诊断 id → POST /ai/generate/stream 生成「说人话」解读。
 *  - 只谈店主看得懂的话，不暴露「六维度 / 弹性系数」等内部术语；
 *  - 生成中只显示牛奶注入加载（不出现「AI生成中」文字），完成后如实标注来源；
 *  - hasDiagnosis === false 时提示先做一次自助诊断。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import HealthBadge from '@/components/common/HealthBadge.vue'
import MilkDropLoader from '@/components/common/MilkDropLoader.vue'
import { useSessionStore } from '@/stores/session'
import { resolveOwnerStore, getStoreProfile, getVisit, streamGenerate } from '@/api/owner'
import type { StoreProfile } from '@/api/owner'
import type { Diagnosis, HealthLevelKey } from '@/types'

const router = useRouter()
const session = useSessionStore()

const loading = ref<boolean>(true)
const loadError = ref<string>('')
const noDiagnosis = ref<boolean>(false)

const profile = ref<StoreProfile | null>(null)
const diagnosis = ref<Diagnosis | null>(null)

const healthLevel = computed<HealthLevelKey>(
  () => (profile.value?.health.level as HealthLevelKey) || 'good',
)
const healthScore = computed<string>(() => {
  const s = profile.value?.health.score
  return s === null || s === undefined ? '—' : String(s)
})
const delta = computed<number>(() => Number(profile.value?.health.delta ?? 0))

/* ── 图表 ── */
const trendEl = ref<HTMLElement | null>(null)
const dimEl = ref<HTMLElement | null>(null)
const issueEl = ref<HTMLElement | null>(null)
const charts: echarts.ECharts[] = []

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function disposeCharts(): void {
  while (charts.length) charts.pop()?.dispose()
}

function renderCharts(): void {
  disposeCharts()
  const p = profile.value
  if (!p) return
  const textColor = cssVar('--text-3', '#81918a')
  const axisColor = cssVar('--border-color', '#e7efe9')

  // ① 健康分趋势
  if (trendEl.value && p.healthTrend.length) {
    const c = echarts.init(trendEl.value)
    charts.push(c)
    c.setOption({
      grid: { left: 4, right: 14, top: 24, bottom: 2, containLabel: true },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: p.healthTrend.map((d) => d.week),
        axisLine: { lineStyle: { color: axisColor } },
        axisLabel: { color: textColor, fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        splitLine: { lineStyle: { color: axisColor, type: 'dashed' } },
        axisLabel: { color: textColor, fontSize: 10 },
      },
      series: [
        {
          type: 'line',
          smooth: true,
          data: p.healthTrend.map((d) => d.score),
          symbolSize: 6,
          lineStyle: { width: 3, color: '#00b451' },
          itemStyle: { color: '#00b451' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(0,180,81,0.30)' },
              { offset: 1, color: 'rgba(0,180,81,0.02)' },
            ]),
          },
        },
      ],
    })
  }

  // ② 六维表现（横向条形，口语化标签）
  if (dimEl.value && p.dimensions.length) {
    const c = echarts.init(dimEl.value)
    charts.push(c)
    const ordered = [...p.dimensions].reverse()
    c.setOption({
      grid: { left: 4, right: 22, top: 6, bottom: 2, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'value',
        min: 0,
        max: 100,
        splitLine: { lineStyle: { color: axisColor, type: 'dashed' } },
        axisLabel: { color: textColor, fontSize: 10 },
      },
      yAxis: {
        type: 'category',
        data: ordered.map((d) => d.label),
        axisLine: { lineStyle: { color: axisColor } },
        axisLabel: { color: textColor, fontSize: 10 },
      },
      series: [
        {
          type: 'bar',
          data: ordered.map((d) => d.score),
          barWidth: 12,
          itemStyle: {
            color: '#00b451',
            borderRadius: [0, 6, 6, 0],
          },
          label: { show: true, position: 'right', color: textColor, fontSize: 10 },
        },
      ],
    })
  }

  // ③ 问题分布（环形）
  if (issueEl.value && p.issueTypes.length) {
    const c = echarts.init(issueEl.value)
    charts.push(c)
    c.setOption({
      tooltip: { trigger: 'item' },
      legend: {
        bottom: 0,
        textStyle: { color: textColor, fontSize: 10 },
        itemWidth: 9,
        itemHeight: 9,
      },
      series: [
        {
          type: 'pie',
          radius: ['46%', '68%'],
          center: ['50%', '42%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: cssVar('--bg-card', '#fff'), borderWidth: 2 },
          label: { show: false },
          data: p.issueTypes.map((it) => ({ name: it.type, value: it.count })),
        },
      ],
    })
  }
}

function onResize(): void {
  for (const c of charts) c.resize()
}

/* ── AI 说人话解读 ── */
const aiText = ref<string>('')
const aiSource = ref<'llm' | 'fallback' | null>(null)
const aiStreaming = ref<boolean>(false)
let aiCtrl: AbortController | null = null

async function genAi(): Promise<void> {
  const diagId = diagnosis.value?.id
  if (!diagId || aiStreaming.value) return
  aiStreaming.value = true
  aiText.value = ''
  aiSource.value = null
  aiCtrl = new AbortController()
  try {
    const res = await streamGenerate(
      'owner',
      diagId,
      (d) => {
        aiText.value += d
      },
      aiCtrl.signal,
    )
    aiSource.value = res.source
    if (!res.ok && !aiText.value) aiText.value = '这次没生成出来，你可以先看看下面的行动清单。'
  } catch {
    aiText.value = aiText.value || '这次没生成出来，你可以先看看下面的行动清单。'
  } finally {
    aiStreaming.value = false
    aiCtrl = null
  }
}

const aiLabel = computed<string>(() => (aiSource.value === 'llm' ? 'AI 生成' : '规则解读'))

/* ── 本店行动清单 ── */
function verbalize(title: string): string {
  if (/竞品|占位|黄金/.test(title)) return '黄金位置被别的牌子占了'
  if (/缺货|缺 1|缺\d/.test(title)) return '有几排货架空了，该补货了'
  if (/价签/.test(title)) return '有几个价签不见了，顾客没法比价'
  if (/物料|堆头/.test(title)) return '促销物料没摆上，少了个卖点'
  return '有些地方可以摆得更好卖'
}

const actions = computed<{ title: string; tip: string }[]>(() => {
  const out: { title: string; tip: string }[] = []
  for (const iss of diagnosis.value?.issues ?? []) {
    out.push({ title: verbalize(iss.title), tip: (iss.actions ?? []).slice(0, 2).join('、') || '尽快处理' })
    if (out.length >= 3) break
  }
  if (out.length < 3) {
    for (const it of profile.value?.issueTypes ?? []) {
      if (out.length >= 3) break
      const t = verbalize(it.type)
      if (!out.some((o) => o.title === t)) out.push({ title: t, tip: `这一类还有 ${it.count} 处待处理` })
    }
  }
  if (!out.length) out.push({ title: '现在陈列不错，继续保持', tip: '每天巡一眼价签和排面就行' })
  return out
})

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  noDiagnosis.value = false
  diagnosis.value = null
  aiText.value = ''
  aiSource.value = null
  try {
    const store = await resolveOwnerStore(session.user?.name)
    if (!store) {
      loadError.value = '没找到你的门店，请确认登录账号与门店的绑定关系'
      return
    }
    const p = await getStoreProfile(store.id)
    profile.value = p
    if (!p.hasDiagnosis || !p.visits?.length) {
      noDiagnosis.value = true
      return
    }
    try {
      const detail = await getVisit(p.visits[0].id)
      diagnosis.value = detail.diagnosis
    } catch {
      /* 诊断明细拉不到不阻塞报告其余部分 */
    }
    await nextTick()
    renderCharts()
  } catch (e) {
    loadError.value = (e as Error)?.message || '经营报告没拉到，请稍后重试'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  aiCtrl?.abort()
  disposeCharts()
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <MobileLayout title="经营报告" :back="true" :show-tab-bar="true" :content-padding-bottom="24" @back="router.push('/owner')">
    <div class="rp">
      <div v-if="loading" class="rp__loading">
        <MilkDropLoader size="card" label="正在生成本店报告" />
      </div>

      <EmptyState
        v-else-if="loadError"
        icon="warning"
        title="报告没拉到"
        :desc="loadError"
        action-text="重新加载"
        @action="load"
      />

      <EmptyState
        v-else-if="noDiagnosis || !profile"
        icon="camera"
        title="本店暂无诊断记录"
        desc="请先做一次自助诊断，AI 看过后才能给你出这份经营报告。"
        action-text="去自助诊断"
        @action="router.push('/owner')"
      />

      <template v-else>
        <!-- 门店 + 健康分 -->
        <section class="u-card rp__hero">
          <p class="rp__store"><AppIcon name="store" :size="16" color="var(--mn-green-dark)" />{{ profile.store.name }}</p>
          <div class="rp__score-row">
            <p class="rp__score">{{ healthScore }}</p>
            <div class="rp__score-right">
              <HealthBadge :level="healthLevel" size="md" />
              <span class="rp__delta" :class="delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : 'is-flat'">
                环比 {{ delta > 0 ? '+' : '' }}{{ delta }}
              </span>
            </div>
          </div>
          <p class="rp__score-cap">这是门店整体的健康状况分，越高说明陈列和库存越好。</p>
        </section>

        <!-- AI 说人话解读 -->
        <section class="u-card rp__ai">
          <header class="rp__head">
            <h2><AppIcon name="sparkles" :size="15" color="var(--ai-purple)" /> 说人话给你听</h2>
            <button
              v-if="!aiStreaming"
              type="button"
              class="u-btn u-btn--ai rp__ai-btn"
              :disabled="!diagnosis"
              @click="genAi"
            >
              <AppIcon name="sparkles" :size="14" /> 让 AI 说说
            </button>
          </header>

          <div v-if="aiStreaming" class="rp__ai-loading">
            <MilkDropLoader size="card" label="" />
          </div>
          <template v-else-if="aiText">
            <p class="rp__ai-text">{{ aiText }}</p>
            <p class="rp__ai-src">{{ aiLabel }}</p>
          </template>
          <p v-else class="rp__ai-hint">
            {{ diagnosis ? '点「让 AI 说说」，用大白话告诉你这家店现在怎么样、该先做点啥。' : '诊断明细暂时没拉到，先看看下面的行动清单。' }}
          </p>
        </section>

        <!-- 健康分趋势 -->
        <section class="u-card rp__card">
          <header class="rp__head"><h2><AppIcon name="history" :size="15" /> 健康分变化</h2><span>近 {{ profile.healthTrend.length }} 次</span></header>
          <div v-if="profile.healthTrend.length" ref="trendEl" class="rp__chart rp__chart--trend" />
          <EmptyState v-else icon="history" title="暂无趋势数据" desc="巡店次数多了，这里会画出变化。" />
        </section>

        <!-- 六维表现 -->
        <section class="u-card rp__card">
          <header class="rp__head"><h2><AppIcon name="layers" :size="15" /> 各方面表现</h2><span>{{ profile.dimensions.length ? '六项得分' : '暂无' }}</span></header>
          <div v-if="profile.dimensions.length" ref="dimEl" class="rp__chart rp__chart--dim" />
          <EmptyState v-else icon="layers" title="暂无分项数据" desc="该店还没有诊断记录，不做补齐。" />
        </section>

        <!-- 问题分布 -->
        <section class="u-card rp__card">
          <header class="rp__head"><h2><AppIcon name="tag" :size="15" /> 问题都出在哪</h2><span>{{ profile.issueTypes.length }} 类</span></header>
          <div v-if="profile.issueTypes.length" ref="issueEl" class="rp__chart rp__chart--issue" />
          <EmptyState v-else icon="tag" title="暂无问题分类" desc="该店诊断记录为空。" />
        </section>

        <!-- 行动清单 -->
        <section class="u-card rp__card">
          <header class="rp__head"><h2><AppIcon name="clipboard" :size="15" /> 本店行动清单</h2><span>先做这几件</span></header>
          <div v-for="(a, i) in actions" :key="i" class="rp__act">
            <span class="rp__act-no">{{ i + 1 }}</span>
            <div class="rp__act-main">
              <p class="rp__act-title">{{ a.title }}</p>
              <p class="rp__act-tip">建议：{{ a.tip }}</p>
            </div>
          </div>
        </section>

        <!-- 单据小结 -->
        <section class="u-card rp__card">
          <header class="rp__head"><h2><AppIcon name="cart" :size="15" /> 订货单据小结</h2></header>
          <div class="rp__sum">
            <div class="rp__sum-item"><p class="rp__sum-num">{{ profile.ticketsSummary.count }}</p><p class="rp__sum-cap">订单笔数</p></div>
            <div class="rp__sum-item"><p class="rp__sum-num">¥{{ profile.ticketsSummary.totalAmount }}</p><p class="rp__sum-cap">订货总额</p></div>
            <div class="rp__sum-item"><p class="rp__sum-num is-ok">{{ profile.ticketsSummary.acceptedCount }}</p><p class="rp__sum-cap">已接单</p></div>
          </div>
        </section>
      </template>
    </div>
  </MobileLayout>
</template>

<style scoped>
.rp {
  padding: 14px 16px;
}

.rp__loading {
  padding: 60px 0;
}

.u-card {
  padding: 14px 16px;
  margin-bottom: 12px;
}

.rp__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.rp__head h2 {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.rp__head span {
  font-size: 11.5px;
  color: var(--text-3);
}

/* ── 健康分 ── */
.rp__store {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-1);
}

.rp__score-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 8px;
}

.rp__score {
  font-size: 46px;
  font-weight: 800;
  line-height: 1;
  color: var(--mn-green-dark);
  font-variant-numeric: tabular-nums;
}

.rp__score-right {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.rp__delta {
  font-size: 12px;
  font-weight: 600;
}

.rp__delta.is-up { color: var(--mn-green); }
.rp__delta.is-down { color: var(--level-risk); }
.rp__delta.is-flat { color: var(--text-3); }

.rp__score-cap {
  margin-top: 10px;
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.6;
}

/* ── AI 解读 ── */
.rp__ai-btn {
  height: 32px;
  padding: 0 12px;
  font-size: 12.5px;
}

.rp__ai-loading {
  padding: 8px 0;
}

.rp__ai-text {
  font-size: 13.5px;
  line-height: 1.8;
  color: var(--text-1);
  white-space: pre-wrap;
}

.rp__ai-src {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-3);
}

.rp__ai-hint {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-3);
}

/* ── 图表 ── */
.rp__chart {
  width: 100%;
}

.rp__chart--trend { height: 180px; }
.rp__chart--dim { height: 190px; }
.rp__chart--issue { height: 200px; }

/* ── 行动清单 ── */
.rp__act {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--border-color);
}

.rp__act:last-child {
  border-bottom: none;
}

.rp__act-no {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--brand-mist);
  color: var(--success-fg);
  font-size: 11.5px;
  font-weight: 700;
}

.rp__act-main {
  min-width: 0;
}

.rp__act-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}

.rp__act-tip {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--text-3);
}

/* ── 单据小结 ── */
.rp__sum {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.rp__sum-item {
  padding: 12px 6px;
  border-radius: 10px;
  background: var(--bg-page);
  text-align: center;
}

.rp__sum-num {
  font-size: 20px;
  font-weight: 800;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.rp__sum-num.is-ok { color: var(--success-fg); }

.rp__sum-cap {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
}
</style>
