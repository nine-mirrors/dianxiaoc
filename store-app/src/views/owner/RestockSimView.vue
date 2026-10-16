<script setup lang="ts">
/**
 * 智能补货模拟器（店主端 /owner/restock）。
 *
 * 真实数据链路：登录账号 → 匹配门店 → 单店画像取最新巡店 → 巡店详情取诊断 id → 拉算法推导。
 *  - 默认参数取后端真实值（服务水平 z / 提前期 L / 覆盖天数 D），默认下模拟值与后端原始建议一致；
 *  - 用户改动参数后，**本地按后端同一套公式重算**并标注「模拟值（未落库）」；
 *  - 始终并列展示后端原始建议量（真实值），绝不伪造数字；
 *  - 无单价的行不显示金额（不编造）。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MilkDropLoader from '@/components/common/MilkDropLoader.vue'
import { useToast } from '@/composables/useToast'
import { useCountUp } from '@/composables/useCountUp'
import { useSessionStore } from '@/stores/session'
import { resolveOwnerStore, getStoreProfile, getVisit, fetchForecast, createTicket } from '@/api/owner'
import type { Forecast, ForecastLine } from '@/api/owner'
import type { Diagnosis } from '@/types'

const router = useRouter()
const toast = useToast()
const session = useSessionStore()

const loading = ref<boolean>(true)
const loadError = ref<string>('')
const noDiagnosis = ref<boolean>(false)

const storeId = ref<string>('')
const storeName = ref<string>('')
const diagnosisTime = ref<string>('')
const visitNo = ref<number>(0)
const diagnosis = ref<Diagnosis | null>(null)
const forecast = ref<Forecast | null>(null)

/* ── 参数（默认取后端真实值） ── */
const Z_OPTIONS = [
  { value: 1.28, label: '90% 把握（够用就好）' },
  { value: 1.65, label: '95% 把握（推荐）' },
  { value: 2.33, label: '99% 把握（宁可多备）' },
]
const zValue = ref<number>(1.28)
const leadTime = ref<number>(2)
const coverDays = ref<number>(2)
const defaults = ref<{ z: number; lead: number; cover: number }>({ z: 1.28, lead: 2, cover: 2 })

const changed = computed<boolean>(
  () =>
    zValue.value !== defaults.value.z ||
    Number(leadTime.value) !== defaults.value.lead ||
    Number(coverDays.value) !== defaults.value.cover,
)

/** 单 SKU 模拟结果 */
interface SimLine {
  skuId: string | null
  skuName: string
  daily: number
  onHand: number
  stdCols: number
  actualCols: number
  colDaily: number
  sigma: number
  safetyStock: number
  target: number
  suggest: number
  fillRate: number
  unitPrice: number | null
  amount: number | null
  realSuggest: number
  steps: string[]
}

function keyOf(l: SimLine): string {
  return l.skuId ?? l.skuName
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1)
}

/** 取该 SKU 的单价：优先诊断风险项，其次行动方案（amount/bottles）；取不到则返回 null（不编造） */
function priceOf(line: ForecastLine): number | null {
  const risk = (diagnosis.value?.risk?.items ?? []).find((r) => r.skuId && r.skuId === line.skuId)
  if (risk && typeof risk.unitPrice === 'number') return risk.unitPrice
  const item = (diagnosis.value?.plan?.restock ?? []).find((r) => r.skuId === line.skuId)
  if (item && item.bottles > 0 && typeof item.amount === 'number') {
    return Math.round((item.amount / item.bottles) * 100) / 100
  }
  return null
}

/** 与后端 explainRestock 同一套公式本地重算（z·σ·√L → 目标库存 → 建议量） */
const simLines = computed<SimLine[]>(() => {
  const fc = forecast.value
  if (!fc) return []
  const z = Number(zValue.value) || 0
  const L = Math.max(0, Number(leadTime.value) || 0)
  const D = Math.max(0, Number(coverDays.value) || 0)
  return fc.lines.map((line) => {
    const risk = (diagnosis.value?.risk?.items ?? []).find((r) => r.skuId && r.skuId === line.skuId)
    const colDaily = line.colDaily
    const stdCols = risk?.stdFacings ?? (colDaily > 0 ? line.dailyForecast / colDaily : 0)
    const actualCols = risk?.actualFacings ?? (colDaily > 0 ? line.onHand / colDaily : 0)
    const sigma = line.sigma
    const ss = z * sigma * Math.sqrt(L)
    const gapCols = Math.max(0, stdCols - actualCols)
    const needCover = gapCols * colDaily * (L + D)
    const needGap = gapCols * colDaily * D
    const target = Math.max(ss, needCover, needGap)
    const onHand = line.onHand
    const suggest = Math.round(Math.max(0, target - onHand))
    const capacity = stdCols * colDaily
    const fillRate = capacity > 0 ? Math.round(Math.min(1, (onHand + suggest) / capacity) * 100) : 0
    const price = priceOf(line)
    return {
      skuId: line.skuId,
      skuName: line.skuName,
      daily: line.dailyForecast,
      onHand,
      stdCols,
      actualCols,
      colDaily,
      sigma,
      safetyStock: Math.round(ss * 100) / 100,
      target: Math.round(target * 100) / 100,
      suggest,
      fillRate,
      unitPrice: price,
      amount: price == null ? null : Math.round(suggest * price * 100) / 100,
      realSuggest: line.suggestBottles,
      steps: line.steps ?? [],
    }
  })
})

const simTotalBottles = computed<number>(() => simLines.value.reduce((s, l) => s + l.suggest, 0))
const realTotalBottles = computed<number>(() => forecast.value?.total?.algorithm ?? 0)

/** 对比汇总的关键瓶数滚动（拖参数时模拟值平滑滚到新值；金额保持原格式不动） */
const realBottlesUp = useCountUp(() => realTotalBottles.value, { suffix: ' 瓶' })
const simBottlesUp = useCountUp(() => simTotalBottles.value, { suffix: ' 瓶' })

/** 合计金额：只要有任意一行无单价就不出金额（避免用部分数据凑总数） */
function totalAmountOf(useSim: boolean): number | null {
  const list = simLines.value
  if (!list.length) return null
  const vals = list.map((l) => {
    if (l.unitPrice == null) return null
    return useSim ? l.suggest * l.unitPrice : l.realSuggest * l.unitPrice
  })
  if (vals.some((v) => v == null)) return null
  return Math.round((vals as number[]).reduce((s, v) => s + v, 0) * 100) / 100
}
const simTotalAmount = computed<number | null>(() => totalAmountOf(true))
const realTotalAmount = computed<number | null>(() => totalAmountOf(false))

/**
 * 全部 SKU 日均销量之和（dailyForecast 为算法接口的真实字段，明细行「每天卖约 X 瓶」同源）。
 * 只做求和这种直接换算，不做任何收益推算。
 */
const totalDailySales = computed<number>(() =>
  simLines.value.reduce((s, l) => s + (Number(l.daily) || 0), 0),
)

/**
 * 「这批大约够卖 X 天」：总补货瓶数 ÷ 全部 SKU 日均销量之和，口径与一键下单的模拟瓶数一致，
 * 用户调参数时随行变化。瓶数为 0 或取不到日均销量（和 ≤ 0）时返回空串，整行不显示——不硬编数字。
 * X ≥ 10 取整数，小于 10 保留 1 位小数（读着更像人话）。
 */
const sellDaysText = computed<string>(() => {
  const dailySum = totalDailySales.value
  if (simTotalBottles.value <= 0 || !(dailySum > 0)) return ''
  const x = simTotalBottles.value / dailySum
  return x >= 10 ? String(Math.round(x)) : round1(x)
})

/** 自动展开阈值：默认只展示算法推导入口，点击展开 */
const openSteps = ref<Record<string, boolean>>({})
function toggleSteps(key: string): void {
  openSteps.value[key] = !openSteps.value[key]
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  noDiagnosis.value = false
  try {
    const store = await resolveOwnerStore(session.user?.name)
    if (!store) {
      loadError.value = '没找到你的门店，请确认登录账号与门店的绑定关系'
      return
    }
    storeId.value = store.id
    storeName.value = store.name
    const profile = await getStoreProfile(store.id)
    const visit = profile.visits?.[0]
    if (!profile.hasDiagnosis || !visit) {
      noDiagnosis.value = true
      return
    }
    const detail = await getVisit(visit.id)
    diagnosis.value = detail.diagnosis
    diagnosisTime.value = detail.diagnosis.createdAt
    visitNo.value = detail.diagnosis.visitNo

    const fc = await fetchForecast(detail.diagnosis.id)
    forecast.value = fc
    zValue.value = Number(fc.params?.serviceZ ?? 1.28)
    leadTime.value = Number(fc.params?.leadTimeDays ?? 2)
    coverDays.value = Number(detail.diagnosis.plan?.coverDays ?? fc.params?.coverDays ?? 3)
    defaults.value = {
      z: zValue.value,
      lead: leadTime.value,
      cover: Number(coverDays.value),
    }
  } catch (e) {
    loadError.value = (e as Error)?.message || '补货数据没拉到，请稍后重试'
  } finally {
    loading.value = false
  }
}

function restoreDefaults(): void {
  zValue.value = defaults.value.z
  leadTime.value = defaults.value.lead
  coverDays.value = defaults.value.cover
}

/* ── 一键下单 ── */
const submitting = ref<boolean>(false)

async function submitOrder(): Promise<void> {
  if (submitting.value) return
  const items = simLines.value
    .filter((l) => l.suggest > 0)
    .map((l) => ({
      skuId: l.skuId ?? l.skuName,
      skuName: l.skuName,
      bottles: l.suggest,
      amount: l.amount ?? 0,
    }))
  if (!items.length) {
    toast.info('按现在的参数算下来不用补货，把「想管几天」调大点再看看')
    return
  }
  submitting.value = true
  try {
    await createTicket({
      kind: 'order',
      storeId: storeId.value,
      items,
      note: `店主补货模拟器下单（服务水平 z=${zValue.value}，提前期 L=${leadTime.value} 天，覆盖 D=${coverDays.value} 天）`,
      totalBottles: simTotalBottles.value,
      totalAmount: simTotalAmount.value ?? 0,
    })
    toast.success('订货单已提交，等待业代接单')
    router.push('/owner/orders')
  } catch {
    toast.error('下单失败，请再试一次')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <MobileLayout
    title="智能补货模拟"
    :back="true"
    :show-tab-bar="true"
    :content-padding-bottom="24"
    @back="router.push('/owner')"
  >
    <div class="rs mot-stagger">
      <!-- 加载 -->
      <div v-if="loading" class="rs__loading">
        <MilkDropLoader size="card" label="正在算你的补货量" />
      </div>

      <!-- 失败 -->
      <EmptyState
        v-else-if="loadError"
        icon="warning"
        title="数据没拉到"
        :desc="loadError"
        action-text="重新加载"
        @action="load"
      />

      <!-- 无诊断 -->
      <EmptyState
        v-else-if="noDiagnosis"
        icon="camera"
        title="本店还没做过诊断"
        desc="先给冷柜拍一张，AI 看过后才能帮你算该补多少货。"
        action-text="去自助诊断"
        @action="router.push('/owner')"
      />

      <template v-else-if="forecast && diagnosis">
        <!-- 门店信息 -->
        <section class="u-card rs__store">
          <p class="rs__store-name"><AppIcon name="store" :size="16" color="var(--mn-green-dark)" />{{ storeName }}</p>
          <p class="rs__store-meta">诊断时间 {{ diagnosisTime }} · 第 {{ visitNo }} 次巡店</p>
          <p class="rs__store-tip">
            下面的数字，是 AI 按你近 4 周的卖货速度算出来的「该补多少」。你可以调参数试试，右边的数字会跟着变。
          </p>
        </section>

        <!-- 参数面板 -->
        <section class="u-card rs__params">
          <header class="rs__head">
            <h2><AppIcon name="sliders" :size="15" /> 调一调参数</h2>
            <button v-if="changed" type="button" class="rs__reset u-tap" @click="restoreDefaults">
              <AppIcon name="refresh" :size="13" /> 恢复默认
            </button>
          </header>

          <label class="rs__field">
            <span class="rs__label">想要多大把握</span>
            <select v-model.number="zValue" class="rs__select">
              <option v-for="o in Z_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>

          <label class="rs__field">
            <span class="rs__label">补货几天能到</span>
            <span class="rs__field-right">
              <input v-model.number="leadTime" type="number" min="0" max="30" class="rs__num" />
              <em>天</em>
            </span>
          </label>

          <label class="rs__field">
            <span class="rs__label">想管几天的货</span>
            <span class="rs__field-right">
              <input v-model.number="coverDays" type="number" min="0" max="30" class="rs__num" />
              <em>天</em>
            </span>
          </label>

          <p v-if="changed" class="rs__note">
            <AppIcon name="info" :size="12" />
            改完的数字是「模拟值（未落库）」，只给你参考；系统原始建议量一直保留在右侧对比。
          </p>
        </section>

        <!-- 汇总对比 -->
        <section class="u-card rs__sum">
          <div class="rs__sum-row">
            <span>系统原始建议</span>
            <b>{{ realBottlesUp.text }}<span v-if="realTotalAmount != null"> · ¥{{ realTotalAmount }}</span></b>
          </div>
          <div class="rs__sum-row rs__sum-row--sim">
            <span>调整后（模拟）</span>
            <b>{{ simBottlesUp.text }}<span v-if="simTotalAmount != null"> · ¥{{ simTotalAmount }}</span></b>
          </div>
          <!-- 人话翻译：只按已有的瓶数与日均销量做除法，不做收益承诺；取不到则整行不渲染 -->
          <p v-if="sellDaysText" class="rs__sum-human">
            <AppIcon name="clock" :size="13" color="var(--text-3)" />
            按最近的卖货速度，这批大约够卖 {{ sellDaysText }} 天
          </p>
        </section>

        <!-- SKU 明细 -->
        <section class="u-card rs__detail mot-stagger">
          <header class="rs__head">
            <h2><AppIcon name="package" :size="15" /> 每个货的建议</h2>
            <span>共 {{ simLines.length }} 个</span>
          </header>

          <div v-for="l in simLines" :key="keyOf(l)" class="rs__sku">
            <div class="rs__sku-top">
              <span class="rs__sku-name">{{ l.skuName }}</span>
              <span class="rs__sku-fill">排面 {{ l.fillRate }}%</span>
            </div>
            <p class="rs__sku-meta">
              每天卖约 {{ round1(l.daily) }} 瓶 · 现有 {{ l.onHand }} 瓶 · 安全库存 {{ round1(l.safetyStock) }} 瓶
            </p>
            <div class="rs__sku-compare">
              <span class="rs__sku-real">系统建议 <b>{{ l.realSuggest }}</b> 瓶</span>
              <span class="rs__sku-sim" :class="{ 'is-diff': l.suggest !== l.realSuggest }">
                调整后 <b>{{ l.suggest }}</b> 瓶<em v-if="l.suggest !== l.realSuggest">（模拟）</em>
              </span>
            </div>
            <button v-if="l.steps.length" type="button" class="rs__sku-more u-tap mot-tap" @click="toggleSteps(keyOf(l))">
              看算法怎么算的
              <span class="rs__caret">{{ openSteps[keyOf(l)] ? '▴' : '▾' }}</span>
            </button>
            <ol v-if="openSteps[keyOf(l)]" class="rs__steps mot-fade-up">
              <li v-for="(s, i) in l.steps" :key="i">{{ s }}</li>
            </ol>
          </div>
        </section>

        <!-- 下单 -->
        <div class="rs__cta">
          <button
            type="button"
            class="u-btn u-btn--primary rs__order u-tap"
            :class="{ 'mot-press-loading': submitting }"
            :disabled="submitting || simTotalBottles <= 0"
            @click="submitOrder"
          >
            <AppIcon name="cart" :size="16" />
            {{ submitting ? '提交中…' : `一键下单 · ${simTotalBottles} 瓶` }}
          </button>
          <p v-if="simTotalBottles <= 0" class="rs__cta-tip">
            按现在的参数算下来暂时不用补货。想把货备足点，把「想管几天的货」调大些再试。
          </p>
          <p v-else class="rs__cta-tip">提交后，业代会收到通知并与你确认。</p>
        </div>
      </template>
    </div>
  </MobileLayout>
</template>

<style scoped>
.rs {
  padding: 14px 16px;
}

.rs__loading {
  padding: 60px 0;
}

.u-card {
  padding: 14px 16px;
  margin-bottom: 12px;
}

.rs__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.rs__head h2 {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.rs__head span {
  font-size: 11.5px;
  color: var(--text-3);
}

/* ── 门店信息 ── */
.rs__store-name {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 16px;
  font-weight: 800;
  color: var(--text-1);
}

.rs__store-meta {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-3);
}

.rs__store-tip {
  margin-top: 10px;
  padding: 9px 11px;
  border-radius: 10px;
  background: var(--brand-mist);
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.7;
}

/* ── 参数面板 ── */
.rs__reset {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 12px;
}

.rs__field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px dashed var(--border-color);
}

.rs__field:last-of-type {
  border-bottom: none;
}

.rs__label {
  font-size: 13px;
  color: var(--text-1);
}

.rs__field-right {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.rs__field-right em {
  font-style: normal;
  font-size: 12.5px;
  color: var(--text-3);
}

.rs__select,
.rs__num {
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-1);
  font-size: 13px;
}

.rs__select {
  max-width: 190px;
}

.rs__num {
  width: 62px;
  text-align: center;
}

.rs__note {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--warning-bg);
  color: var(--warning-fg);
  font-size: 12px;
  line-height: 1.6;
}

/* ── 汇总对比 ── */
.rs__sum-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 13px;
  color: var(--text-2);
}

.rs__sum-row + .rs__sum-row {
  border-top: 1px dashed var(--border-color);
}

.rs__sum-row b {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.rs__sum-row--sim b {
  color: var(--ai-purple);
}

.rs__sum-human {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 9px;
  padding-top: 9px;
  border-top: 1px dashed var(--border-color);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}

/* ── SKU 明细 ── */
.rs__sku {
  padding: 11px 0;
  border-bottom: 1px dashed var(--border-color);
}

.rs__sku:last-child {
  border-bottom: none;
}

.rs__sku-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.rs__sku-name {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-1);
}

.rs__sku-fill {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--brand-mist);
  color: var(--success-fg);
}

.rs__sku-meta {
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--text-3);
}

.rs__sku-compare {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.rs__sku-real,
.rs__sku-sim {
  flex: 1;
  padding: 7px 10px;
  border-radius: 9px;
  font-size: 12px;
  color: var(--text-2);
  text-align: center;
}

.rs__sku-real {
  background: var(--bg-page);
}

.rs__sku-sim {
  background: var(--ai-purple-light);
}

.rs__sku-real b,
.rs__sku-sim b {
  font-size: 15px;
  font-weight: 800;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.rs__sku-sim.is-diff {
  outline: 1px solid var(--ai-purple);
}

.rs__sku-sim em {
  font-style: normal;
  font-size: 10.5px;
  color: var(--ai-purple);
}

.rs__sku-more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 0;
  border: none;
  background: none;
  color: var(--ai-purple);
  font-size: 12px;
  font-weight: 600;
}

.rs__caret {
  font-size: 11px;
}

.rs__steps {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-page);
}

.rs__steps li {
  position: relative;
  padding: 3px 0 3px 14px;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--text-2);
}

.rs__steps li::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 10px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ai-purple);
}

/* ── 下单 ── */
.rs__cta {
  margin-top: 16px;
  text-align: center;
}

.rs__order {
  width: 100%;
  height: 48px;
  font-size: 15px;
}

.rs__cta-tip {
  margin-top: 8px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-3);
}
</style>
