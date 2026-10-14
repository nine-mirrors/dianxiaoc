<script setup lang="ts">
/**
 * P4 业代端 · 诊断结果页 ★★★★★（最核心，PRD 4.4 A–H 八模块）—— T04.3 / T04.4 / T04.6。
 *
 * A 顶部摘要 ｜ B 健康分 ｜ C AI 识别标注图（含拖拽对比）｜ D 问题清单
 * E 风险预判 ｜ F AI 追问 ｜ G 千店千面行动方案 ｜ H 底部行动栏
 */
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import AiBadge from '@/components/common/AiBadge.vue'
import HealthBadge from '@/components/common/HealthBadge.vue'
import ScoreRing from '@/components/common/ScoreRing.vue'
import SectionCard from '@/components/common/SectionCard.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import DimensionBars from '@/components/business/DimensionBars.vue'
import AgentChain from '@/components/business/AgentChain.vue'
import AnnotatedImage from '@/components/business/AnnotatedImage.vue'
import CompareSlider from '@/components/business/CompareSlider.vue'
import IssueList from '@/components/business/IssueList.vue'
import RiskCard from '@/components/business/RiskCard.vue'
import ChatPanel from '@/components/business/ChatPanel.vue'
import ActionPlan from '@/components/business/ActionPlan.vue'
import RectificationDialog from '@/components/business/RectificationDialog.vue'
import RectificationCompare from '@/components/business/RectificationCompare.vue'
import { getDiagnosis, getVisit, createTicket, streamGenerate, fetchForecast, getRectifications, type Forecast } from '@/api'
import { useToast } from '@/composables/useToast'
import { useDialogFocus } from '@/composables/useDialogFocus'
import { LAYER_FILTERS, levelLabel, levelOf, ANNOTATION_STYLES, aiBadgeOf, type AiSource } from '@/domain/constants'
import { countBySeverity } from '@/domain/issueBuilder'
import type { AnnotationLayer, Diagnosis, Issue, Rectification, RestockItem, Ticket } from '@/types'

const route = useRoute()
const router = useRouter()
const toast = useToast()

/** 是否只读历史态（P2「查看」/ P5「查看详情」进入） */
const readonly = computed<boolean>(() => route.query.readonly === '1')

/** 诊断数据 */
const diagnosis = ref<Diagnosis | null>(null)
const loading = ref<boolean>(true)
const loadError = ref<boolean>(false)

/** AI 巡店小结 + 订货建议理由 + 给店主话术（Phase 2 赋能，LLM 生成，失败静默降级本地文案） */
const aiSummary = ref<string>('')
const summaryLoading = ref<boolean>(false)
const aiOrderReason = ref<string>('')
const orderReasonLoading = ref<boolean>(false)
const aiPitch = ref<string>('')
const pitchLoading = ref<boolean>(false)

/**
 * ★ A2：每张卡的真实内容来源（后端 SSE done 帧给出）。
 * fallback 时角标不标「AI」，改标「基于陈列标准库生成」—— 降级不谎称大模型。
 */
// undefined = 从未生成（不显示任何来源角标）；完成后由 streamGenerate 赋值为 'llm' | 'fallback' | null
const summarySource = ref<AiSource | null | undefined>(undefined)
const orderReasonSource = ref<AiSource | null | undefined>(undefined)
const pitchSource = ref<AiSource | null | undefined>(undefined)

/**
 * 进入诊断页自动触发「巡店小结」的一次性守卫。
 * 与 loadAiSummary 内部的（aiSummary 非空 / summaryLoading 中）判断构成双重防重入：
 * 本守卫保证整个组件生命周期只自动触发一次（路由 id 变化重新 load、watch 重跑都不会重复触发/轮询）；
 * 已有 aiSummary 内容时 loadAiSummary 自身也会直接返回。
 */
const summaryAutoTried = ref<boolean>(false)

async function loadAiSummary(): Promise<void> {
  if (aiSummary.value || summaryLoading.value || !diagnosis.value) return
  summaryLoading.value = true
  let started = false
  try {
    const res = await streamGenerate('summary', diagnosis.value.id, (delta) => {
      aiSummary.value += delta
      if (!started) {
        started = true
        summaryLoading.value = false // 首个 delta 到达即切到渐进填充，隐藏 loading
      }
    })
    summarySource.value = res.source
  } catch {
    /* 静默：生成失败不打断主流程 */
  } finally {
    summaryLoading.value = false
  }
}

async function loadOrderReason(): Promise<void> {
  if (aiOrderReason.value || orderReasonLoading.value || !diagnosis.value) return
  orderReasonLoading.value = true
  let started = false
  try {
    const res = await streamGenerate('order', diagnosis.value.id, (delta) => {
      aiOrderReason.value += delta
      if (!started) {
        started = true
        orderReasonLoading.value = false
      }
    })
    orderReasonSource.value = res.source
  } catch {
    /* 静默 */
  } finally {
    orderReasonLoading.value = false
  }
}

async function loadPitch(): Promise<void> {
  if (aiPitch.value || pitchLoading.value || !diagnosis.value) return
  pitchLoading.value = true
  let started = false
  try {
    const res = await streamGenerate('pitch', diagnosis.value.id, (delta) => {
      aiPitch.value += delta
      if (!started) {
        started = true
        pitchLoading.value = false
      }
    })
    pitchSource.value = res.source
  } catch {
    /* 静默 */
  } finally {
    pitchLoading.value = false
  }
}

/** 补货算法推导（⑳，懒加载：点开才请求，展示逐步算式） */
const forecast = ref<Forecast | null>(null)
const forecastLoading = ref<boolean>(false)
const forecastOpen = ref<boolean>(false)
const forecastError = ref<string>('')

async function toggleForecast(): Promise<void> {
  forecastOpen.value = !forecastOpen.value
  if (!forecastOpen.value || forecast.value || forecastLoading.value || !diagnosis.value) return
  forecastLoading.value = true
  try {
    forecast.value = await fetchForecast(diagnosis.value.id)
  } catch (e) {
    // 不静默吞错：算法推导是「数字可溯源」的加分项，取不到要让用户知道
    forecastError.value = e instanceof Error ? e.message : '算法推导加载失败'
  } finally {
    forecastLoading.value = false
  }
}

/**
 * 加载诊断。
 * 兼容两种入参：诊断 id（D_S3 / D_UNKNOWN_xxx）或巡店 id（V_S3_001）。
 */
async function load(): Promise<void> {
  loading.value = true
  loadError.value = false
  const id = String(route.params.id ?? '')
  try {
    if (id.startsWith('V_')) {
      const res = await getVisit(id)
      diagnosis.value = res.diagnosis ?? null
    } else {
      const res = await getDiagnosis(id)
      diagnosis.value = res.diagnosis
    }
    if (!diagnosis.value) loadError.value = true
    if (diagnosis.value) {
      // 整改回执一并拉取（刷新后仍能看到历史留证，服务端持久化）
      void loadRectifications()
      // 非只读态进入诊断页：自动流式生成一次「AI 巡店小结」（只读历史态不触发任何生成请求）
      if (!readonly.value && !summaryAutoTried.value) {
        summaryAutoTried.value = true
        void loadAiSummary()
      }
    }
  } catch {
    loadError.value = true
    toast.error('未检测到蒙牛陈列区域，请重拍')
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => route.params.id, load)

/* ═══════════════ C 标注图状态（hover 高亮 + 触屏锁定） ═══════════════ */

/** 图层筛选 */
const layerFilter = ref<'all' | AnnotationLayer>('all')
/** 是否显示拖拽对比滑块 */
const compare = ref<boolean>(true)
/** hover 联动：当前悬停标注框（鼠标离开即清空） */
const hoverAnnoIds = ref<string[]>([])
/** hover 联动：当前悬停问题 */
const hoverIssueIds = ref<string[]>([])
/** 触屏点选锁定的问题 / 标注（再点一次取消） */
const lockedIssueId = ref<string | null>(null)
const lockedAnnoIds = ref<string[]>([])

/** 实际下发给标注图的高亮 id = hover 临时态 ∪ 锁定态 */
const highlightIds = computed<string[]>(() =>
  Array.from(new Set([...hoverAnnoIds.value, ...lockedAnnoIds.value])),
)
/** 实际下发给问题清单的高亮 issue id */
const highlightIssueIds = computed<string[]>(() => {
  const set = new Set(hoverIssueIds.value)
  if (lockedIssueId.value) set.add(lockedIssueId.value)
  return [...set]
})

/** 图例项（按本图出现过的图层生成，样式唯一出处 ANNOTATION_STYLES） */
const legendItems = computed(() => {
  const set = new Set((diagnosis.value?.annotations ?? []).map((a) => a.layer))
  return Object.keys(ANNOTATION_STYLES)
    .filter((k) => set.has(k as AnnotationLayer))
    .map((k) => ANNOTATION_STYLES[k as AnnotationLayer])
})

/** 筛选出可见标注后的数量 */
const visibleCount = computed<number>(() => {
  const d = diagnosis.value
  if (!d) return 0
  return layerFilter.value === 'all'
    ? d.annotations.length
    : d.annotations.filter((a) => a.layer === layerFilter.value).length
})

/* ═══════════════ 区块联动（对话 → 行动方案） ═══════════════ */

/** 需要闪烁的区块 key */
const flashKey = ref<string>('')

/**
 * 滚动到指定区块并闪烁一下。
 *
 * @param key 区块 id
 */
async function scrollToSection(key: string): Promise<void> {
  await nextTick()
  flashKey.value = key
  const el = document.getElementById(`sec-${key}`)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  setTimeout(() => (flashKey.value = ''), 1600)
}

/** ChatPanel 请求高亮某区块 */
function onHighlight(section: 'plan' | 'risk'): void {
  scrollToSection(section)
}

/** 问题清单 hover → 高亮标注框（仅临时态，不影响触屏锁定） */
function onIssueHover(ids: string[]): void {
  hoverAnnoIds.value = ids
}

/**
 * 标注图 hover → 反向高亮问题清单（双向联动）。
 * 同时把同一问题下的兄弟标注也点亮，形成「框↔框↔问题」整簇联动。
 *
 * @param ids 当前悬停的标注 id 集合
 */
function onAnnoHover(ids: string[]): void {
  const d = diagnosis.value
  if (!d || !ids.length) {
    hoverIssueIds.value = []
    hoverAnnoIds.value = []
    return
  }
  const linked = (d.issues ?? []).filter((i) =>
    (i.relatedAnnotationIds ?? []).some((aid) => ids.includes(aid)),
  )
  hoverIssueIds.value = linked.map((i) => i.id)
  const cluster = new Set<string>()
  linked.forEach((i) => (i.relatedAnnotationIds ?? []).forEach((aid) => cluster.add(aid)))
  hoverAnnoIds.value = [...cluster]
}

/** 问题卡点按（触屏 / 单击）：切换该问题的锁定高亮 */
function onIssueSelect(issue: Issue): void {
  if (lockedIssueId.value === issue.id) {
    lockedIssueId.value = null
    lockedAnnoIds.value = []
    return
  }
  lockedIssueId.value = issue.id
  lockedAnnoIds.value = issue.relatedAnnotationIds ?? []
}

/** 标注框点按：反查关联问题并锁定（再点同一簇取消） */
function onAnnoSelect(ids: string[]): void {
  const d = diagnosis.value
  if (!d || !ids.length) return
  const linked = (d.issues ?? []).filter((i) =>
    (i.relatedAnnotationIds ?? []).some((aid) => ids.includes(aid)),
  )
  if (!linked.length) return
  const first = linked[0]
  if (lockedIssueId.value === first.id) {
    lockedIssueId.value = null
    lockedAnnoIds.value = []
    return
  }
  lockedIssueId.value = first.id
  const cluster = new Set<string>()
  linked.forEach((i) => (i.relatedAnnotationIds ?? []).forEach((aid) => cluster.add(aid)))
  lockedAnnoIds.value = [...cluster]
}

/* ═══════════════ D 问题清单动作 ═══════════════ */

/** 整改回执弹层：当前待整改的问题 */
const rectifyIssue = ref<Issue | null>(null)
/** 该诊断下的整改回执列表（刷新后仍在，服务端可溯源） */
const rectifications = ref<Rectification[]>([])
/** 回执加载中 */
const rectLoading = ref<boolean>(false)

/** 拉取该诊断的整改回执（进入页面 / 提交成功后都刷新一次） */
async function loadRectifications(): Promise<void> {
  if (!diagnosis.value) return
  rectLoading.value = true
  try {
    const res = await getRectifications({ diagnosisId: diagnosis.value.id, limit: 20 })
    rectifications.value = res.rectifications ?? []
  } catch {
    // 拉取失败保持空列表（对比区显示引导文案），不打断主流程
    rectifications.value = []
  } finally {
    rectLoading.value = false
  }
}

/** 已留证的问题 id 集合（用于问题卡置灰态） */
const rectifiedIssueIds = computed<Set<string>>(
  () => new Set(rectifications.value.map((r) => r.issueId).filter(Boolean)),
)

/**
 * 「查看竞争话术」：真复制到剪贴板。
 * 优先用已生成的给店主话术（aiPitch）；未生成时用问题本身拼一段可直接发的口语稿。
 * 剪贴板 API 不可用 / 被拒时降级 window.prompt 长按复制；只有成功才 toast「已复制」。
 */
async function copyIssuePitch(issue: Issue): Promise<void> {
  const fallback = `老板，跟您说个事：${issue.location}这边，${issue.title}。${
    issue.impact ? `${issue.impact}。` : ''
  }按这位置现在的动销，一周下来损失不小；咱们把蒙牛产品补回黄金列位，我帮您一起摆好，卖不动您找我。`
  const text = aiPitch.value?.trim() || fallback
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      toast.success('竞争话术已复制，可直接粘贴发给店主')
      return
    }
    throw new Error('clipboard-api-unavailable')
  } catch {
    window.prompt('自动复制未成功，请长按全选下方话术手动复制：', text)
    toast.info('请在弹窗中长按选择并复制话术')
  }
}

/** 问题快捷动作 */
function onIssueAction(payload: { issue: Issue; action: string }): void {
  const { issue, action } = payload
  if (action.includes('已处理')) {
    // ★ 真闭环：打开整改回执弹层 → 留证 → 后端算分落库（不再只弹 Toast）
    rectifyIssue.value = issue
  } else if (action.includes('补货')) {
    toast.info(`已加入行动方案：${issue.title}`)
    scrollToSection('plan')
  } else if (action.includes('话术')) {
    void copyIssuePitch(issue)
  } else {
    toast.success(`已记录：${action}`)
  }
}

/** 整改回执提交成功 → 刷新回执列表（问题卡随即变为已处理态） */
async function onRectified(_rect: Rectification): Promise<void> {
  await loadRectifications()
}

/* ═══════════════ H 行动栏：整改单 / 订货建议 ═══════════════ */

/** 单据状态：none 无 / preview 预览 / success 提交成功 */
const ticketState = ref<'none' | 'preview' | 'success'>('none')
/** 单据类型 */
const ticketKind = ref<'rectification' | 'order'>('rectification')
/** 生成的单据 */
const ticket = ref<Ticket | null>(null)
/** 提交中 */
const submitting = ref<boolean>(false)

/** 预览弹层显隐（供 useDialogFocus 监听；成功层为停留式覆盖层而非自动消失 toast，同样按对话框处理） */
const previewVisible = computed<boolean>(() => ticketState.value === 'preview')
const successVisible = computed<boolean>(() => ticketState.value === 'success')
/** 单据预览弹层：Esc / 焦点陷阱 / 关闭后焦点回归触发按钮 */
const { panelRef: previewPanelRef } = useDialogFocus({
  visible: previewVisible,
  onClose: () => {
    ticketState.value = 'none'
  },
})
/** 提交成功覆盖层：Esc 等同「查看方案」回到页面 */
const { panelRef: successPanelRef } = useDialogFocus({
  visible: successVisible,
  onClose: () => {
    ticketState.value = 'none'
  },
})

/** 是否已在历史路线中标记该店完成（返回 P2 时带上闪光参数） */
const storeIdList = computed<string>(() => diagnosis.value?.storeId ?? '')

/** 生成单据（点击底部按钮 → 打开预览；订货单初始化可编辑数量） */
function openTicket(kind: 'rectification' | 'order'): void {
  ticketKind.value = kind
  ticketState.value = 'preview'
  if (kind === 'order' && diagnosis.value) {
    const draft: Record<string, number> = {}
    diagnosis.value.plan.restock.forEach((r) => {
      draft[r.skuId] = r.bottles
    })
    qtyDraft.value = draft
  }
}

/** 订货预览里的临时数量（真 stepper，可 −/+） */
const qtyDraft = ref<Record<string, number>>({})

/** 各 SKU 单价（由建议明细反推，调整数量后金额同步） */
const unitPrice = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  diagnosis.value?.plan.restock.forEach((r) => {
    map[r.skuId] = r.bottles > 0 ? Math.round((r.amount / r.bottles) * 100) / 100 : r.amount
  })
  return map
})

/** 预览明细：订货单取 stepper 数量，整改单沿用方案（只读） */
const previewItems = computed<RestockItem[]>(() => {
  const d = diagnosis.value
  if (!d) return []
  if (ticketKind.value !== 'order') return d.plan.restock.map((r) => ({ ...r }))
  return d.plan.restock.map((r) => {
    const bottles = qtyDraft.value[r.skuId] ?? r.bottles
    const price = unitPrice.value[r.skuId] ?? 0
    return {
      skuId: r.skuId,
      skuName: r.skuName,
      bottles,
      amount: Math.round(bottles * price * 100) / 100,
    }
  })
})

const previewTotalBottles = computed<number>(() => previewItems.value.reduce((s, r) => s + r.bottles, 0))
const previewTotalAmount = computed<number>(() => previewItems.value.reduce((s, r) => s + r.amount, 0))

/** stepper 调整数量（0–99 瓶） */
function stepQty(skuId: string, delta: number): void {
  const cur = qtyDraft.value[skuId] ?? 0
  qtyDraft.value = { ...qtyDraft.value, [skuId]: Math.max(0, Math.min(99, cur + delta)) }
}

/** 提交单据 */
async function submitTicket(): Promise<void> {
  if (!diagnosis.value || submitting.value) return
  submitting.value = true
  try {
    const plan = diagnosis.value.plan
    const items: RestockItem[] = previewItems.value
    const placements = plan.placement.map((p) => ({ ...p }))
    // 合计：订货单跟随 stepper 实时数量；整改单沿用行动方案权威值
    const totalBottles = ticketKind.value === 'order' ? previewTotalBottles.value : plan.totalBottles
    const totalAmount = ticketKind.value === 'order' ? previewTotalAmount.value : plan.totalAmount
    const note =
      ticketKind.value === 'order'
        ? `按 AI 行动方案生成订货建议，覆盖 ${plan.coverDays} 天动销。`
        : `按 AI 行动方案生成整改单：补货 ${plan.totalBottles} 瓶、陈列调整 ${placements.length} 项，请于本周五前完成，届时复查预计 ${diagnosis.value.health.expectedScore} 分。`

    const res = await createTicket({
      kind: ticketKind.value,
      storeId: diagnosis.value.storeId,
      items,
      placements,
      note,
      totalBottles,
      totalAmount,
    })
    ticket.value = res.ticket
    ticketState.value = 'success'
    toast.success('流程已完成')
  } catch {
    toast.error('生成失败，请重试')
  } finally {
    submitting.value = false
  }
}

/** 返回今日巡店（带完成回写参数 → P2 绿色闪光） */
function backToToday(): void {
  router.replace({ path: '/rep/today', query: { done: storeIdList.value } })
}

/** 重新诊断（换张照片再跑一次） */
function reCapture(): void {
  router.push(`/rep/capture/${diagnosis.value?.storeId ?? 'S3'}`)
}

/* ═══════════════ 展示用计算属性 ═══════════════ */

const health = computed(() => diagnosis.value?.health ?? null)
const issues = computed<Issue[]>(() => diagnosis.value?.issues ?? [])
const severityCounts = computed(() => countBySeverity(issues.value))
/** 预期提升分差 */
const expectedDelta = computed<number>(() => {
  if (!health.value) return 0
  return health.value.expectedScore - health.value.score
})
/** 是否已加载完成（逐块淡入） */
const ready = computed<boolean>(() => !loading.value && !!diagnosis.value)

/* ═══════════════ 米勒分块：sticky 四段锚点 ═══════════════ */

const anchorItems = computed(() => [
  { key: 'overview', label: '概览' },
  { key: 'issue', label: `问题(${issues.value.length})` },
  { key: 'plan', label: '方案' },
  { key: 'chat', label: '追问' },
])
const activeAnchor = ref<string>('overview')

/** 点击锚点：平滑滚动定位（scroll-margin-top 避开 sticky 条） */
function scrollAnchor(key: string): void {
  activeAnchor.value = key
  document.getElementById(`sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** 滚动时自动高亮当前分区（IntersectionObserver，root 取手机壳内滚动容器） */
let anchorObserver: IntersectionObserver | null = null
function setupAnchorObserver(): void {
  anchorObserver?.disconnect()
  const root = document.getElementById('sec-overview')?.closest('.ml-body')
  if (!root || typeof IntersectionObserver === 'undefined') return
  anchorObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) activeAnchor.value = visible[0].target.id.replace('sec-', '')
    },
    { root: root as Element, rootMargin: '-56px 0px -68% 0px', threshold: 0 },
  )
  anchorItems.value.forEach((a) => {
    const el = document.getElementById(`sec-${a.key}`)
    if (el) anchorObserver?.observe(el)
  })
}
watch(
  ready,
  async (v) => {
    if (!v) return
    await nextTick()
    setupAnchorObserver()
  },
  { immediate: true },
)

onBeforeUnmount(() => anchorObserver?.disconnect())

/* ═══════════════ B 健康分：六维默认只露最弱 2 维 ═══════════════ */

const dimsExpanded = ref<boolean>(false)
/** 按分数升序取最弱 2 维（米勒 7±2：先给最该关注的） */
const visibleDims = computed(() => {
  const dims = diagnosis.value?.dimensions ?? []
  if (dimsExpanded.value) return dims
  return [...dims].sort((a, b) => a.score - b.score).slice(0, 2)
})

/* ═══════════════ H 底部双 CTA：1 主 1 次（健康分 <70 整改优先） ═══════════════ */

/** 健康分 <70：生成整改单为主；否则生成订货建议为主 */
const rectificationPrimary = computed<boolean>(() => (diagnosis.value?.health.score ?? 100) < 70)
</script>

<template>
  <MobileLayout
    :title="readonly ? '巡店历史详情' : '诊断结果'"
    :back="true"
    :content-padding-bottom="readonly ? 20 : 78"
    @back="router.push('/rep/today')"
  >
    <template #right>
      <span v-if="readonly" class="p4-history-tag">历史记录</span>
    </template>

    <!-- 加载骨架 -->
    <div v-if="loading" class="p4-loading">
      <SkeletonBlock height="120px" radius="12px" />
      <SkeletonBlock height="220px" radius="12px" />
      <SkeletonBlock height="160px" radius="12px" />
    </div>

    <!-- 空态兜底 -->
    <EmptyState
      v-else-if="loadError || !diagnosis"
      icon="x-circle"
      title="未检测到蒙牛陈列区域"
      desc="换个角度或走近一点再拍一张试试"
      action-text="重新拍照"
      @action="reCapture"
    />

    <div v-else class="p4">
      <!-- 米勒分块：sticky 四段锚点（概览 / 问题(n) / 方案 / 追问），点击平滑定位 -->
      <nav class="p4-anchors" aria-label="诊断页分区导航">
        <button
          v-for="a in anchorItems"
          :key="a.key"
          type="button"
          class="p4-anchor u-tap"
          :class="{ 'p4-anchor--on': activeAnchor === a.key }"
          :aria-current="activeAnchor === a.key ? 'true' : undefined"
          @click="scrollAnchor(a.key)"
        >
          {{ a.label }}
        </button>
      </nav>

      <!-- ══ A 顶部摘要条 ══ -->
      <div class="p4-summary u-animate-in">
        <div class="p4-summary__left">
          <p class="p4-summary__store">{{ diagnosis.storeName }}</p>
          <p class="p4-summary__meta">{{ diagnosis.createdAt }} · 第 {{ diagnosis.visitNo }} 次巡店</p>
        </div>
        <AiBadge text="AI 诊断" size="md" />
      </div>

      <!-- ══ B 健康分区块（锚点：概览） ══ -->
      <SectionCard id="sec-overview" class="p4-card u-animate-in" style="animation-delay: 80ms">
        <div class="p4-score">
          <ScoreRing :score="health?.score ?? 0" :color="health?.color" :size="106">
            <template #label>AI 健康分</template>
          </ScoreRing>

          <div class="p4-score__side">
            <div class="p4-score__badges">
              <HealthBadge :level="health?.level ?? 'good'" size="md" />
              <span class="p4-score__delta" :class="(health?.delta ?? 0) > 0 ? 'is-up' : (health?.delta ?? 0) < 0 ? 'is-down' : ''">
                {{ health?.delta === 0 ? '较上次 持平' : `较上次 ${(health?.delta ?? 0) > 0 ? '↑' : '↓'}${Math.abs(health?.delta ?? 0)}` }}
              </span>
            </div>
            <p class="p4-score__advice">{{ diagnosis.health.expectedScore }} 分目标 · {{ levelLabel(levelOf(diagnosis.health.expectedScore)) }}</p>

            <div class="p4-score__dims">
              <!-- 米勒分块：默认只展示最弱 2 维，需要时再展开全部 -->
              <DimensionBars :dimensions="visibleDims" />
              <button type="button" class="p4-dims-more u-tap" @click="dimsExpanded = !dimsExpanded">
                {{ dimsExpanded ? '收起维度' : `展开全部 ${diagnosis.dimensions.length} 维` }}
              </button>
            </div>
          </div>
        </div>

        <p class="p4-ai-line">
          <AiBadge text="AI 判断" />
          执行本页全部建议后，预计可提升至
          <b>{{ health?.expectedScore }}</b> 分（<b>+{{ expectedDelta }}</b>）
        </p>
      </SectionCard>

      <!-- ══ C AI 识别标注图 ══ -->
      <SectionCard
        id="sec-image"
        class="p4-card u-animate-in"
        :class="{ 'is-flash': flashKey === 'image' }"
        style="animation-delay: 160ms"
        title="AI 识别结果"
        ai
      >
        <template #action>
          <div class="p4-toggle">
            <button type="button" class="u-tap" :class="{ 'p4-toggle__on': compare }" @click="compare = true">对比拖拽</button>
            <button type="button" class="u-tap" :class="{ 'p4-toggle__on': !compare }" @click="compare = false">标注图</button>
          </div>
        </template>

        <CompareSlider
          v-if="compare"
          :src="diagnosis.photoUrl"
          :annotations="diagnosis.annotations"
          :filter="layerFilter"
          :highlight-ids="highlightIds"
          @hover="onAnnoHover"
          @select="onAnnoSelect"
        />
        <AnnotatedImage
          v-else
          :src="diagnosis.photoUrl"
          :annotations="diagnosis.annotations"
          :filter="layerFilter"
          :highlight-ids="highlightIds"
          :show-legend="false"
          @hover="onAnnoHover"
          @select="onAnnoSelect"
        />

        <!-- 常驻图例：无论对比模式还是标注图模式都可见（PRD 4.4-C） -->
        <div class="p4-legend">
          <span v-for="l in legendItems" :key="l.label" class="p4-legend__item">
            <i class="p4-legend__swatch" :class="{ 'p4-legend__swatch--dashed': l.dashed }" :style="{ '--c': l.color }" />
            {{ l.label }}
          </span>
        </div>

        <!-- 图层筛选 chips -->
        <div class="p4-chips">
          <button
            v-for="f in LAYER_FILTERS"
            :key="f.key"
            type="button"
            class="p4-chip u-tap"
            :class="{ 'p4-chip--on': layerFilter === f.key }"
            @click="layerFilter = f.key"
          >
            {{ f.label }}
          </button>
          <span class="p4-chips__count">共识别 {{ visibleCount }} 项</span>
        </div>

        <p class="p4-summary-text">{{ diagnosis.summary.text }}</p>
      </SectionCard>

      <!-- ══ D 问题清单 ══ -->
      <SectionCard
        id="sec-issue"
        class="p4-card u-animate-in"
        style="animation-delay: 240ms"
        :title="`问题清单（${issues.length}）`"
      >
        <template #action>
          <span class="p4-card__hint">
            按严重程度排序 · 严重 {{ severityCounts.severe }} / 中度 {{ severityCounts.medium }} / 轻度 {{ severityCounts.low }}
          </span>
        </template>
        <IssueList
          :issues="issues"
          :show-actions="!readonly"
          :highlight-issue-ids="highlightIssueIds"
          :locked-issue-id="lockedIssueId"
          :rectified-issue-ids="[...rectifiedIssueIds]"
          @hover="onIssueHover"
          @select="onIssueSelect"
          @action="onIssueAction"
        />
      </SectionCard>

      <!-- ══ D-b 整改前后对比（★ 整改留证闭环） ══ -->
      <SectionCard
        class="p4-card u-animate-in"
        style="animation-delay: 280ms"
        title="整改前后对比"
        ai
      >
        <template #action>
          <span class="p4-card__hint">留证后自动对比 · 可溯源算分</span>
        </template>
        <p v-if="rectLoading" class="p4-ai-loading">正在加载整改记录…</p>
        <RectificationCompare
          v-else
          :before-url="diagnosis.photoUrl"
          :records="rectifications"
          :readonly="readonly"
        />
      </SectionCard>

      <!-- ══ E 风险预判 ══ -->
      <div id="sec-risk" class="u-animate-in" :class="{ 'is-flash': flashKey === 'risk' }" style="animation-delay: 320ms">
        <RiskCard :risk="diagnosis.risk" />
      </div>

      <!-- ══ G 千店千面行动方案（锚点：方案） ══ -->
      <SectionCard
        id="sec-plan"
        class="p4-card u-animate-in"
        :class="{ 'is-flash': flashKey === 'plan' }"
        style="animation-delay: 400ms"
        title="千店千面行动方案"
        ai
      >
        <template #action>
          <span class="p4-card__hint">{{ diagnosis.plan.storeTypeLabel }}</span>
        </template>
        <ActionPlan :plan="diagnosis.plan" :show-actions="!readonly" @adjust="openTicket('order')" @order="openTicket('order')" />
      </SectionCard>

      <!-- ══ F AI 追问对话（锚点：追问；放在方案之后，追问回答引用方案时上下文连贯） ══ -->
      <SectionCard id="sec-chat" class="p4-card u-animate-in" style="animation-delay: 480ms" title="继续追问 AI" ai>
        <ChatPanel :diagnosis="diagnosis" :readonly="readonly" @highlight="onHighlight" />
      </SectionCard>

      <!-- ══ 米勒分块：次级 AI 分析默认折叠（工作链 / 算法推导 / 三张 AI 文案卡） ══ -->
      <details class="p4-more">
        <summary class="p4-more__sum">
          <span>更多 AI 分析</span>
          <span class="p4-more__hint">工作链 · 算法推导 · 小结与话术</span>
        </summary>
        <div class="p4-more__body">
          <!-- B+ AI 工作链：视觉→MCP→六维→预测→LLM（真实执行轨迹） -->
          <AgentChain v-if="diagnosis.agentTrace?.length" :steps="diagnosis.agentTrace" />

          <!-- ⑳ 补货算法推导（数字溯源，点开看算式） -->
          <SectionCard class="p4-card" title="补货算法推导">
            <template #action>
              <span class="p4-card__hint">动态安全库存 z·σ·√L</span>
            </template>

            <button type="button" class="p4-ai-btn p4-ai-btn--block u-tap" @click="toggleForecast">
              <AppIcon name="clipboard" :size="14" />
              {{ forecastOpen ? '收起推导过程' : '这 12 瓶是怎么算出来的？' }}
            </button>

            <div v-if="forecastOpen" class="p4-fc">
              <p v-if="forecastLoading" class="p4-ai-loading">正在按动销与安全库存测算…</p>
              <p v-else-if="forecastError" class="p4-fc__error">推导加载失败：{{ forecastError }}</p>
              <template v-else-if="forecast">
                <p class="p4-fc__params">
                  服务水平 {{ (forecast.params.serviceZ ?? 0) === 1.28 ? '90%' : '—' }}（z={{ forecast.params.serviceZ }}）
                  · 变异系数 σ={{ forecast.params.cvSigma }} · 补货周期 {{ forecast.params.leadTimeDays }} 天
                  · 铺货 {{ forecast.params.coverDays }} 天
                </p>
                <div v-for="l in forecast.lines" :key="l.skuName" class="p4-fc__item">
                  <p class="p4-fc__title">
                    {{ l.skuName }}
                    <span class="p4-fc__num">建议 {{ l.suggestBottles }} 瓶</span>
                  </p>
                  <ol class="p4-fc__steps">
                    <li v-for="(st, i) in l.steps" :key="i">{{ st }}</li>
                  </ol>
                </div>
                <p class="p4-fc__summary">{{ forecast.summary }}</p>
                <p class="p4-fc__note">{{ forecast.coverage.note }}</p>
              </template>
            </div>
          </SectionCard>

          <!-- ══ 订货建议理由（A2：角标按真实来源，fallback 不标 AI；只读态无文案则整块不渲染、不显示生成按钮） ══ -->
          <SectionCard
            v-if="!readonly || aiOrderReason"
            class="p4-card"
            title="为什么这样订货"
            :ai="orderReasonSource !== undefined"
            :ai-text="orderReasonSource === undefined ? '' : aiBadgeOf(orderReasonSource).text"
          >
            <p v-if="orderReasonLoading" class="p4-ai-loading">AI 正在生成订货理由…</p>
            <p v-else-if="aiOrderReason" class="p4-ai-text">{{ aiOrderReason }}</p>
            <button v-else-if="!readonly" type="button" class="p4-ai-btn u-tap" @click="loadOrderReason"><AppIcon name="sparkles" :size="14" /> 生成订货建议理由</button>
          </SectionCard>

          <!-- ══ AI 巡店小结（A2：角标按真实来源；非只读态进入页面自动流式生成，只读态仅展示已有文案） ══ -->
          <SectionCard
            v-if="!readonly || aiSummary"
            class="p4-card"
            title="AI 巡店小结"
            :ai="summarySource !== undefined"
            :ai-text="summarySource === undefined ? '' : aiBadgeOf(summarySource).text"
          >
            <p v-if="summaryLoading" class="p4-ai-loading">AI 正在生成巡店小结…</p>
            <p v-else-if="aiSummary" class="p4-ai-text">{{ aiSummary }}</p>
            <button v-else-if="!readonly" type="button" class="p4-ai-btn u-tap" @click="loadAiSummary"><AppIcon name="sparkles" :size="14" /> 生成巡店小结</button>
          </SectionCard>

          <!-- ══ 给店主的话术（A2：角标按真实来源；问题卡「查看竞争话术」复制的就是这段；只读态无文案不渲染） ══ -->
          <SectionCard
            v-if="!readonly || aiPitch"
            class="p4-card"
            title="给店主的话术"
            :ai="pitchSource !== undefined"
            :ai-text="pitchSource === undefined ? '' : aiBadgeOf(pitchSource).text"
          >
            <p v-if="pitchLoading" class="p4-ai-loading">AI 正在生成话术…</p>
            <p v-else-if="aiPitch" class="p4-ai-text">{{ aiPitch }}</p>
            <button v-else-if="!readonly" type="button" class="p4-ai-btn u-tap" @click="loadPitch"><AppIcon name="sparkles" :size="14" /> 生成给店主的话术</button>
          </SectionCard>
        </div>
      </details>

      <p class="p4-foot">✦ 本页由 AI 诊断生成：排面/竞品来自拍照识别 · 期效/库存来自进销存批次同步 · 断网可离线复现</p>
    </div>

    <!-- ══ 整改回执弹层（问题「已处理」→ 留证 → 后端算分） ══ -->
    <RectificationDialog
      v-if="diagnosis"
      :visible="!!rectifyIssue"
      :diagnosis="diagnosis"
      :issue="rectifyIssue"
      @close="rectifyIssue = null"
      @done="onRectified"
    />

    <!-- ══ H 底部悬浮行动栏（只读态隐藏）：健康分 <70 整改为主，否则订货为主 ══ -->
    <template #footer>
      <div v-if="!readonly && ready" class="p4-bar">
        <button
          type="button"
          class="p4-bar__btn mot-tap"
          :class="rectificationPrimary ? 'p4-bar__btn--primary p4-bar__btn--rect' : 'p4-bar__btn--ghost'"
          @click="openTicket('rectification')"
        >
          <AppIcon name="clipboard" :size="15" :color="rectificationPrimary ? '#fff' : 'var(--text-2)'" />
          生成整改单
        </button>
        <button
          type="button"
          class="p4-bar__btn mot-tap"
          :class="rectificationPrimary ? 'p4-bar__btn--ghost' : 'p4-bar__btn--primary p4-bar__btn--order'"
          @click="openTicket('order')"
        >
          <AppIcon name="cart" :size="15" :color="rectificationPrimary ? 'var(--text-2)' : '#fff'" />
          生成订货建议
        </button>
      </div>
    </template>

    <!-- ══ 单据预览 / 成功 ══ -->
    <div v-if="ticketState === 'preview'" class="p4-mask" @click.self="ticketState = 'none'">
      <div
        ref="previewPanelRef"
        class="p4-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="p4-ticket-preview-title"
      >
        <p id="p4-ticket-preview-title" class="p4-sheet__title">
          {{ ticketKind === 'order' ? '订货建议预览' : '整改单预览' }}
        </p>
        <div class="p4-sheet__store">{{ diagnosis?.storeName }}</div>

        <div v-if="previewItems.length" class="p4-sheet__sec">
          <p class="p4-sheet__cap">
            {{ ticketKind === 'order' ? '订货明细（数量可 −/+ 调整）' : '需补齐' }}
          </p>
          <div v-for="r in previewItems" :key="r.skuId" class="p4-sheet__row">
            <span>{{ r.skuName }}</span>
            <span v-if="ticketKind === 'order'" class="p4-sheet__stepper">
              <button
                type="button"
                class="p4-sheet__step u-tap"
                aria-label="减少 1 瓶"
                @click="stepQty(r.skuId, -1)"
              >
                −
              </button>
              <b>{{ r.bottles }} 瓶</b>
              <button
                type="button"
                class="p4-sheet__step u-tap"
                aria-label="增加 1 瓶"
                @click="stepQty(r.skuId, 1)"
              >
                +
              </button>
            </span>
            <b v-else>{{ r.bottles }} 瓶</b>
            <em v-if="ticketKind === 'order'">¥{{ r.amount }}</em>
          </div>
        </div>
        <div v-if="ticketKind === 'rectification' && diagnosis?.plan.placement.length" class="p4-sheet__sec">
          <p class="p4-sheet__cap">陈列调整</p>
          <p v-for="(p, i) in diagnosis.plan.placement" :key="i" class="p4-sheet__text">· {{ p.text }}</p>
        </div>

        <div class="p4-sheet__total">
          <span>{{ ticketKind === 'order' ? '合计' : '共需补货' }}</span>
          <b>
            {{ ticketKind === 'order' ? previewTotalBottles : diagnosis?.plan.totalBottles }} 瓶<template
              v-if="ticketKind === 'order'"
            > · ¥{{ previewTotalAmount }}</template>
          </b>
        </div>
        <p class="p4-sheet__note">
          {{ ticketKind === 'order' ? `预计覆盖 ${diagnosis?.plan.coverDays} 天动销` : `复查预计 ${diagnosis?.health.expectedScore} 分，请于本周五前完成` }}
        </p>

        <div class="p4-sheet__btns">
          <button type="button" class="u-btn u-btn--ghost u-tap" @click="ticketState = 'none'">返回修改</button>
          <button type="button" class="u-btn u-btn--primary u-tap" :disabled="submitting" @click="submitTicket">
            {{ submitting ? '提交中…' : '确认提交' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 提交成功页（停留式覆盖层，需用户主动操作，按对话框而非 toast 处理） -->
    <div
      v-if="ticketState === 'success'"
      ref="successPanelRef"
      class="p4-success"
      role="dialog"
      aria-modal="true"
      aria-labelledby="p4-ticket-success-title"
    >
      <div class="p4-success__icon" aria-hidden="true"><AppIcon name="check" :size="30" color="#fff" /></div>
      <p id="p4-ticket-success-title" class="p4-success__title">{{ ticketKind === 'order' ? '订货建议已生成' : '整改单已生成' }}</p>
      <p class="p4-success__id">单号 {{ ticket?.id }}</p>

      <div class="p4-success__card">
        <p class="p4-success__store">{{ ticket?.storeName }}</p>
        <div v-for="r in ticket?.items ?? []" :key="r.skuId" class="p4-success__row">
          <span>{{ r.skuName }}</span>
          <b>{{ r.bottles }} 瓶<template v-if="ticketKind === 'order'"> · ¥{{ r.amount }}</template></b>
        </div>
        <div v-if="ticketKind === 'rectification'" class="p4-success__row">
          <span>陈列调整</span>
          <b>{{ ticket?.placements.length ?? 0 }} 项</b>
        </div>
        <div class="p4-success__total">
          <span>{{ ticketKind === 'order' ? '合计' : '共需补货' }}</span>
          <b>{{ ticket?.totalBottles }} 瓶<template v-if="ticketKind === 'order'"> · ¥{{ ticket?.totalAmount }}</template></b>
        </div>
        <p class="p4-success__tip">{{ ticketKind === 'order' ? '李强将在 2 小时内与你联系确认订单' : '请按单整改，本周五前完成并回传照片' }}</p>
      </div>

      <div class="p4-success__btns">
        <button type="button" class="u-btn u-btn--ghost u-tap" @click="ticketState = 'none'">查看方案</button>
        <button type="button" class="u-btn u-btn--primary u-tap" @click="backToToday">返回今日巡店</button>
      </div>
    </div>
  </MobileLayout>
</template>

<style scoped>
.p4-history-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-size: 11px;
  font-weight: 600;
}

.p4-loading {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 12px;
}

.p4 {
  padding: 12px 12px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* sticky 四段锚点（米勒分块：首屏一屏可数，点击平滑跳转） */
.p4-anchors {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  gap: 6px;
  /* 负边距出血到屏幕两边，背景遮住下方滚动内容 */
  margin: 0 -12px;
  padding: 8px 12px;
  background: var(--bg-page);
}

.p4-anchor {
  flex: 1;
  min-height: 36px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  transition:
    background-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard);
}

.p4-anchor--on {
  border-color: var(--mn-green);
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
}

/* 锚点定位时避开 sticky 条 */
.p4 [id^='sec-'] {
  scroll-margin-top: 56px;
}

/* 六维「展开全部」 */
.p4-dims-more {
  margin-top: 6px;
  padding: 0;
  border: none;
  background: none;
  color: var(--ai-purple);
  font-size: 11.5px;
  font-weight: 600;
}

/* 「更多 AI 分析」折叠区：默认收起，降低首屏信息密度（7±2） */
.p4-more {
  border-radius: var(--radius-card);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
}

.p4-more__sum {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 44px;
  padding: 10px 14px;
  border-radius: var(--radius-card);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-1);
  cursor: pointer;
  list-style: none;
}

.p4-more__sum::-webkit-details-marker {
  display: none;
}

.p4-more__sum::after {
  content: '▸';
  flex: none;
  color: var(--text-3);
  transition: transform var(--dur-base) var(--ease-standard);
}

.p4-more[open] .p4-more__sum::after {
  transform: rotate(90deg);
}

.p4-more__hint {
  flex: 1;
  font-size: 11px;
  font-weight: 400;
  color: var(--text-3);
  text-align: right;
}

.p4-more__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 2px 12px 12px;
}

.p4-card {
  margin-bottom: 0;
}

.p4-card__hint {
  font-size: 11px;
  color: var(--text-3);
}

/* A 摘要条 */
.p4-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-card);
  background: linear-gradient(135deg, var(--mn-green) 0%, var(--mn-green-dark) 100%);
  color: #fff;
}

.p4-summary__store {
  font-size: 15px;
  font-weight: 700;
}

.p4-summary__meta {
  margin-top: 2px;
  font-size: 11px;
  opacity: 0.82;
}

/* B 健康分 */
.p4-score {
  display: flex;
  gap: 14px;
  align-items: center;
}

.p4-score__side {
  flex: 1;
  min-width: 0;
}

.p4-score__badges {
  display: flex;
  align-items: center;
  gap: 6px;
}

.p4-score__delta {
  font-size: 11px;
  color: var(--text-3);
}

.p4-score__delta.is-up {
  color: var(--mn-green);
}

.p4-score__delta.is-down {
  color: var(--level-risk);
}

.p4-score__advice {
  margin: 4px 0 8px;
  font-size: 11px;
  color: var(--text-3);
}

.p4-ai-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--ai-purple-light);
  color: var(--text-1);
  font-size: 12px;
  line-height: 1.6;
}

.p4-ai-line b {
  color: var(--ai-purple);
  font-weight: 700;
}

/* C 标注图 */
.p4-toggle {
  display: inline-flex;
  padding: 2px;
  border-radius: 999px;
  background: var(--bg-page);
}

.p4-toggle button {
  min-width: 56px;
  height: 24px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 600;
}

.p4-toggle__on {
  background: var(--mn-green) !important;
  color: #fff !important;
}

.p4-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-2);
}

.p4-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.p4-legend__swatch {
  width: 14px;
  height: 0;
  border-top: 2px solid var(--c);
}

.p4-legend__swatch--dashed {
  border-top-style: dashed;
}

.p4-chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.p4-chip {
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: #fff;
  color: var(--text-2);
  font-size: 11.5px;
}

.p4-chip--on {
  border-color: var(--mn-green);
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-weight: 600;
}

.p4-chips__count {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
}

.p4-summary-text {
  margin-top: 8px;
  padding: 7px 9px;
  border-radius: 8px;
  background: var(--ai-purple-light);
  color: var(--ai-purple);
  font-size: 11.5px;
  line-height: 1.6;
}

.p4-ai-text {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-1);
  white-space: pre-wrap;
}

.p4-ai-loading {
  font-size: 13px;
  color: var(--text-3);
  padding: 8px 0;
}

.p4-ai-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 14px;
  border: 1px dashed var(--ai-purple);
  border-radius: 10px;
  background: var(--ai-purple-light, #f1ebff);
  color: var(--ai-purple);
  font-size: 13px;
  font-weight: 600;
}

.p4-ai-btn--block {
  display: flex;
  width: 100%;
  justify-content: center;
}

.p4-fc {
  margin-top: 10px;
  padding: 10px 11px;
  border-radius: 10px;
  background: #f7faf8;
  border: 1px solid #e8efe9;
}

.p4-fc__params {
  margin: 0 0 8px;
  font-size: 11.5px;
  color: var(--text-3);
}

.p4-fc__item {
  margin-bottom: 10px;
}

.p4-fc__title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.p4-fc__num {
  font-size: 12px;
  font-weight: 700;
  color: var(--mn-green, #009639);
}

.p4-fc__steps {
  margin: 0;
  padding-left: 18px;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--text-2);
}

.p4-fc__summary {
  margin: 8px 0 0;
  padding-top: 8px;
  border-top: 1px dashed #dfe8e1;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-2);
}

.p4-fc__note {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--text-3);
}

.p4-foot {
  padding: 6px 0 10px;
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
}

/* H 底部行动栏 */
.p4-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  display: flex;
  gap: 8px;
  /* 底部安全区：全面屏手势条不压按钮（env 桌面机壳内为 0，不影响演示） */
  padding: 10px 12px calc(12px + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, rgba(245, 247, 245, 0) 0%, var(--bg-page) 42%);
}

.p4-bar__btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 46px;
  padding: 0 10px;
  border-radius: 23px;
  font-size: 14px;
  font-weight: 700;
}

/* 主按钮约占 60%，实心；次按钮约占 40%，白底描边去阴影（希克定律：唯一主行动） */
.p4-bar__btn--primary {
  flex: 1.5;
  border: none;
  color: #fff;
}

.p4-bar__btn--rect {
  background: #007a30;
}

.p4-bar__btn--rect:hover {
  background: #00752e;
}

.p4-bar__btn--order {
  background: linear-gradient(135deg, var(--ai-purple) 0%, var(--ai-purple-2) 100%);
}

.p4-bar__btn--ghost {
  flex: 1;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  box-shadow: none;
  color: var(--text-2);
  font-weight: 600;
}

/* 闪烁联动 */
.is-flash {
  animation: sec-flash 1.5s ease;
}

@keyframes sec-flash {
  0%,
  100% {
    box-shadow: var(--shadow-card);
  }
  35% {
    box-shadow: 0 0 0 3px rgba(109, 59, 245, 0.28);
  }
}

/* 单据预览 */
.p4-mask {
  position: absolute;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.42);
}

.p4-sheet {
  width: 100%;
  max-height: 82%;
  overflow-y: auto;
  padding: 16px 14px 18px;
  border-radius: 16px 16px 0 0;
  background: #fff;
}

.p4-sheet__title {
  font-size: 16px;
  font-weight: 700;
}

.p4-sheet__store {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-3);
}

.p4-sheet__sec {
  margin-top: 12px;
}

.p4-sheet__cap {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-2);
}

.p4-sheet__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border-color);
  font-size: 13px;
}

.p4-sheet__row span {
  flex: 1;
}

.p4-sheet__row em {
  width: 56px;
  text-align: right;
  font-style: normal;
  font-weight: 700;
}

/* 真数量 stepper：− 数量 +（视觉 28px，.u-tap 外扩到 44px 命中盒） */
.p4-sheet__stepper {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.p4-sheet__stepper b {
  min-width: 52px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.p4-sheet__step {
  width: 28px;
  height: 28px;
  border: 1px solid var(--mn-green);
  border-radius: 50%;
  background: var(--bg-card);
  color: var(--mn-green-dark);
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
}

.p4-sheet__text {
  font-size: 12px;
  line-height: 1.8;
  color: var(--text-2);
}

.p4-sheet__total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--mn-green-light);
  font-size: 13px;
}

.p4-sheet__total b {
  color: var(--mn-green-dark);
}

.p4-sheet__note {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-3);
}

.p4-sheet__btns {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.p4-sheet__btns .u-btn {
  flex: 1;
}

/* 成功页 */
.p4-success {
  position: absolute;
  inset: 0;
  z-index: 1400;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 46px 16px 20px;
  background: #fff;
  overflow-y: auto;
}

.p4-success__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 62px;
  height: 62px;
  border-radius: 50%;
  background: var(--mn-green);
  box-shadow: 0 8px 20px rgba(0, 150, 57, 0.24);
}

.p4-success__title {
  margin-top: 12px;
  font-size: 18px;
  font-weight: 700;
}

.p4-success__id {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-3);
}

.p4-success__card {
  width: 100%;
  margin-top: 16px;
  padding: 12px;
  border-radius: var(--radius-card);
  background: var(--bg-page);
}

.p4-success__store {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 6px;
}

.p4-success__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border-color);
  font-size: 12.5px;
}

.p4-success__total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
  font-size: 13px;
  font-weight: 700;
}

.p4-success__tip {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--mn-green);
}

.p4-success__btns {
  display: flex;
  gap: 8px;
  width: 100%;
  margin-top: 18px;
}

.p4-success__btns .u-btn {
  flex: 1;
}
</style>
