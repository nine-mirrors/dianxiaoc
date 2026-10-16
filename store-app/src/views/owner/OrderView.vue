<script setup lang="ts">
/**
 * 我的订单（店主端 /owner/orders）。
 *
 * 数据：GET /tickets?storeId=&kind=order（真实单据，不编造）。
 *  - 状态 Tab 全部 / 待接单 / 已接单；
 *  - 卡片显示单据号、时间、SKU 明细、总瓶数、总金额、状态徽章，点击展开明细；
 *  - 无「取消订单」（后端无此能力，不提供不存在的操作）。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MilkDropLoader from '@/components/common/MilkDropLoader.vue'
import { useCountUp } from '@/composables/useCountUp'
import { useSessionStore } from '@/stores/session'
import { resolveOwnerStore, getTickets } from '@/api/owner'
import type { Ticket, TicketStatus } from '@/types'

const router = useRouter()
const session = useSessionStore()

const storeId = ref<string>('')
const tickets = ref<Ticket[]>([])
const loading = ref<boolean>(true)
const loadError = ref<string>('')

type TabKey = 'all' | 'pending' | 'accepted'
const tab = ref<TabKey>('all')
const expanded = ref<Record<string, boolean>>({})

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待接单' },
  { key: 'accepted', label: '已接单' },
]

const filtered = computed<Ticket[]>(() => {
  if (tab.value === 'all') return tickets.value
  return tickets.value.filter((t) => t.status === tab.value)
})

const pendingCount = computed<number>(() => tickets.value.filter((t) => t.status === 'pending').length)
const acceptedCount = computed<number>(() => tickets.value.filter((t) => t.status === 'accepted').length)

/** 本月（按单据创建时间 YYYY-MM 前缀匹配当前月） */
const currentMonth = new Date().toISOString().slice(0, 7)
const monthCount = computed<number>(
  () => tickets.value.filter((t) => String(t.createdAt ?? '').slice(0, 7) === currentMonth).length,
)
const totalBottles = computed<number>(() => tickets.value.reduce((s, t) => s + (t.totalBottles || 0), 0))

/** 顶部统计四个关键数字滚动入场 */
const monthUp = useCountUp(() => monthCount.value)
const bottlesTotalUp = useCountUp(() => totalBottles.value)
const pendingUp = useCountUp(() => pendingCount.value)
const acceptedUp = useCountUp(() => acceptedCount.value)

function statusMeta(status: TicketStatus): { text: string; cls: string } {
  return status === 'accepted'
    ? { text: '已接单', cls: 'ok' }
    : { text: '待接单', cls: 'pending' }
}

function toggle(id: string): void {
  expanded.value[id] = !expanded.value[id]
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const store = await resolveOwnerStore(session.user?.name)
    if (!store) {
      loadError.value = '没找到你的门店，请确认登录账号与门店的绑定关系'
      return
    }
    storeId.value = store.id
    const res = await getTickets({ storeId: store.id, kind: 'order' })
    tickets.value = res.tickets ?? []
  } catch (e) {
    loadError.value = (e as Error)?.message || '订单没拉到，请稍后重试'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <MobileLayout title="我的订单" :back="true" :show-tab-bar="true" :content-padding-bottom="24" @back="router.push('/owner')">
    <div class="ov mot-rise">
      <div v-if="loading" class="ov__loading">
        <MilkDropLoader size="card" label="正在加载订单" />
      </div>

      <EmptyState
        v-else-if="loadError"
        icon="warning"
        title="订单没拉到"
        :desc="loadError"
        action-text="重新加载"
        @action="load"
      />

      <template v-else>
        <!-- 统计 -->
        <section class="u-card ov__stats mot-stagger">
          <div class="ov__stat">
            <p class="ov__stat-num">{{ monthUp.text }}</p>
            <p class="ov__stat-cap">本月订单</p>
          </div>
          <div class="ov__stat">
            <p class="ov__stat-num">{{ bottlesTotalUp.text }}</p>
            <p class="ov__stat-cap">累计订货（瓶）</p>
          </div>
          <div class="ov__stat">
            <p class="ov__stat-num is-warn">{{ pendingUp.text }}</p>
            <p class="ov__stat-cap">待接单</p>
          </div>
          <div class="ov__stat">
            <p class="ov__stat-num is-ok">{{ acceptedUp.text }}</p>
            <p class="ov__stat-cap">已接单</p>
          </div>
        </section>

        <!-- 状态 Tab -->
        <div class="ov__tabs" role="tablist">
          <button
            v-for="t in TABS"
            :key="t.key"
            type="button"
            class="ov__tab u-tap mot-tap"
            :class="{ 'ov__tab--on': tab === t.key }"
            role="tab"
            :aria-selected="tab === t.key"
            @click="tab = t.key"
          >
            {{ t.label }}
          </button>
        </div>

        <!-- 列表 -->
        <EmptyState
          v-if="!filtered.length"
          icon="cart"
          title="还没有订单"
          desc="看完货架觉得该补货，就能一键下单，订单会显示在这里。"
          action-text="去补货模拟"
          @action="router.push('/owner/restock')"
        />

        <template v-else>
        <section
          v-for="(t, i) in filtered"
          :key="t.id"
          class="u-card ov__card mot-fade-up mot-hover-lift"
          :style="{ animationDelay: `${Math.min(i, 6) * 60}ms` }"
        >
          <button type="button" class="ov__card-head u-tap mot-tap" @click="toggle(t.id)">
            <div class="ov__card-head-main">
              <p class="ov__id">{{ t.id }}</p>
              <p class="ov__time">{{ t.createdAt }}</p>
            </div>
            <span class="ov__state" :class="`ov__state--${statusMeta(t.status).cls}`">
              {{ statusMeta(t.status).text }}
            </span>
          </button>

          <div class="ov__card-body">
            <p class="ov__items u-ellipsis-2">
              {{ (t.items ?? []).map((i) => i.skuName).join('、') || '（无明细）' }}
            </p>
            <div class="ov__totals">
              <span>总瓶数 <b>{{ t.totalBottles }} 瓶</b></span>
              <span>总金额 <b>¥{{ t.totalAmount }}</b></span>
            </div>

            <div v-if="expanded[t.id]" class="ov__expand mot-stagger">
              <div v-for="it in t.items" :key="it.skuId" class="ov__line">
                <span class="ov__line-name">{{ it.skuName }}</span>
                <span class="ov__line-val">{{ it.bottles }} 瓶 · ¥{{ it.amount }}</span>
              </div>
              <p v-if="t.note" class="ov__note">
                <AppIcon name="clipboard" :size="12" /> {{ t.note }}
              </p>
            </div>
          </div>

          <button type="button" class="ov__toggle u-tap mot-tap" @click="toggle(t.id)">
            {{ expanded[t.id] ? '收起明细 ▴' : '展开明细 ▾' }}
          </button>
        </section>
        </template>
      </template>
    </div>
  </MobileLayout>
</template>

<style scoped>
.ov {
  padding: 14px 16px;
}

.ov__loading {
  padding: 60px 0;
}

/* ── 统计 ── */
.ov__stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 14px 8px;
  margin-bottom: 12px;
}

.ov__stat {
  text-align: center;
}

.ov__stat-num {
  font-size: 20px;
  font-weight: 800;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.ov__stat-num.is-warn { color: var(--warning-fg); }
.ov__stat-num.is-ok { color: var(--success-fg); }

.ov__stat-cap {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
}

/* ── Tab ── */
.ov__tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.ov__tab {
  flex: 1;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
}

.ov__tab--on {
  border-color: transparent;
  background: var(--brand-deep);
  color: var(--milk);
}

/* ── 卡片 ── */
.ov__card {
  padding: 12px 14px;
  margin-bottom: 10px;
}

.ov__card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
}

.ov__card-head-main {
  min-width: 0;
}

.ov__id {
  font-size: 12.5px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  color: var(--text-2);
  word-break: break-all;
}

.ov__time {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
}

.ov__state {
  flex: none;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
}

.ov__state--pending {
  background: var(--info-bg);
  color: var(--info-fg);
}

.ov__state--ok {
  background: var(--success-bg);
  color: var(--success-fg);
}

.ov__card-body {
  margin-top: 8px;
}

.ov__items {
  font-size: 13px;
  color: var(--text-1);
  line-height: 1.6;
}

.ov__totals {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-3);
}

.ov__totals b {
  font-size: 13.5px;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.ov__expand {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-page);
}

.ov__line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 0;
  border-bottom: 1px dashed var(--border-color);
  font-size: 12.5px;
}

.ov__line:last-of-type {
  border-bottom: none;
}

.ov__line-name {
  color: var(--text-1);
}

.ov__line-val {
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.ov__note {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.6;
}

.ov__toggle {
  margin-top: 8px;
  padding: 0;
  border: none;
  background: none;
  color: var(--brand-deep);
  font-size: 12px;
  font-weight: 600;
}
</style>
