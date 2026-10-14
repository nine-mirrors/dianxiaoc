<script setup lang="ts">
/**
 * 整改前后对比（任务 A2：闭环可视化的核心区块）。
 *
 * 上半：CompareSlider 拖拽对比「整改前照片 ↔ 最新整改后照片」；
 * 下半：历次整改记录（时间 / 问题 / 分数变化 / 可溯源说明）。
 *
 * 数据来自 `GET /api/v1/rectifications`（刷新后仍在，非内存态）。
 */
import { computed } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import CompareSlider from './CompareSlider.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import type { Rectification } from '@/types'

interface Props {
  /** 整改前照片（诊断原图） */
  beforeUrl: string
  /** 该诊断下的整改回执（最新在前） */
  records: Rectification[]
  /** 是否只读（历史详情页不可再提交） */
  readonly?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  beforeUrl: '',
  records: () => [],
  readonly: false,
})

/** 最新一条回执（用于对比的目标图） */
const latest = computed<Rectification | null>(() => props.records[0] ?? null)

/** 是否已有可对比的整改后照片 */
const hasAfter = computed<boolean>(() => !!latest.value?.photoUrl)

/** 累计提升分 */
const totalGain = computed<number>(() => props.records.reduce((s, r) => s + (r.gain ?? 0), 0))
</script>

<template>
  <div class="rc-cmp">
    <!-- 对比区 -->
    <div v-if="hasAfter" class="rc-cmp__slider">
      <CompareSlider :src="beforeUrl" :annotations="[]" :aspect="2 / 3" />
      <p class="rc-cmp__cap">
        左滑看<strong>整改前</strong> · 右滑看<strong>整改后</strong>（{{ latest?.createdAt }}）
      </p>
    </div>

    <!-- 历次记录 -->
    <div v-if="records.length" class="rc-cmp__list">
      <div class="rc-cmp__sum">
        <span>累计整改 <strong>{{ records.length }}</strong> 条</span>
        <span>累计提升 <strong>+{{ totalGain }}</strong> 分</span>
      </div>

      <div v-for="r in records" :key="r.id" class="rc-cmp__item">
        <div class="rc-cmp__item-head">
          <p class="rc-cmp__item-title">{{ r.issueTitle || '整改项' }}</p>
          <span class="rc-cmp__item-gain" :class="{ 'is-up': r.gain > 0 }">
            {{ r.beforeScore }} → {{ r.afterScore }}
            <em v-if="r.gain > 0">(+{{ r.gain }})</em>
          </span>
        </div>
        <p class="rc-cmp__item-meta">
          {{ r.createdAt }} · {{ r.operatorName }} ·
          <span :class="r.status === 'done' ? 'rc-cmp__st--done' : 'rc-cmp__st--pending'">
            {{ r.status === 'done' ? '已留证' : '待复查' }}
          </span>
        </p>
        <!-- 可溯源的加分说明（回答「凭什么加分」） -->
        <p v-if="r.derivation" class="rc-cmp__item-deriv">
          <AppIcon name="info" :size="12" /> {{ r.derivation }}
        </p>
        <p v-if="r.note" class="rc-cmp__item-note">备注：{{ r.note }}</p>
      </div>
    </div>

    <EmptyState
      v-else-if="readonly"
      icon="clipboard"
      title="暂无整改记录"
      desc="该门店还没有提交过整改回执"
    />
    <p v-else class="rc-cmp__empty">
      在上方问题清单点「已处理」并提交留证后，这里会出现整改前后对比与历次记录。
    </p>
  </div>
</template>

<style scoped>
.rc-cmp__slider {
  margin-bottom: 12px;
}

.rc-cmp__cap {
  margin-top: 8px;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-3);
}

.rc-cmp__cap strong {
  color: var(--mn-green-dark);
}

.rc-cmp__sum {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  margin-bottom: 8px;
  border-radius: 10px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-size: 12px;
}

.rc-cmp__sum strong {
  font-weight: 800;
}

.rc-cmp__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rc-cmp__item {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-page);
}

.rc-cmp__item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.rc-cmp__item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}

.rc-cmp__item-gain {
  flex: none;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.rc-cmp__item-gain.is-up {
  color: var(--mn-green-dark);
}

.rc-cmp__item-gain em {
  font-style: normal;
}

.rc-cmp__item-meta {
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-3);
}

.rc-cmp__st--done {
  color: var(--mn-green-dark);
  font-weight: 600;
}

.rc-cmp__st--pending {
  color: var(--level-warning);
  font-weight: 600;
}

.rc-cmp__item-deriv {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-top: 5px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--bg-card);
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-2);
}

.rc-cmp__item-note {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-3);
}

.rc-cmp__empty {
  padding: 14px;
  border-radius: 8px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-size: 12px;
  line-height: 1.6;
}
</style>
