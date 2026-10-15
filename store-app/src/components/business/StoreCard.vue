<script setup lang="ts">
/**
 * P2 巡店线路卡片（序号/类型/距离/上次分/状态/操作按钮）。
 *
 * ★ S2 展示「48 → 80 (+32)」整改闭环核心证据。
 */
import { computed } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import HealthBadge from '@/components/common/HealthBadge.vue'
import { levelOf } from '@/domain/constants'
import { haversineKm, fmtKm } from '@/domain/geo'
import type { RouteStore } from '@/types'

interface Props {
  item: RouteStore
  /** 是否为刚刚完成的门店（绿色闪光反馈） */
  justDone?: boolean
  /** 距离起点（业代当前位置）；缺省时用本元素自身坐标（显示 0.0） */
  origin?: { lat: number; lng: number }
}
const props = withDefaults(defineProps<Props>(), {
  item: () => ({}) as RouteStore,
  justDone: false,
  origin: undefined,
})

/** 距起点的真实球面距离（按坐标现算，不用写死的 distanceKm） */
const km = computed<string>(() => {
  const s = props.item.store
  if (!s) return '—'
  if (!props.origin) return '0.0'
  return fmtKm(haversineKm(props.origin, { lat: Number(s.lat), lng: Number(s.lng) }))
})

const emit = defineEmits<{ (e: 'patrol', id: string): void; (e: 'view', item: RouteStore): void }>()

/** 序号圆圈（①②③④⑤） */
const orderCn = computed<string>(() => '①②③④⑤'[props.item.order - 1] ?? String(props.item.order))

/** 上次分颜色（信息文字用深色档，浅色档色对白底不足 4.5:1；装饰色不在此处用） */
const lastScoreColor = computed<string>(() => {
  const map: Record<string, string> = {
    excellent: 'var(--mn-green-dark)',
    good: '#558b2f',
    warning: 'var(--warning-fg)',
    risk: 'var(--danger-fg)',
  }
  return map[levelOf(props.item.store?.lastScore ?? 0)] ?? 'var(--text-2)'
})

/** 是否已完成 */
const isDone = computed<boolean>(() => props.item.status === 'done')
/** 是否整改复查店（有 prevScore 且提升明显） */
const showImprove = computed<boolean>(() => {
  const s = props.item.store
  return !!s && s.prevScore != null && s.lastScore - s.prevScore > 5
})
const improve = computed<{ from: number; to: number; delta: number }>(() => {
  const s = props.item.store
  const delta = (s.lastScore ?? 0) - (s.prevScore ?? 0)
  return { from: s.prevScore!, to: s.lastScore, delta }
})
</script>

<template>
  <div class="store-card" :class="{ 'store-card--done': isDone, 'u-flash-success': justDone }">
    <!-- 序号 + 主信息 -->
    <div class="store-card__row">
      <div class="store-card__order" :class="`store-card__order--${item.status}`">
        <span v-if="isDone">✓</span>
        <span v-else-if="item.status === 'alert'">!</span>
        <span v-else>{{ orderCn }}</span>
      </div>

      <div class="store-card__main">
        <div class="store-card__title-row">
          <p class="store-card__name u-ellipsis">{{ item.store?.name }}</p>
          <span v-if="item.isReview" class="store-card__review">★整改复查</span>
        </div>
        <p class="store-card__meta">
          {{ item.store?.typeLabel }} · 距起点 {{ km }}km
        </p>
        <p v-if="showImprove" class="store-card__improve">
          <b style="color: var(--danger-fg)">{{ improve.from }}</b>
          <span>→</span>
          <b style="color: var(--mn-green-dark)">{{ improve.to }}</b>
          <em>(+{{ improve.delta }})</em>
        </p>
        <p v-else class="store-card__last">
          上次
          <b :style="{ color: lastScoreColor }">{{ item.store?.lastScore }}</b>
          <HealthBadge :level="levelOf(item.store?.lastScore || 0)" />
        </p>
      </div>

      <div class="store-card__cta">
        <!-- 附加操作插槽（如一键导航）：与主 CTA 同排，主按钮在最右 -->
        <slot name="extra-action" :item="item" />
        <button
          v-if="isDone"
          type="button"
          class="u-btn u-btn--ghost store-card__btn u-tap"
          @click="emit('view', item)"
        >
          查看
        </button>
        <button
          v-else
          type="button"
          class="u-btn u-btn--primary store-card__btn u-tap"
          @click="emit('patrol', item.store.id)"
        >
          去巡店
          <AppIcon name="chevron-right" :size="14" color="#fff" />
        </button>
      </div>
    </div>

    <!-- 已完成时间 -->
    <p v-if="isDone" class="store-card__done-tip">
      <AppIcon name="check" :size="12" color="var(--mn-green)" /> 今日已完成巡店
    </p>
  </div>
</template>

<style scoped>
.store-card {
  padding: 12px;
  background: var(--bg-card);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
}

.store-card--done {
  background: linear-gradient(180deg, var(--mn-green-light) 0%, var(--bg-card) 60%);
}

.store-card__row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.store-card__order {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: var(--text-3);
}

.store-card__order--done {
  background: var(--mn-green);
}

.store-card__order--pending {
  background: var(--bg-page);
  color: var(--text-3);
}

.store-card__order--alert {
  background: var(--level-risk);
}

.store-card__main {
  flex: 1;
  min-width: 0;
}

.store-card__title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.store-card__name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.store-card__review {
  flex: none;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--ai-purple-light);
  color: var(--ai-purple);
  font-size: 10px;
  font-weight: 600;
}

.store-card__meta,
.store-card__last,
.store-card__improve {
  margin-top: 3px;
  font-size: 12px;
  /* 店型/距离/上次分/整改前后均承载信息：text-3 仅 ≈2.5:1，提到 text-2（≈7.5:1） */
  color: var(--text-2);
  display: flex;
  align-items: center;
  gap: 4px;
}

.store-card__improve b {
  font-size: 13px;
}

.store-card__improve em {
  font-style: normal;
  font-weight: 700;
  color: var(--mn-green-dark);
}

.store-card__last b {
  font-size: 13px;
}

.store-card__cta {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.store-card__btn {
  height: 32px;
  padding: 0 12px;
  font-size: 12px;
}

.store-card__done-tip {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-color);
  font-size: 11px;
  /* 完成卡片顶部带浅绿渐变底，--mn-green 在浅绿底仅 ≈3.4:1，文字用深色档 */
  color: var(--mn-green-dark);
}
</style>
