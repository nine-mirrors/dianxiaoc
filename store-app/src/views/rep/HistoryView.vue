<script setup lang="ts">
/**
 * 巡店记录（Tab3）—— T04.6。
 * 列表按时间倒序，点击进 P4 只读历史态。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import HealthBadge from '@/components/common/HealthBadge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import { useApi } from '@/composables/useApi'
import { getVisits, getStores } from '@/api'
import { levelOf } from '@/domain/constants'
import { formatShortTime } from '@/utils/format'
import { assetUrl } from '@/utils/asset'
import type { Visit, Store } from '@/types'

const router = useRouter()

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
</script>

<template>
  <MobileLayout title="巡店记录" :show-tab-bar="true" :content-padding-bottom="60">
    <div class="hist">
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

      <div v-else class="hist__list">
        <button
          v-for="v in visits"
          :key="v.id"
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
      </div>

      <p class="hist__foot">✦ 历史诊断进入只读态，可留证对比整改前后</p>
    </div>
  </MobileLayout>
</template>

<style scoped>
.hist {
  padding: 12px;
}

.hist__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hist__item {
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
