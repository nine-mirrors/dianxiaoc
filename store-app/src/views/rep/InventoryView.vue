<script setup lang="ts">
/**
 * 业代端 · 库存盘点与临期检查（/rep/inventory/:storeId?）。
 *
 * 逐 SKU 记录「库存量 / 货架量 / 到期日 / 备注」，临期自动预警（≤30 天标红、已过期标红加粗）。
 * SKU 行种子来源（全部真实数据，绝不造假）：
 *   ① 该店最近一次盘点（getLatestInventory）
 *   ② 否则取该店最近一次巡店的 AI 行动方案补货明细（getVisits → getVisit → diagnosis.plan.restock）
 *   ③ 都没有则空列表，支持「扫码」或「手动添加」逐行录入
 * 提交调用真实 submitInventory()；底部展示「上次盘点」快照。
 *
 * 数据只走 @/api / @/api/ops；失败一律 try/catch + Toast，绝不白屏。
 */
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useToast } from '@/composables/useToast'
import { useHaptics } from '@/composables/useHaptics'
import { startCamera, stopCamera } from '@/composables/useCamera'
import { useSessionStore } from '@/stores/session'
import { getStore, getTodayRoute, getTasks, getVisits, getVisit } from '@/api'
import { submitInventory, getLatestInventory, type InventoryItem } from '@/api/ops'
import { formatShortTime } from '@/utils/format'
import type { Store } from '@/types'

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

/* ─────────────── 盘点行模型 ─────────────── */

interface Row {
  id: string
  skuCode: string
  skuName: string
  qty: number
  shelfQty: number
  /** 到期日 YYYY-MM-DD，空串表示未记录 */
  expireAt: string
  note: string
}

let rowSeq = 0
function newRow(partial: Partial<Row> = {}): Row {
  rowSeq += 1
  return {
    id: `row_${rowSeq}`,
    skuCode: '',
    skuName: '',
    qty: 0,
    shelfQty: 0,
    expireAt: '',
    note: '',
    ...partial,
  }
}

const rows = ref<Row[]>([])
const lastInventory = ref<{ createdAt: string; count: number; items: InventoryItem[] } | null>(null)

/** 本次点数（合计库存量） */
const totalQty = computed<number>(() => rows.value.reduce((s, r) => s + (Number(r.qty) || 0), 0))

/** 距今天数（正数=还没到期） */
function daysLeft(expireAt: string): number | null {
  if (!expireAt) return null
  const d = new Date(`${expireAt}T23:59:59`)
  if (Number.isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}

/** 临期（≤30 天）行 id 集合 */
const nearExpiry = computed<Row[]>(() => rows.value.filter((r) => {
  const n = daysLeft(r.expireAt)
  return n != null && n <= 30
}))

function expiryTag(expireAt: string): { text: string; tone: 'danger' | 'warning' } | null {
  const n = daysLeft(expireAt)
  if (n == null) return null
  if (n < 0) return { text: '已过期', tone: 'danger' }
  if (n <= 30) return { text: `临期 ${n} 天`, tone: n <= 7 ? 'danger' : 'warning' }
  return null
}

/* ─────────────── 加载种子数据 ─────────────── */

/** 从最近一次巡店的 AI 行动方案里取真实 SKU，生成待盘点行 */
async function seedFromDiagnosis(): Promise<Row[]> {
  if (!store.value) return []
  try {
    const res = await getVisits({ storeId: store.value.id, limit: 1 })
    const visit = (res.visits ?? [])[0]
    if (!visit) return []
    const detail = await getVisit(visit.id)
    const restock = detail.diagnosis?.plan?.restock ?? []
    return restock.map((r) => newRow({ skuCode: r.skuId, skuName: r.skuName }))
  } catch {
    return []
  }
}

async function loadSeed(): Promise<void> {
  if (!store.value) return
  try {
    const latest = await getLatestInventory(store.value.id)
    if (!latest.empty && (latest.items ?? []).length) {
      lastInventory.value = {
        createdAt: latest.createdAt ?? '',
        count: latest.count ?? latest.items.length,
        items: latest.items,
      }
      rows.value = latest.items.map((it) =>
        newRow({
          skuCode: it.skuCode,
          skuName: it.skuName,
          qty: it.qty,
          shelfQty: it.shelfQty,
          expireAt: (it.expireAt ?? '').slice(0, 10),
          note: it.note ?? '',
        }),
      )
      return
    }
  } catch {
    toast.error('上次盘点记录加载失败')
  }
  const seeded = await seedFromDiagnosis()
  if (seeded.length) {
    rows.value = seeded
    return
  }
  rows.value = []
}

/* ─────────────── 行操作 ─────────────── */

function stepQty(row: Row, field: 'qty' | 'shelfQty', delta: number): void {
  const next = Math.max(0, Math.min(9999, (Number(row[field]) || 0) + delta))
  row[field] = next
  haptics.select()
}

function removeRow(id: string): void {
  rows.value = rows.value.filter((r) => r.id !== id)
}

/** 手动添加（弹层） */
const manualOpen = ref<boolean>(false)
const manualCode = ref<string>('')
const manualName = ref<string>('')

function openManual(): void {
  manualCode.value = ''
  manualName.value = ''
  manualOpen.value = true
}

function confirmManual(): void {
  const code = manualCode.value.trim()
  const name = manualName.value.trim()
  if (!code && !name) {
    toast.info('请至少填写 SKU 编码或名称')
    return
  }
  rows.value = [...rows.value, newRow({ skuCode: code, skuName: name || '未命名 SKU' })]
  manualOpen.value = false
  haptics.success()
}

/* ─────────────── 扫码 ─────────────── */

const scanOpen = ref<boolean>(false)
const scanHint = ref<string>('将条形码对准取景框')
const videoRef = ref<HTMLVideoElement | null>(null)
let scanStream: MediaStream | null = null
let scanTimer: number | null = null

interface BarcodeDetectorResult {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect: (src: HTMLVideoElement) => Promise<BarcodeDetectorResult[]>
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike
}
let detector: BarcodeDetectorLike | null = null

/** 按条码加入一行（去重：同码只提示不重复加） */
function addByCode(code: string): void {
  const hit = rows.value.find((r) => r.skuCode === code)
  if (hit) {
    toast.info(`该条码已在清单中：${code}`)
    return
  }
  rows.value = [...rows.value, newRow({ skuCode: code, skuName: '扫码商品（待补充名称）' })]
  haptics.success()
  toast.success(`已扫码加入：${code}`)
}

async function detectOnce(): Promise<void> {
  if (!detector || !videoRef.value) return
  try {
    const codes = await detector.detect(videoRef.value)
    const code = codes?.[0]?.rawValue?.trim()
    if (code) {
      closeScan()
      addByCode(code)
    }
  } catch {
    /* 单帧识别失败继续下一帧 */
  }
}

function stopScan(): void {
  if (scanTimer != null) {
    window.clearInterval(scanTimer)
    scanTimer = null
  }
  detector = null
  stopCamera(scanStream)
  scanStream = null
  scanOpen.value = false
}

function closeScan(): void {
  stopScan()
}

/** 打开扫码：浏览器支持 BarcodeDetector 且有摄像头才走取景器，否则回退手动录入 */
async function openScan(): Promise<void> {
  const win = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
  const BD = win.BarcodeDetector
  if (!BD) {
    toast.info('当前浏览器不支持扫码，请手动输入条码')
    openManual()
    return
  }
  scanHint.value = '将条形码对准取景框'
  scanOpen.value = true
  await nextTick()
  try {
    scanStream = await startCamera('environment')
    if (videoRef.value) {
      videoRef.value.srcObject = scanStream
      await videoRef.value.play()
    }
    detector = new BD({ formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'qr_code'] })
    scanTimer = window.setInterval(() => void detectOnce(), 450)
  } catch {
    stopScan()
    toast.info('无法开启摄像头，请手动输入条码')
    openManual()
  }
}

/* ─────────────── 提交盘点 ─────────────── */

const submitting = ref<boolean>(false)
const success = ref<boolean>(false)
const submittedCount = ref<number>(0)

async function submit(): Promise<void> {
  if (!store.value) {
    toast.error('未匹配到门店，无法盘点')
    return
  }
  if (submitting.value) return
  const items: InventoryItem[] = rows.value
    .filter((r) => r.skuCode.trim() || r.skuName.trim())
    .map((r) => ({
      skuCode: r.skuCode.trim(),
      skuName: r.skuName.trim(),
      qty: Number(r.qty) || 0,
      shelfQty: Number(r.shelfQty) || 0,
      expireAt: r.expireAt || null,
      note: r.note.trim() || null,
    }))
  if (!items.length) {
    toast.info('请先扫码或手动添加至少一个 SKU 再提交')
    return
  }
  submitting.value = true
  try {
    const res = await submitInventory(store.value.id, items)
    submittedCount.value = res.count ?? items.length
    success.value = true
    haptics.success()
    toast.success('盘点已提交')
  } catch {
    haptics.error()
    toast.error('盘点提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

async function closeSuccess(): Promise<void> {
  success.value = false
  await loadSeed()
}

function backToToday(): void {
  router.replace({ path: '/rep/today', query: { done: store.value?.id ?? '' } })
}

onMounted(async () => {
  store.value = await resolveStore()
  await loadSeed()
  loading.value = false
})

onBeforeUnmount(() => stopScan())
</script>

<template>
  <MobileLayout title="库存盘点" :back="true" :content-padding-bottom="96" @back="router.push('/rep/today')">
    <div class="iv-pad">
      <SkeletonBlock v-if="loading" height="70px" radius="12px" />
      <div v-else-if="store" class="u-card iv-store">
        <p class="iv-store__name">
          <AppIcon name="store" :size="15" color="var(--mn-green)" />
          {{ store.name }}
        </p>
        <p class="iv-store__meta">{{ store.typeLabel }} · 负责人：{{ store.ownerName }}</p>
      </div>
      <EmptyState v-else icon="store" title="未匹配到门店" desc="请从今日巡店列表进入盘点" />
    </div>

    <template v-if="store">
      <!-- 概览 + 操作 -->
      <div class="iv-pad">
        <div class="u-card iv-summary">
          <div class="iv-summary__cell">
            <b>{{ rows.length }}</b>
            <span>盘点 SKU</span>
          </div>
          <div class="iv-summary__cell">
            <b>{{ totalQty }}</b>
            <span>合计库存（瓶）</span>
          </div>
          <div class="iv-summary__cell" :class="{ 'is-warn': nearExpiry.length > 0 }">
            <b>{{ nearExpiry.length }}</b>
            <span>临期 / 过期</span>
          </div>
        </div>
        <div class="iv-tools">
          <button type="button" class="iv-tool iv-tool--primary u-tap" @click="openScan">
            <AppIcon name="compare" :size="14" color="#fff" /> 扫码添加
          </button>
          <button type="button" class="iv-tool u-tap" @click="openManual">
            <AppIcon name="plus" :size="14" /> 手动添加
          </button>
        </div>
      </div>

      <!-- SKU 行 -->
      <div class="iv-pad">
        <SkeletonBlock v-if="loading" height="120px" radius="12px" />
        <div v-else-if="rows.length" class="iv-rows">
          <div v-for="r in rows" :key="r.id" class="u-card iv-row">
            <div class="iv-row__head">
              <div class="iv-row__name">
                <p class="iv-row__title">{{ r.skuName || '未命名 SKU' }}</p>
                <p v-if="r.skuCode" class="iv-row__code">{{ r.skuCode }}</p>
              </div>
              <button type="button" class="iv-row__del u-tap" aria-label="删除该行" @click="removeRow(r.id)">
                <AppIcon name="trash" :size="15" color="var(--text-3)" />
              </button>
            </div>

            <div class="iv-row__grid">
              <div class="iv-stepper">
                <span class="iv-stepper__cap">库存量</span>
                <div class="iv-stepper__body">
                  <button type="button" class="iv-step u-tap" aria-label="减少库存" @click="stepQty(r, 'qty', -1)">−</button>
                  <input v-model.number="r.qty" class="iv-stepper__input" type="number" inputmode="numeric" min="0" />
                  <button type="button" class="iv-step u-tap" aria-label="增加库存" @click="stepQty(r, 'qty', 1)">+</button>
                </div>
              </div>
              <div class="iv-stepper">
                <span class="iv-stepper__cap">货架量</span>
                <div class="iv-stepper__body">
                  <button type="button" class="iv-step u-tap" aria-label="减少货架量" @click="stepQty(r, 'shelfQty', -1)">−</button>
                  <input v-model.number="r.shelfQty" class="iv-stepper__input" type="number" inputmode="numeric" min="0" />
                  <button type="button" class="iv-step u-tap" aria-label="增加货架量" @click="stepQty(r, 'shelfQty', 1)">+</button>
                </div>
              </div>
            </div>

            <div class="iv-row__expire">
              <span class="iv-stepper__cap">到期日</span>
              <input v-model="r.expireAt" class="iv-date" type="date" />
              <span
                v-if="expiryTag(r.expireAt)"
                class="iv-tag"
                :class="`iv-tag--${expiryTag(r.expireAt)?.tone}`"
              >
                {{ expiryTag(r.expireAt)?.text }}
              </span>
            </div>

            <input
              v-model="r.note"
              class="iv-note"
              type="text"
              maxlength="60"
              placeholder="备注（选填），如「后仓 2 箱待上架」"
            />
          </div>
        </div>
        <EmptyState
          v-else
          icon="package"
          title="暂无 SKU 清单"
          desc="该店暂无盘点记录与 AI 补货明细，请扫码或手动添加"
          action-text="手动添加 SKU"
          @action="openManual"
        />
      </div>

      <!-- 上次盘点 -->
      <div v-if="lastInventory" class="iv-pad">
        <p class="iv-sec-title">上次盘点 · {{ formatShortTime(lastInventory.createdAt) }} · {{ lastInventory.count }} 项</p>
        <div class="u-card iv-last">
          <div v-for="(it, i) in lastInventory.items" :key="i" class="iv-last__row">
            <span class="iv-last__name u-ellipsis">{{ it.skuName }}</span>
            <span class="iv-last__num">{{ it.qty }} / {{ it.shelfQty }}</span>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div v-if="store" class="iv-bar u-safe-bottom">
        <button type="button" class="iv-submit" :disabled="submitting || !rows.length" @click="submit">
          <AppIcon name="check" :size="17" color="#fff" />
          {{ submitting ? '提交中…' : '提交盘点' }}
        </button>
      </div>
    </template>

    <!-- 手动录入弹层 -->
    <div v-if="manualOpen" class="iv-mask" @click.self="manualOpen = false">
      <div class="iv-dialog" role="dialog" aria-modal="true" aria-labelledby="iv-manual-title">
        <p id="iv-manual-title" class="iv-dialog__title">手动添加 SKU</p>
        <input v-model="manualCode" class="iv-input" type="text" placeholder="SKU 编码（如 TLS-250）" />
        <input v-model="manualName" class="iv-input" type="text" placeholder="SKU 名称（如 特仑苏纯牛奶 250ml）" />
        <div class="iv-dialog__btns">
          <button type="button" class="iv-dbtn u-tap" @click="manualOpen = false">取消</button>
          <button type="button" class="iv-dbtn iv-dbtn--primary u-tap" @click="confirmManual">添加</button>
        </div>
      </div>
    </div>

    <!-- 扫码取景器 -->
    <div v-if="scanOpen" class="iv-scan">
      <video ref="videoRef" class="iv-scan__video" muted playsinline />
      <div class="iv-scan__frame" />
      <p class="iv-scan__hint">{{ scanHint }}</p>
      <button type="button" class="iv-scan__close u-tap" @click="closeScan">关闭扫码</button>
    </div>

    <!-- 提交成功 -->
    <div v-if="success" class="iv-mask" @click.self="closeSuccess">
      <div class="iv-dialog iv-dialog--center" role="dialog" aria-modal="true" aria-labelledby="iv-ok-title">
        <div class="iv-ok__icon"><AppIcon name="check" :size="26" color="#fff" /></div>
        <p id="iv-ok-title" class="iv-ok__title">盘点已提交</p>
        <p class="iv-ok__sub">{{ store?.name }} · 共 {{ submittedCount }} 项明细</p>
        <div class="iv-dialog__btns">
          <button type="button" class="iv-dbtn u-tap" @click="closeSuccess">继续盘点</button>
          <button type="button" class="iv-dbtn iv-dbtn--primary u-tap" @click="backToToday">返回今日巡店</button>
        </div>
      </div>
    </div>
  </MobileLayout>
</template>

<style scoped>
.iv-pad {
  padding: 14px 12px 0;
}

.iv-store {
  padding: 12px;
  border-left: 4px solid var(--mn-green);
}

.iv-store__name {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

.iv-store__meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-3);
}

/* 概览 */
.iv-summary {
  display: flex;
  padding: 14px 6px;
}

.iv-summary__cell {
  flex: 1;
  text-align: center;
  border-right: 1px dashed var(--border-color);
}

.iv-summary__cell:last-child {
  border-right: none;
}

.iv-summary__cell b {
  display: block;
  font-size: 20px;
  font-weight: 800;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.iv-summary__cell.is-warn b {
  color: var(--danger-fg);
}

.iv-summary__cell span {
  font-size: 11px;
  color: var(--text-3);
}

.iv-tools {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.iv-tool {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 44px;
  border: 1px solid var(--mn-green);
  border-radius: 12px;
  background: var(--bg-card);
  color: var(--mn-green-dark);
  font-size: 13px;
  font-weight: 600;
}

.iv-tool--primary {
  background: var(--mn-green);
  color: #fff;
}

/* SKU 行 */
.iv-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.iv-row {
  padding: 12px;
}

.iv-row__head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.iv-row__name {
  flex: 1;
  min-width: 0;
}

.iv-row__title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.iv-row__code {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.iv-row__del {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: var(--bg-page);
}

.iv-row__grid {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.iv-stepper {
  flex: 1;
}

.iv-stepper__cap {
  display: block;
  margin-bottom: 5px;
  font-size: 11px;
  color: var(--text-3);
}

.iv-stepper__body {
  display: flex;
  align-items: center;
  gap: 6px;
}

.iv-step {
  flex: none;
  width: 34px;
  height: 34px;
  border: 1px solid var(--mn-green);
  border-radius: 50%;
  background: var(--bg-card);
  color: var(--mn-green-dark);
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
}

.iv-stepper__input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 6px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--text-1);
  font-size: 14px;
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.iv-row__expire {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.iv-date {
  flex: 1;
  height: 36px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--text-1);
  font-size: 12.5px;
}

.iv-tag {
  flex: none;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.iv-tag--warning {
  background: var(--warning-bg);
  color: var(--warning-fg);
}

.iv-tag--danger {
  background: var(--danger-bg);
  color: var(--danger-fg);
}

.iv-note {
  width: 100%;
  height: 38px;
  margin-top: 10px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--text-1);
  font-size: 12.5px;
}

/* 上次盘点 */
.iv-sec-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}

.iv-last {
  padding: 4px 12px;
}

.iv-last__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 0;
  border-bottom: 1px dashed var(--border-color);
  font-size: 12.5px;
}

.iv-last__row:last-child {
  border-bottom: none;
}

.iv-last__name {
  flex: 1;
  min-width: 0;
  color: var(--text-1);
}

.iv-last__num {
  flex: none;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

/* 底部栏 */
.iv-bar {
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

.iv-submit {
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

.iv-submit:disabled {
  background: var(--text-4);
  box-shadow: none;
  opacity: 0.85;
}

/* 弹层 / 扫码 */
.iv-mask {
  position: absolute;
  inset: 0;
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.42);
}

.iv-dialog {
  width: 100%;
  padding: 18px 16px;
  border-radius: 16px;
  background: var(--bg-card);
}

.iv-dialog--center {
  text-align: center;
}

.iv-dialog__title {
  margin-bottom: 12px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-1);
}

.iv-input {
  width: 100%;
  height: 44px;
  margin-bottom: 10px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-page);
  color: var(--text-1);
  font-size: 13px;
}

.iv-dialog__btns {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.iv-dbtn {
  flex: 1;
  min-height: 44px;
  border: 1px solid var(--border-color);
  border-radius: 22px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 14px;
  font-weight: 600;
}

.iv-dbtn--primary {
  border: none;
  background: var(--mn-green);
  color: #fff;
}

.iv-ok__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin: 0 auto;
  border-radius: 50%;
  background: var(--mn-green);
}

.iv-ok__title {
  margin-top: 12px;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-1);
}

.iv-ok__sub {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-3);
}

.iv-scan {
  position: absolute;
  inset: 0;
  z-index: 1500;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.86);
}

.iv-scan__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.82;
}

.iv-scan__frame {
  position: relative;
  width: 72%;
  height: 42%;
  border: 2px solid var(--mn-green);
  border-radius: 14px;
  box-shadow: 0 0 0 2000px rgba(0, 0, 0, 0.32);
}

.iv-scan__hint {
  position: relative;
  margin-top: 18px;
  color: #fff;
  font-size: 13px;
}

.iv-scan__close {
  position: relative;
  margin-top: 20px;
  min-height: 44px;
  padding: 0 24px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 22px;
  background: rgba(26, 31, 28, 0.55);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}
</style>
