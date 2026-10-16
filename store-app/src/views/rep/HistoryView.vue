<script setup lang="ts">
/**
 * 巡店记录（Tab3）—— T04.6。
 * 列表按时间倒序，点击进 P4 只读历史态。
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import HealthBadge from '@/components/common/HealthBadge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import { useApi } from '@/composables/useApi'
import { useToast } from '@/composables/useToast'
import { getVisits, getStores } from '@/api'
import { exportVisitsCsv } from '@/api/insights'
import { levelOf, DEMO_TODAY } from '@/domain/constants'
import { formatShortTime } from '@/utils/format'
import { assetUrl } from '@/utils/asset'
import type { Visit, Store } from '@/types'

const router = useRouter()
const toast = useToast()

/** 导出中（防重复点击 + loading 态） */
const exporting = ref<boolean>(false)

/**
 * 导出「我的巡店记录 / 健康分」CSV。
 * 后端按**当前登录账号**取数（rep 只能导出自己名下记录），文件名带日期与范围。
 */
async function doExport(): Promise<void> {
  if (exporting.value) return
  exporting.value = true
  try {
    await exportVisitsCsv(`我的巡店记录_全部_${DEMO_TODAY}.csv`)
    toast.success('巡店记录已导出（CSV）')
  } catch (e) {
    toast.error((e as { message?: string })?.message || '导出失败，请稍后重试', {
      action: { text: '再试一次', onAction: () => void doExport() },
    })
  } finally {
    exporting.value = false
  }
}

const { data, loading } = useApi(() => getVisits({ limit: 20 }), { initial: { visits: [] }, fallback: { visits: [] } })
const visits = computed<Visit[]>(() => data.value?.visits ?? [])

/** 门店信息（含照片缩略图，换图只改 fixture 的 url） */
const { data: storeData } = useApi(() => getStores({ repId: 'U_REP' }), { initial: { stores: [] }, fallback: { stores: [] } })

const stores = computed<Store[]>(() => storeData.value?.stores ?? [])

/** 取门店首图 */
function thumbOf(storeId: string): string {
  const s = stores.value.find((x) => x.id === storeId)
  return s?.photos?.[0]?.url ? assetUrl(s.photos[0].url) : ''
}

/** 进入 P4 只读态 */
function openVisit(v: Visit): void {
  if (v.id.startsWith('V_T')) {  // D2：前缀与真实数据区分（须与 server/src/db.js VISIT_ID_PREFIX 一致）
    router.push(`/rep/diagnosis/D_${v.storeId}?readonly=1`)
    return
  }
  router.push(`/rep/diagnosis/${v.id}?readonly=1`)
}

/**
 * 该店「再巡一次」→ 标准巡店八步骤（VisitStepsView 由 :taskId 解析出门店）。
 * 历史留证之外，给业代一条马上接着做的执行路径。
 */
function startSteps(v: Visit): void {
  router.push(`/rep/steps/${v.storeId}`)
}
</script>

<template>
  <MobileLayout title="巡店记录" :show-tab-bar="true" :content-padding-bottom="60">
    <div class="hist">
      <!-- 导出条：导出当前业代全部巡店记录 / 健康分（后端 CSV） -->
      <div class="hist__bar mot-rise">
        <span class="hist__bar-hint">导出当前账号全部历史巡店记录与健康分</span>
        <button
          type="button"
          class="hist__export mot-tap"
          :class="{ 'mot-press-loading': exporting }"
          :disabled="exporting"
          aria-label="导出我的巡店记录 CSV"
          @click="doExport"
        >
          <AppIcon name="download" :size="15" />
          {{ exporting ? '导出中…' : '导出记录' }}
        </button>
      </div>

      <template v-if="loading">
        <SkeletonBlock v-for="i in 4" :key="i" height="76px" radius="12px" />
      </template>

      <EmptyState
        v-else-if="!visits.length"
        icon="history"
        title="暂无巡店记录"
        desc="完成一次 AI 诊断后，这里会留下可复查的留证记录"
        action-text="去拍照诊断"
        @action="router.push('/rep/capture/S3')"
      />

      <div v-else class="hist__list mot-stagger">
        <div v-for="v in visits" :key="v.id" class="hist__row">
          <button
            type="button"
            class="hist__item mot-tap"
            @click="openVisit(v)"
          >
            <span class="hist__thumb">
              <img v-if="thumbOf(v.storeId)" :src="thumbOf(v.storeId)" :alt="v.storeName" />
              <AppIcon v-else name="package" :size="18" color="var(--text-4)" />
            </span>

            <span class="hist__main">
              <span class="hist__store u-ellipsis">{{ v.storeName }}</span>
              <span class="hist__meta">{{ formatShortTime(v.visitedAt) }} · 第 {{ v.visitNo }} 次</span>
            </span>

            <span class="hist__score">
              <b :style="{ color: `var(--level-${levelOf(v.score)})` }">{{ v.score }}</b>
              <HealthBadge :level="levelOf(v.score)" />
            </span>

            <AppIcon name="chevron-right" :size="16" color="var(--text-3)" />
          </button>

          <!-- 再巡一次 → 标准巡店八步骤（与「查看历史」并列的第二动作） -->
          <button
            type="button"
            class="hist__steps u-tap"
            :aria-label="`再巡一次：${v.storeName}`"
            @click="startSteps(v)"
          >
            <AppIcon name="clipboard" :size="17" color="var(--mn-green-dark)" />
            <span>再巡</span>
          </button>
        </div>
      </div>

      <p class="hist__foot">✦ 历史诊断进入只读态，可留证对比整改前后</p>
    </div>
  </MobileLayout>
</template>

<style scoped>
.hist {
  padding: 12px;
}

/* 导出条：点击即真实下载当前账号巡店记录 CSV */
.hist__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-card);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
}

.hist__bar-hint {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--text-3);
}

.hist__export {
  /* ≥40px 触控热区 */
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--mn-green);
  border-radius: 999px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.hist__export:disabled {
  opacity: 0.7;
  cursor: default;
}

.hist__export:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.hist__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 记录行 + 「再巡」动作横向并排 */
.hist__row {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.hist__item {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: var(--radius-card);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    transform var(--dur-fast) var(--ease-standard),
    box-shadow var(--dur-fast) var(--ease-standard);
}

/* 「再巡一次（八步骤）」第二动作：竖向紧凑按钮 */
.hist__steps {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 54px;
  padding: 0;
  border: 1px solid var(--mn-green);
  border-radius: var(--radius-card);
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.hist__steps:active {
  transform: scale(0.96);
}

.hist__item:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
}

.hist__thumb {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--mn-green-light);
}

.hist__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hist__main {
  flex: 1;
  min-width: 0;
}

.hist__store {
  display: block;
  font-size: 13.5px;
  font-weight: 700;
}

.hist__meta {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
}

.hist__score {
  flex: none;
  display: block;
  text-align: right;
}

.hist__score b {
  display: block;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}

.hist__foot {
  margin-top: 12px;
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
}
</style>
