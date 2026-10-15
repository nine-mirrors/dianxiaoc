<script setup lang="ts">
/**
 * 业代端 · 价签 / 冰柜审核（/rep/shelf/:storeId?）。
 *
 * 两个 Tab：价签核对 / 冰柜冷链。按门店陈列 SOP 逐项判定「合格 / 有问题」，
 * 有问题的项可写备注；底部 CTA「提交整改单」调用真实 createTicket(kind=rectification)，
 * 把问题项作为 placements 落库，成功后展示单号并可返回今日巡店。
 *
 * 数据只走 @/api；失败一律 try/catch + Toast，绝不白屏。
 * 门店解析同 CheckinView：:storeId 直达 → 任务 id → 今日线路第一站兜底。
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useToast } from '@/composables/useToast'
import { useHaptics } from '@/composables/useHaptics'
import { useSessionStore } from '@/stores/session'
import { getStore, getTodayRoute, getTasks, createTicket } from '@/api'
import type { Store, Ticket } from '@/types'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const toast = useToast()
const haptics = useHaptics()

const repId = computed<string>(() => session.user?.id || 'U_REP')

/* ─────────────── 门店解析 ─────────────── */

const loading = ref<boolean>(true)
const store = ref<Store | null>(null)

async function resolveStore(): Promise<Store | null> {
  const param = String(route.params.storeId ?? '').trim()
  if (param) {
    try {
      const res = await getStore(param)
      if (res.store) return res.store
    } catch {
      /* 继续按任务 id 解析 */
    }
    try {
      const res = await getTasks(repId.value)
      const task = (res.tasks ?? []).find((t) => t.id === param)
      if (task) {
        const hit = await getStore(task.storeId)
        if (hit.store) return hit.store
      }
    } catch {
      /* ignore */
    }
  }
  try {
    const today = await getTodayRoute(repId.value)
    const first = today.routeStores?.[0]?.store
    if (first) return first
  } catch {
    /* ignore */
  }
  return null
}

onMounted(async () => {
  store.value = await resolveStore()
  loading.value = false
})

/* ─────────────── Tab 与检查清单 ─────────────── */

type TabKey = 'pricetag' | 'cold'

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'pricetag', label: '价签核对', icon: 'tag' },
  { key: 'cold', label: '冰柜冷链', icon: 'milk' },
]

interface AuditItem {
  key: string
  title: string
  hint: string
}

const CHECKLISTS: Record<TabKey, AuditItem[]> = {
  pricetag: [
    { key: 'match', title: '价签与商品一一对应，无错位串签', hint: '逐排面抽查，重点看商品与价签是否对得上' },
    { key: 'price', title: '价签价格与系统指导价一致', hint: '抽查蒙牛主力 SKU，无低价或高价' },
    { key: 'promo', title: '促销价签在有效期内，无过期标示', hint: '过期促销签必须当场更换' },
    { key: 'fresh', title: '冷藏品价签防水完好、字迹清晰', hint: '受潮模糊的价签需更换' },
    { key: 'oos', title: '缺货商品价签已及时下架', hint: '避免顾客按价签找不到商品' },
  ],
  cold: [
    { key: 'temp', title: '冰柜温度处于 2–6℃ 区间', hint: '以柜体温度显示为准，无显示则用温度计实测' },
    { key: 'alarm', title: '温度显示正常、无故障报警', hint: '报警灯亮起需立即联系门店处理' },
    { key: 'fill', title: '蒙牛冷柜陈列饱满，无大面积空缺', hint: '空缺面积超过 1/4 视为不合格' },
    { key: 'clean', title: '冷柜层板清洁，无结霜结冰', hint: '结霜影响制冷与观感' },
    { key: 'occupy', title: '竞品未占用蒙牛冷柜下半区', hint: '下半区为蒙牛主陈列位，被占即记录' },
    { key: 'seal', title: '冷柜门完好、密封条无破损', hint: '密封条破损会导致能耗上升' },
  ],
}

const tab = ref<TabKey>('pricetag')

/** 判定结果：未定 / 合格 / 有问题 */
type Mark = 'ok' | 'issue'
const marks = ref<Record<string, Mark>>({})
const notes = ref<Record<string, string>>({})
/** 冰柜实测温度（℃），空串表示未记录 */
const coldTemp = ref<string>('')

function markKey(t: TabKey, k: string): string {
  return `${t}:${k}`
}

function markOf(t: TabKey, k: string): Mark | undefined {
  return marks.value[markKey(t, k)]
}

function setMark(t: TabKey, k: string, m: Mark): void {
  const key = markKey(t, k)
  haptics.select()
  marks.value = { ...marks.value, [key]: m }
}

function noteOf(t: TabKey, k: string): string {
  return notes.value[markKey(t, k)] ?? ''
}

function setNote(t: TabKey, k: string, v: string): void {
  notes.value = { ...notes.value, [markKey(t, k)]: v }
}

const items = computed<AuditItem[]>(() => CHECKLISTS[tab.value])

/** 当前 Tab 已判定项数 / 问题项数 */
const judged = computed<number>(() => items.value.filter((i) => markOf(tab.value, i.key)).length)
const issueCount = computed<number>(() => items.value.filter((i) => markOf(tab.value, i.key) === 'issue').length)

/** 指定 Tab 的问题项数（Tab 角标用） */
function issueCountOf(t: TabKey): number {
  return CHECKLISTS[t].filter((i) => marks.value[markKey(t, i.key)] === 'issue').length
}

const totalIssue = computed<number>(() => (Object.keys(CHECKLISTS) as TabKey[]).reduce((n, t) => n + issueCountOf(t), 0))

/** 一键全部合格（当前 Tab）+ 箭头函数避免逐项震动 */
function allOk(): void {
  const next = { ...marks.value }
  items.value.forEach((i) => {
    next[markKey(tab.value, i.key)] = 'ok'
  })
  marks.value = next
  haptics.success()
}

/** 冰柜温度：录入后自动判定 temp 项 */
function onTempInput(): void {
  const v = coldTemp.value.trim()
  if (v === '') return
  const n = Number(v)
  if (!Number.isFinite(n)) return
  setMark('cold', 'temp', n >= 2 && n <= 6 ? 'ok' : 'issue')
}

/* ─────────────── 提交整改单 ─────────────── */

const submitting = ref<boolean>(false)
const success = ref<boolean>(false)
const ticket = ref<Ticket | null>(null)
const remark = ref<string>('')

/** 汇总全部有问题的项（含备注）为整改条目 */
function collectProblems(): string[] {
  const out: string[] = []
  ;(Object.keys(CHECKLISTS) as TabKey[]).forEach((t) => {
    const tabLabel = TABS.find((x) => x.key === t)?.label ?? ''
    CHECKLISTS[t].forEach((i) => {
      if (marks.value[markKey(t, i.key)] !== 'issue') return
      const note = (notes.value[markKey(t, i.key)] ?? '').trim()
      const temp = t === 'cold' && i.key === 'temp' && coldTemp.value ? `（实测 ${coldTemp.value}℃）` : ''
      out.push(`【${tabLabel}】${i.title}${temp}${note ? ` —— ${note}` : ''}`)
    })
  })
  return out
}

async function submitAudit(): Promise<void> {
  if (!store.value) {
    toast.error('未匹配到门店，无法提交')
    return
  }
  if (submitting.value) return
  const problems = collectProblems()
  if (!problems.length) {
    toast.info('暂无问题项：请先标记问题，或全部判定为合格')
    return
  }
  submitting.value = true
  try {
    const res = await createTicket({
      kind: 'rectification',
      storeId: store.value.id,
      items: [],
      placements: problems.map((text) => ({ text })),
      note: `价签/冰柜审核发现 ${problems.length} 项问题，请于本周五前完成整改。${
        remark.value.trim() ? `补充说明：${remark.value.trim()}` : ''
      }`,
    })
    ticket.value = res.ticket
    success.value = true
    haptics.success()
    toast.success('整改单已提交')
  } catch {
    haptics.error()
    toast.error('提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

function closeSuccess(): void {
  success.value = false
}

function backToToday(): void {
  router.replace({ path: '/rep/today', query: { done: store.value?.id ?? '' } })
}
</script>

<template>
  <MobileLayout title="价签/冰柜审核" :back="true" :content-padding-bottom="84" @back="router.push('/rep/today')">
    <!-- 门店卡 -->
    <div class="sa-pad">
      <SkeletonBlock v-if="loading" height="72px" radius="12px" />
      <div v-else-if="store" class="u-card sa-store">
        <p class="sa-store__name">
          <AppIcon name="store" :size="15" color="var(--mn-green)" />
          {{ store.name }}
        </p>
        <p class="sa-store__meta">{{ store.typeLabel }} · 负责人：{{ store.ownerName }}</p>
      </div>
      <EmptyState v-else icon="store" title="未匹配到门店" desc="请从今日巡店列表进入审核" />
    </div>

    <template v-if="store">
      <!-- Tab -->
      <div class="sa-pad">
        <div class="sa-tabs">
          <button
            v-for="t in TABS"
            :key="t.key"
            type="button"
            class="sa-tab u-tap"
            :class="{ 'sa-tab--on': tab === t.key }"
            @click="tab = t.key"
          >
            <AppIcon :name="t.icon" :size="14" />
            {{ t.label }}
            <b v-if="issueCountOf(t.key)" class="sa-tab__dot">{{ issueCountOf(t.key) }}</b>
          </button>
        </div>
        <div class="sa-progress">
          <span>已核对 {{ judged }}/{{ items.length }} 项</span>
          <span class="sa-progress__issue" :class="{ 'is-on': issueCount > 0 }">问题 {{ issueCount }} 项</span>
        </div>
      </div>

      <!-- 检查清单 -->
      <div class="sa-pad">
        <div class="u-card sa-list">
          <div v-for="i in items" :key="i.key" class="sa-item">
            <div class="sa-item__head">
              <div class="sa-item__text">
                <p class="sa-item__title">{{ i.title }}</p>
                <p class="sa-item__hint">{{ i.hint }}</p>
              </div>
              <span
                class="sa-item__badge"
                :class="markOf(tab, i.key) ? `sa-item__badge--${markOf(tab, i.key)}` : ''"
              >
                {{ markOf(tab, i.key) === 'ok' ? '合格' : markOf(tab, i.key) === 'issue' ? '有问题' : '待判定' }}
              </span>
            </div>

            <!-- 冰柜温度输入 -->
            <div v-if="tab === 'cold' && i.key === 'temp'" class="sa-temp">
              <label class="sa-temp__label" :for="`temp-${i.key}`">实测温度</label>
              <input
                :id="`temp-${i.key}`"
                v-model="coldTemp"
                class="sa-temp__input"
                type="number"
                inputmode="decimal"
                placeholder="如 4"
                @input="onTempInput"
              />
              <span class="sa-temp__unit">℃（标准 2–6℃）</span>
            </div>

            <div class="sa-acts">
              <button
                type="button"
                class="sa-act sa-act--ok u-tap"
                :class="{ 'sa-act--on': markOf(tab, i.key) === 'ok' }"
                @click="setMark(tab, i.key, 'ok')"
              >
                <AppIcon name="check" :size="13" /> 合格
              </button>
              <button
                type="button"
                class="sa-act sa-act--bad u-tap"
                :class="{ 'sa-act--on': markOf(tab, i.key) === 'issue' }"
                @click="setMark(tab, i.key, 'issue')"
              >
                <AppIcon name="warning" :size="13" /> 有问题
              </button>
            </div>

            <input
              v-if="markOf(tab, i.key) === 'issue'"
              class="sa-note"
              type="text"
              maxlength="60"
              :value="noteOf(tab, i.key)"
              placeholder="补充说明（选填），如「3 号货架可乐价签串位」"
              @input="setNote(tab, i.key, ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>

        <button type="button" class="sa-allok u-tap" @click="allOk">
          <AppIcon name="check-circle" :size="14" /> 当前分类一键全部合格
        </button>
      </div>

      <!-- 备注 -->
      <div class="sa-pad">
        <div class="u-card sa-remark">
          <p class="sa-remark__cap">整体说明（选填）</p>
          <textarea
            v-model="remark"
            class="sa-remark__input"
            rows="3"
            maxlength="160"
            placeholder="与店主沟通结论、约定整改时间等"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div v-if="store" class="sa-bar u-safe-bottom">
        <button type="button" class="sa-submit" :disabled="submitting" @click="submitAudit">
          <AppIcon name="clipboard" :size="16" color="#fff" />
          {{ submitting ? '提交中…' : `提交整改单${totalIssue ? `（${totalIssue}）` : ''}` }}
        </button>
      </div>
    </template>

    <!-- 提交成功覆盖层 -->
    <div v-if="success" class="sa-mask" @click.self="closeSuccess">
      <div class="sa-success" role="dialog" aria-modal="true" aria-labelledby="sa-success-title">
        <div class="sa-success__icon"><AppIcon name="check" :size="28" color="#fff" /></div>
        <p id="sa-success-title" class="sa-success__title">整改单已生成</p>
        <p class="sa-success__id">单号 {{ ticket?.id }}</p>
        <div class="sa-success__card">
          <p class="sa-success__store">{{ ticket?.storeName }}</p>
          <p v-for="(p, i) in ticket?.placements ?? []" :key="i" class="sa-success__row">· {{ p.text }}</p>
          <p class="sa-success__tip">已同步至门店整改任务，请于本周五前完成复查</p>
        </div>
        <div class="sa-success__btns">
          <button type="button" class="sa-btn sa-btn--ghost u-tap" @click="closeSuccess">继续审核</button>
          <button type="button" class="sa-btn sa-btn--primary u-tap" @click="backToToday">返回今日巡店</button>
        </div>
      </div>
    </div>
  </MobileLayout>
</template>

<style scoped>
.sa-pad {
  padding: 14px 12px 0;
}

.sa-store {
  padding: 12px;
  border-left: 4px solid var(--mn-green);
}

.sa-store__name {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

.sa-store__meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-3);
}

/* Tab */
.sa-tabs {
  display: flex;
  gap: 6px;
  padding: 3px;
  border-radius: 12px;
  background: var(--bg-page);
}

.sa-tab {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 42px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
}

.sa-tab--on {
  background: var(--mn-green);
  color: #fff;
  box-shadow: 0 2px 6px rgba(0, 150, 57, 0.26);
}

.sa-tab--on :deep(svg) {
  color: #fff;
}

.sa-tab__dot {
  min-width: 16px;
  height: 16px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--danger-fg);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}

.sa-progress {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-3);
}

.sa-progress__issue {
  font-weight: 600;
}

.sa-progress__issue.is-on {
  color: var(--danger-fg);
}

/* 清单 */
.sa-list {
  padding: 2px 12px;
}

.sa-item {
  padding: 12px 0;
  border-bottom: 1px dashed var(--border-color);
}

.sa-item:last-child {
  border-bottom: none;
}

.sa-item__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.sa-item__text {
  flex: 1;
  min-width: 0;
}

.sa-item__title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-1);
  line-height: 1.5;
}

.sa-item__hint {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.5;
}

.sa-item__badge {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-page);
  color: var(--text-3);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.sa-item__badge--ok {
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
}

.sa-item__badge--issue {
  background: var(--danger-bg);
  color: var(--danger-fg);
}

.sa-temp {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.sa-temp__label {
  font-size: 12px;
  color: var(--text-2);
}

.sa-temp__input {
  width: 72px;
  height: 38px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-1);
  font-size: 14px;
  font-weight: 600;
  text-align: center;
}

.sa-temp__unit {
  font-size: 11px;
  color: var(--text-3);
}

.sa-acts {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.sa-act {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 40px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
}

.sa-act--ok.sa-act--on {
  border-color: var(--mn-green);
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
}

.sa-act--bad.sa-act--on {
  border-color: var(--danger-fg);
  background: var(--danger-bg);
  color: var(--danger-fg);
}

.sa-note {
  width: 100%;
  height: 40px;
  margin-top: 8px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-page);
  color: var(--text-1);
  font-size: 12.5px;
}

.sa-allok {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  min-height: 42px;
  margin-top: 10px;
  border: 1px dashed var(--mn-green);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--mn-green-dark);
  font-size: 13px;
  font-weight: 600;
}

.sa-remark {
  padding: 12px;
}

.sa-remark__cap {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.sa-remark__input {
  width: 100%;
  min-height: 72px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-page);
  color: var(--text-1);
  font-size: 12.5px;
  line-height: 1.6;
  resize: none;
}

/* 底部栏 */
.sa-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  padding-top: 14px;
  padding-right: 12px;
  padding-left: 12px;
  background: linear-gradient(180deg, rgba(245, 247, 245, 0) 0%, var(--bg-page) 42%);
}

.sa-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 52px;
  border: none;
  border-radius: 26px;
  background: var(--mn-green);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  box-shadow: var(--sh-brand);
}

.sa-submit:disabled {
  background: var(--text-4);
  box-shadow: none;
  opacity: 0.85;
}

/* 成功覆盖层 */
.sa-mask {
  position: absolute;
  inset: 0;
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.42);
}

.sa-success {
  width: 100%;
  max-height: 88%;
  overflow-y: auto;
  padding: 20px 16px;
  border-radius: 16px;
  background: var(--bg-card);
  text-align: center;
}

.sa-success__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  margin: 0 auto;
  border-radius: 50%;
  background: var(--mn-green);
}

.sa-success__title {
  margin-top: 12px;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-1);
}

.sa-success__id {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-3);
}

.sa-success__card {
  margin-top: 14px;
  padding: 12px;
  border-radius: var(--radius-card);
  background: var(--bg-page);
  text-align: left;
}

.sa-success__store {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-1);
}

.sa-success__row {
  padding: 4px 0;
  border-bottom: 1px dashed var(--border-color);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-2);
}

.sa-success__tip {
  margin-top: 8px;
  font-size: 11px;
  color: var(--mn-green);
}

.sa-success__btns {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.sa-btn {
  flex: 1;
  min-height: 44px;
  border-radius: 22px;
  font-size: 14px;
  font-weight: 600;
}

.sa-btn--ghost {
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-2);
}

.sa-btn--primary {
  border: none;
  background: var(--mn-green);
  color: #fff;
}
</style>
