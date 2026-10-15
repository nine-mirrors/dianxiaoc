<script setup lang="ts">
/**
 * LeaderboardView（/manager/leaderboard）—— 业代排行榜。
 *
 * 数据：`GET /performance/leaderboard`（list + 算分口径 method），
 * 表格列按后端返回字段自适应；顶部前三名领奖台；底部固定展示 method 算分口径（可折叠）；
 * 「导出 CSV」走 `GET /export/leaderboard.csv`（裸 CSV，blob 下载）。
 */
import { computed, onMounted, ref } from 'vue'
import DesktopHeader from '@/components/layout/DesktopHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import { useToast } from '@/composables/useToast'
import { useSessionStore } from '@/stores/session'
import { getLeaderboard, exportLeaderboardCsv } from '@/api/insights'
import type { LeaderboardRow } from '@/api/insights'
import { getDashboardOverview } from '@/api'
import type { DashboardOverview } from '@/types'

/** 后端看板实际返回比共享类型多 regionName / regionStoreTotal（本页只用 regionName 做副标题） */
type OverviewExt = DashboardOverview & { regionName?: string; regionStoreTotal?: number }

const session = useSessionStore()
const { success, info, error: toastError } = useToast()

const list = ref<LeaderboardRow[]>([])
const method = ref<string>('')
const loading = ref<boolean>(true)
const loadError = ref<boolean>(false)
const showMethod = ref<boolean>(false)
const overview = ref<OverviewExt | null>(null)

const top3 = computed<LeaderboardRow[]>(() => list.value.slice(0, 3))

/** 领奖台顺序：2 - 1 - 3（视觉居中最高） */
const podium = computed<LeaderboardRow[]>(() => {
  const t = top3.value
  const out: LeaderboardRow[] = []
  if (t[1]) out.push(t[1])
  if (t[0]) out.push(t[0])
  if (t[2]) out.push(t[2])
  return out
})

function medalOf(rank: number): { label: string; cls: string } {
  if (rank === 1) return { label: '冠军', cls: 'gold' }
  if (rank === 2) return { label: '亚军', cls: 'silver' }
  if (rank === 3) return { label: '季军', cls: 'bronze' }
  return { label: `${rank}`, cls: '' }
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = false
  try {
    const res = await getLeaderboard()
    list.value = res.list ?? []
    method.value = res.method ?? ''
  } catch (e) {
    loadError.value = true
    toastError((e as Error)?.message || '排行榜加载失败')
  } finally {
    loading.value = false
  }
}

/** 区域名（用于顶栏副标题；拿不到就退回区域 id） */
async function loadOverview(): Promise<void> {
  try {
    const res = await getDashboardOverview('R_EAST')
    overview.value = res.overview
  } catch {
    overview.value = null
  }
}

async function doExport(): Promise<void> {
  try {
    await exportLeaderboardCsv()
    success('已导出排行榜 CSV（综合分与页面同源）')
  } catch (e) {
    toastError((e as Error)?.message || '导出失败')
  }
}

onMounted(() => {
  void load()
  void loadOverview()
})
</script>

<template>
  <div class="lb">
    <h1 class="u-sr-only">业代排行榜</h1>

    <DesktopHeader
      :region-ids="[]"
      region-id=""
      :user-name="session.user?.name ?? ''"
      :role-label="session.roleLabel"
      @switch-role="() => {}"
      @change-region="() => {}"
    />

    <div class="lb__body">
      <section class="u-card lb__bar">
        <div class="lb__bar-left">
          <AppIcon name="layers" :size="16" color="var(--mn-green)" />
          <h2 class="lb__bar-title">业代绩效排行榜</h2>
          <span class="lb__bar-sub">{{ overview?.regionName ?? '区域' }} · 综合分口径可展开查看</span>
        </div>
        <button type="button" class="u-btn u-btn--ghost" @click="doExport">
          <AppIcon name="download" :size="15" /> 导出 CSV
        </button>
      </section>

      <div v-if="loading" class="lb__skeleton">
        <SkeletonBlock height="140px" radius="14px" />
        <SkeletonBlock height="300px" radius="14px" />
      </div>

      <EmptyState
        v-else-if="loadError || !list.length"
        icon="layers"
        title="暂无排行榜数据"
        desc="当前账号可访问区域内尚未产生业代绩效数据，或后端服务未连接。"
        action-text="重新加载"
        @action="load"
      />

      <template v-else>
        <!-- 前三名领奖台 -->
        <div class="lb__podium">
          <div
            v-for="r in podium"
            :key="r.repId"
            class="lb__podium-card"
            :class="`lb__podium-card--${medalOf(r.rank).cls}`"
          >
            <span class="lb__medal">{{ medalOf(r.rank).label }}</span>
            <p class="lb__podium-name">{{ r.name }}</p>
            <p class="lb__podium-score">{{ r.score }}<em>分</em></p>
            <p class="lb__podium-meta">巡店 {{ r.visits }} 次 · 均分 {{ r.avgScore }}</p>
          </div>
        </div>

        <!-- 明细表 -->
        <section class="u-card lb__table-card">
          <header class="lb__table-head">
            <h2>综合排名明细</h2>
            <span>共 {{ list.length }} 位业代 · 按综合分降序</span>
          </header>
          <div class="lb__table-wrap">
            <table class="lb__table">
              <thead>
                <tr>
                  <th class="lb__col-rank">排名</th>
                  <th>姓名</th>
                  <th>巡店量</th>
                  <th>巡店质量</th>
                  <th>整改执行</th>
                  <th>红灯转化</th>
                  <th>综合分</th>
                  <th>算分明细</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in list" :key="r.repId">
                  <td class="lb__col-rank">
                    <span class="lb__rank" :class="`lb__rank--${medalOf(r.rank).cls}`">{{ r.rank }}</span>
                  </td>
                  <td class="lb__name">{{ r.name }}</td>
                  <td>{{ r.visits }} 次</td>
                  <td>{{ r.avgScore }} 分</td>
                  <td>{{ r.rectifications }} 条</td>
                  <td>{{ r.redLightConversions }} 家</td>
                  <td class="lb__score">{{ r.score }}</td>
                  <td class="lb__breakdown">
                    量 {{ r.scoreBreakdown?.visitLoad }} / 质 {{ r.scoreBreakdown?.visitQuality }} /
                    改 {{ r.scoreBreakdown?.rectification }} / 转 {{ r.scoreBreakdown?.redConversion }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- 算分口径（可折叠，默认收起） -->
        <section class="u-card lb__method">
          <button type="button" class="lb__method-toggle" :aria-expanded="showMethod" @click="showMethod = !showMethod">
            <AppIcon name="info" :size="14" color="var(--text-3)" />
            <span>综合分算分口径</span>
            <AppIcon :name="showMethod ? 'chevron-up' : 'chevron-down'" :size="14" color="var(--text-3)" />
          </button>
          <p v-if="showMethod" class="lb__method-text">
            {{ method || '暂无口径说明' }}
          </p>
          <p v-else class="lb__method-hint">点击展开查看每个分量的权重与取数来源（不编造、不外推）。</p>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.lb {
  min-height: 100vh;
  background: var(--bg-page);
}

.lb__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 1760px;
  margin: 0 auto;
  padding: 16px 24px 28px;
}

.lb__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px;
}

.lb__bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.lb__bar-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

.lb__bar-sub {
  font-size: 12px;
  color: var(--text-3);
}

.lb__skeleton {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 领奖台 */
.lb__podium {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  align-items: end;
}

.lb__podium-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 18px 14px;
  border-radius: var(--radius-card);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  border-top: 4px solid var(--border-strong);
}

.lb__podium-card--gold {
  order: -1;
  padding-top: 26px;
  padding-bottom: 26px;
  border-top-color: var(--gold);
  background: linear-gradient(180deg, var(--gold-mist), var(--bg-card));
}

.lb__podium-card--silver {
  border-top-color: var(--text-4);
}

.lb__podium-card--bronze {
  border-top-color: var(--amber);
}

.lb__medal {
  padding: 2px 12px;
  border-radius: 999px;
  background: var(--bg-page);
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-2);
}

.lb__podium-card--gold .lb__medal {
  background: var(--grad-gold);
  color: #fff;
}

.lb__podium-name {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-1);
}

.lb__podium-score {
  font-size: 30px;
  font-weight: 800;
  color: var(--mn-green-dark);
  font-variant-numeric: tabular-nums;
}

.lb__podium-score em {
  margin-left: 2px;
  font-size: 13px;
  font-style: normal;
  font-weight: 600;
  color: var(--text-3);
}

.lb__podium-meta {
  font-size: 12px;
  color: var(--text-3);
}

/* 表格 */
.lb__table-card {
  padding: 14px 16px;
}

.lb__table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.lb__table-head h2 {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.lb__table-head span {
  font-size: 11.5px;
  color: var(--text-3);
}

.lb__table-wrap {
  overflow-x: auto;
}

.lb__table {
  width: 100%;
  min-width: 820px;
  border-collapse: collapse;
  font-size: 12.5px;
}

.lb__table th {
  padding: 7px 8px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-3);
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
}

.lb__table td {
  padding: 9px 8px;
  border-bottom: 1px dashed var(--border-color);
  color: var(--text-2);
}

.lb__table tbody tr:hover td {
  background: var(--bg-subtle, var(--bg-page));
}

.lb__col-rank {
  width: 72px;
}

.lb__rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--bg-page);
  font-size: 13px;
  font-weight: 800;
  color: var(--text-2);
}

/* 金牌压在金渐变上保留白字；银牌用中性 --text-2 底、铜牌用 --amber 底，
   文字统一走 --milk：日间奶白、夜间反转为深字，两主题下均保持对比 */
.lb__rank--gold { background: var(--grad-gold); color: #fff; }
.lb__rank--silver { background: var(--text-2); color: var(--milk); }
.lb__rank--bronze { background: var(--amber); color: var(--milk); }

.lb__name {
  font-weight: 700;
  color: var(--text-1);
}

.lb__score {
  font-size: 17px;
  font-weight: 800;
  color: var(--mn-green-dark);
  font-variant-numeric: tabular-nums;
}

.lb__breakdown {
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
}

/* 口径 */
.lb__method {
  padding: 10px 16px;
}

.lb__method-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border: none;
  background: none;
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
}

.lb__method-text {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-subtle, var(--bg-page));
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-2);
}

.lb__method-hint {
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--text-3);
}

@media (max-width: 768px) {
  .lb__podium {
    grid-template-columns: 1fr;
  }

  .lb__podium-card--gold {
    order: 0;
  }
}
</style>
