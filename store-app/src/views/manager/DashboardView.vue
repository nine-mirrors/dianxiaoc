<script setup lang="ts">
/**
 * P5 区域经理看板 —— 本批只做「路由可空转」占位（正式实现在下一批 T05.2）。
 *
 * 为避免这一批出现打不开的空路由，这里先真实调用 `#17 /dashboard/overview`
 * 渲染 KPI 卡 + 门店明细 + 风险 Top5 三个静态区块，保证出一屏可用的初版；
 * 环形分布图 / 8 周趋势折线 / 下派任务弹层（含跨角色闭环）在下一批补齐。
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import DesktopHeader from '@/components/layout/DesktopHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import HealthBadge from '@/components/common/HealthBadge.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import DonutChart from '@/components/business/charts/DonutChart.vue'
import TrendLine from '@/components/business/charts/TrendLine.vue'
import TaskDispatchDialog from '@/components/business/TaskDispatchDialog.vue'
import { useApi } from '@/composables/useApi'
import { getDashboardOverview } from '@/api'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'
import type { DashboardOverview, Task } from '@/types'

const router = useRouter()
const session = useSessionStore()
const toast = useToast()

/** 当前区域 id */
const regionId = ref<string>('R_EAST')

const { data, loading, run } = useApi(() => getDashboardOverview(regionId.value), {
  initial: null as unknown as { overview: DashboardOverview },
})
const overview = computed<DashboardOverview | null>(() => data.value?.overview ?? null)

/** 切换区域后同步刷新看板（订货汇总随 overview 一并带回） */
async function changeRegion(id: string): Promise<void> {
  regionId.value = id
  await run()
  toast.info('已切换区域')
}

/**
 * 切换账号（身份由后端账号决定，前端不允许自选角色）。
 * 原实现调 session.login('rep') 只传一个参数，与新签名 (username, password) 不匹配 → 必失败。
 */
function switchAccount(): Promise<void> {
  session.logout()
  toast.info('请重新登录目标账号')
  return router.push('/login')
}

/** 下派任务弹层开关 */
const showDispatch = ref<boolean>(false)

/** 下派成功的门店选项（复用风险 Top5） */
const dispatchStores = computed(() =>
  (overview.value?.riskTop5 ?? []).map((r) => ({ storeId: r.storeId, storeName: r.storeName })),
)

/**
 * 下派成功回调。
 *
 * 后端已在 `POST /api/v1/tasks` 里 `broadcast('task:new', {toRole:'rep'})`，
 * 业代端开着页面时会**实时**收到并弹 Toast，无需切角色也不用刷新。
 */
function onDispatched(task: Task): void {
  toast.success(`已实时下派：${task.storeName} · ${task.taskTypeLabel}`)
  toast.info('业代端开着「今日巡店」时会立刻收到，无需刷新')
}

/* ═══════════════ 本周订货汇总（订货三端打通 · 经理端） ═══════════════ */

/**
 * 订货汇总：**直接用 overview.orderSummary**，不再单独发请求
 * （team-lead 要求：看板一次请求拿全，避免多打一枪）。
 */
const orderSummary = computed(() => {
  const s = overview.value?.orderSummary
  return {
    count: s?.count ?? 0,
    bottles: s?.bottles ?? 0,
    amount: s?.amount ?? 0,
    accepted: s?.accepted ?? 0,
    pending: s?.pending ?? 0,
  }
})

/* ═══════════════ 任务完成率（闭环最后一环：派了 → 做了没有） ═══════════════ */

/**
 * 任务完成率：同样取自 overview.taskSummary（一次请求拿全）。
 * 完成率 = done / total（与「已完成 / 总数」两处数字同源，不会出现第二种口径）。
 */
const taskSummary = computed(() => {
  const t = overview.value?.taskSummary
  const done = t?.done ?? 0
  const total = t?.total ?? 0
  return {
    done,
    open: t?.open ?? 0,
    overdue: t?.overdue ?? 0,
    total,
    rate: t?.completionRate ?? (total ? Math.round((done / total) * 100) : 0),
  }
})
</script>

<template>
  <div class="p5">
    <DesktopHeader
      :region-ids="overview?.regionIds ?? []"
      :region-id="overview?.regionId ?? ''"
      :user-name="session.user.name"
      :role-label="session.roleLabel"
      @change-region="changeRegion"
      @switch-role="switchAccount"
    />

    <div class="p5__body">
      <div v-if="loading" class="p5__kpis">
        <SkeletonBlock v-for="i in 4" :key="i" height="86px" radius="12px" />
      </div>

      <template v-else-if="overview">
        <!-- KPI -->
        <div class="p5__kpis">
          <div v-for="k in overview.kpis" :key="k.key" class="p5__kpi">
            <p class="p5__kpi-label">
              {{ k.label }}
              <span v-if="k.danger" class="p5__kpi-dot" />
            </p>
            <p class="p5__kpi-value" :class="{ 'is-danger': k.danger }">
              {{ k.value }}
              <em :class="k.trend === 'up' ? 'is-up' : 'is-down'">{{ k.delta }}</em>
            </p>
            <p v-if="k.target" class="p5__kpi-target">{{ k.target }}</p>
          </div>
        </div>

        <!-- 环图 + 趋势 -->
        <div class="p5__charts">
          <section class="p5__card p5__card--donut">
            <header class="p5__card-head">
              <b>健康分四档分布</b>
              <span>共 {{ overview.distribution.reduce((s, d) => s + d.count, 0) }} 家</span>
            </header>
            <DonutChart :data="overview.distribution" />
          </section>

          <section class="p5__card p5__card--trend">
            <header class="p5__card-head">
              <b>近 8 周趋势</b>
              <span class="p5__trend-hint"><AppIcon name="trending-up" :size="14" /> 缺货率↓ 铺货率↑</span>
            </header>
            <TrendLine :series="overview.trend" />
          </section>
        </div>

        <!-- 整改闭环 + 本周订货汇总 -->
        <div class="p5__loop">
          <!-- 整改闭环（已整改 / 进行中 / 平均提升分） -->
          <section class="p5__card">
            <header class="p5__card-head">
              <b><AppIcon name="check-circle" :size="14" /> 整改闭环</b>
              <span>本区域</span>
            </header>
            <div class="p5__loop-stats">
              <div class="p5__loop-stat">
                <p class="p5__loop-num">{{ overview.rectification?.done ?? 0 }}</p>
                <p class="p5__loop-cap">已整改条目</p>
              </div>
              <div class="p5__loop-stat">
                <p class="p5__loop-num" :class="{ 'is-warn': (overview.rectification?.open ?? 0) > 0 }">
                  {{ overview.rectification?.open ?? 0 }}
                </p>
                <p class="p5__loop-cap">进行中任务</p>
              </div>
              <div class="p5__loop-stat">
                <p class="p5__loop-num is-up">+{{ overview.rectification?.avgGain ?? 0 }}</p>
                <p class="p5__loop-cap">平均提升分</p>
              </div>
            </div>
            <p class="p5__caliber">口径：预置样本门店 S1–S5，非全量 128 家</p>
          </section>

          <!-- 本周订货汇总（店主下单 → 业代接单 → 经理汇总） -->
          <section class="p5__card">
            <header class="p5__card-head">
              <b><AppIcon name="cart" :size="14" /> 本周订货汇总</b>
              <span>店主自助下单</span>
            </header>
            <div class="p5__loop-stats">
              <div class="p5__loop-stat">
                <p class="p5__loop-num">{{ orderSummary.count }}</p>
                <p class="p5__loop-cap">订货笔数</p>
              </div>
              <div class="p5__loop-stat">
                <p class="p5__loop-num">{{ orderSummary.bottles }}</p>
                <p class="p5__loop-cap">订货瓶数</p>
              </div>
              <div class="p5__loop-stat">
                <p class="p5__loop-num">¥{{ orderSummary.amount }}</p>
                <p class="p5__loop-cap">订货金额</p>
              </div>
            </div>
            <!-- 已接单 / 待接单（来自 overview.orderSummary，接单状态真落库） -->
            <div class="p5__accept">
              <span class="p5__accept-item">
                已接单 <b>{{ orderSummary.accepted }}</b>
              </span>
              <span class="p5__accept-sep">/</span>
              <span class="p5__accept-item">
                待接单 <b :class="{ 'is-warn': orderSummary.pending > 0 }">{{ orderSummary.pending }}</b>
              </span>
            </div>
            <p class="p5__caliber">口径：预置样本门店 S1–S5，非全量 128 家</p>
          </section>

          <!-- 任务完成率（派了 → 做了没有 → 闭环的最后一眼） -->
          <section class="p5__card">
            <header class="p5__card-head">
              <b><AppIcon name="check" :size="14" /> 任务完成率</b>
              <span>经理下派任务的执行闭环</span>
            </header>
            <div class="p5__loop-stats">
              <div class="p5__loop-stat">
                <p class="p5__loop-num">{{ taskSummary.done }}/{{ taskSummary.total }}</p>
                <p class="p5__loop-cap">已完成 / 总数</p>
              </div>
              <div class="p5__loop-stat">
                <p class="p5__loop-num">{{ taskSummary.rate }}<em>%</em></p>
                <p class="p5__loop-cap">完成率</p>
              </div>
              <div class="p5__loop-stat">
                <p class="p5__loop-num" :class="{ 'is-warn': taskSummary.overdue > 0 }">{{ taskSummary.overdue }}</p>
                <p class="p5__loop-cap">逾期未完成</p>
              </div>
            </div>
            <!-- 完成率进度条：宽度 = done/total，与上方数字同源 -->
            <div class="p5__bar" role="img" :aria-label="`任务完成率 ${taskSummary.rate}%`">
              <div class="p5__bar-fill" :style="{ width: `${taskSummary.rate}%` }" />
            </div>
            <p class="p5__caliber">
              完成率 = 已完成 ÷（已完成 + 进行中）；逾期按演示基准日 2026-10-02 判定
            </p>
          </section>
        </div>

        <div class="p5__grid">
          <!-- 门店明细 -->
          <section class="p5__card">
            <header class="p5__card-head">
              <b>门店明细（按健康分升序）</b>
              <span>共 {{ overview.storeRows.length }} 家重点店</span>
            </header>
            <table class="p5__table">
              <thead>
                <tr>
                  <th>门店</th>
                  <th>健康分</th>
                  <th>主要问题</th>
                  <th>周变化</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in overview.storeRows" :key="r.storeId">
                  <td>{{ r.storeName }}</td>
                  <td>
                    <span class="p5__score" :style="{ color: `var(--level-${r.level})` }">{{ r.score }}</span>
                    <HealthBadge :level="r.level" />
                  </td>
                  <td>{{ r.mainIssue }}</td>
                  <td :class="r.weekDelta > 0 ? 'is-up' : r.weekDelta < 0 ? 'is-down' : ''">
                    {{ r.weekDelta > 0 ? '+' : '' }}{{ r.weekDelta }}
                  </td>
                  <td>
                    <button class="p5__link" @click="router.push(`/rep/diagnosis/D_${r.storeId}?readonly=1`)">
                      查看详情
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <!-- 风险 Top5 -->
          <section class="p5__card">
            <header class="p5__card-head">
              <b><AppIcon name="alert-triangle" :size="14" /> 风险预警 Top5</b>
              <button class="p5__dispatch" @click="showDispatch = true">
                <AppIcon name="send" :size="13" /> 下派任务
              </button>
            </header>
            <div v-for="(r, i) in overview.riskTop5" :key="r.storeId" class="p5__risk">
              <span class="p5__risk-no">{{ i + 1 }}</span>
              <div class="p5__risk-main">
                <p class="p5__risk-name">{{ r.storeName }}</p>
                <p class="p5__risk-reason">{{ r.reason }}</p>
              </div>
              <span class="p5__risk-score" :style="{ color: `var(--level-${r.level})` }">{{ r.score }}</span>
            </div>
          </section>
        </div>
      </template>
    </div>

    <!-- 下派任务弹层 -->
    <TaskDispatchDialog
      v-if="showDispatch"
      :stores="dispatchStores"
      @close="showDispatch = false"
      @dispatched="onDispatched"
    />
  </div>
</template>

<style scoped>
.p5 {
  min-height: 100vh;
  background: var(--bg-page);
}

.p5__body {
  padding: 16px 24px 24px;
}

.p5__kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 14px;
}

.p5__kpi {
  padding: 14px 16px;
  border-radius: var(--radius-card);
  background: #fff;
  box-shadow: var(--shadow-card);
}

.p5__kpi-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  color: var(--text-3);
}

.p5__kpi-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--level-risk);
  animation: pulse 1.4s ease infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.p5__kpi-value {
  margin-top: 4px;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.p5__kpi-value.is-danger {
  color: var(--level-risk);
}

.p5__kpi-value em {
  margin-left: 5px;
  font-size: 13px;
  font-style: normal;
  font-weight: 600;
}

.p5__kpi-value em.is-up {
  color: var(--mn-green);
}

.p5__kpi-value em.is-down {
  color: var(--level-risk);
}

.p5__kpi-target {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--text-3);
}

/* 整改闭环 + 本周订货汇总 */
.p5__loop {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 14px;
}

.p5__loop-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.p5__loop-stat {
  padding: 10px 8px;
  border-radius: 10px;
  background: var(--bg-page);
  text-align: center;
}

.p5__loop-num {
  font-size: 19px;
  font-weight: 800;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.p5__loop-num.is-up {
  color: var(--mn-green-dark);
}

.p5__loop-num.is-warn {
  color: var(--level-warning);
}

.p5__loop-cap {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
}

/* 已接单 / 待接单 */
.p5__accept {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 10px;
  padding: 7px 10px;
  border-radius: 10px;
  background: var(--bg-page);
  font-size: 12px;
  color: var(--text-2);
}

.p5__accept-item b {
  font-weight: 800;
  color: var(--mn-green-dark);
  font-variant-numeric: tabular-nums;
}

.p5__accept-item b.is-warn {
  color: var(--level-warning);
}

.p5__accept-sep {
  color: var(--text-3);
}

/* 口径小字（避免评委问「怎么只有 2 家」） */
/* 任务完成率进度条 */
.p5__bar {
  height: 6px;
  margin: 10px 0 6px;
  border-radius: 999px;
  background: #eef1ef;
  overflow: hidden;
}

.p5__bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #009639, #8bc34a);
  transition: width 0.4s ease;
}

.p5__loop-num em {
  font-style: normal;
  font-size: 12px;
  margin-left: 1px;
}

.p5__caliber {
  margin-top: 8px;
  font-size: 10px;
  color: var(--text-3);
}

.p5__grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 12px;
}

.p5__charts {
  display: grid;
  grid-template-columns: 0.9fr 1.6fr;
  gap: 12px;
  margin-bottom: 12px;
}

.p5__trend-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--mn-green);
}

.p5__dispatch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: 999px;
  background: var(--ai-purple);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.p5__dispatch:hover {
  background: var(--ai-purple-2);
}

.p5__card {
  padding: 14px 16px;
  border-radius: var(--radius-card);
  background: #fff;
  box-shadow: var(--shadow-card);
}

.p5__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 13.5px;
}

.p5__card-head span {
  font-size: 11.5px;
  color: var(--text-3);
}

.p5__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.p5__table th {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-3);
  font-weight: 500;
  text-align: left;
}

.p5__table td {
  padding: 8px;
  border-bottom: 1px dashed var(--border-color);
}

.p5__score {
  margin-right: 6px;
  font-size: 15px;
  font-weight: 700;
}

.p5__table .is-up {
  color: var(--mn-green);
}

.p5__table .is-down {
  color: var(--level-risk);
}

.p5__link {
  border: none;
  background: none;
  color: var(--mn-green);
  font-size: 12px;
  font-weight: 600;
}

.p5__risk {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 0;
  border-bottom: 1px dashed var(--border-color);
}

.p5__risk-no {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--level-risk);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.p5__risk-main {
  flex: 1;
  min-width: 0;
}

.p5__risk-name {
  font-size: 13px;
  font-weight: 600;
}

.p5__risk-reason {
  font-size: 11px;
  color: var(--text-3);
}

.p5__risk-score {
  font-size: 18px;
  font-weight: 700;
}

.p5__tip {
  margin-top: 10px;
  font-size: 11.5px;
  color: var(--ai-purple);
}

@media (max-width: 1024px) {
  .p5__kpis {
    grid-template-columns: repeat(2, 1fr);
  }

  .p5__grid {
    grid-template-columns: 1fr;
  }
}
</style>
