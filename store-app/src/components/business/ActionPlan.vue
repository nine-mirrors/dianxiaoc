<script setup lang="ts">
/**
 * 千店千面行动方案（PRD 4.4-G）：补什么货 / 怎么摆 / 订多少，三段式。
 * 顶部注明门店类型，呼应「千店千面」。
 */
import AppIcon from '@/components/common/AppIcon.vue'
import type { ActionPlan } from '@/types'

interface Props {
  plan: ActionPlan
  /** 是否显示「调整数量 / 生成订货建议」操作条 */
  showActions?: boolean
}
const props = withDefaults(defineProps<Props>(), { plan: () => ({}) as ActionPlan, showActions: true })

const emit = defineEmits<{ (e: 'order'): void; (e: 'adjust'): void }>()
</script>

<template>
  <div class="plan">
    <!-- ① 补什么货 -->
    <div class="plan__sec">
      <p class="plan__sec-title"><i>1</i> 补什么货</p>
      <div v-for="r in props.plan.restock" :key="r.skuId" class="plan__item">
        <span class="plan__name">{{ r.skuName }}</span>
        <span class="plan__qty">补 {{ r.bottles }} 瓶</span>
        <span class="plan__amt">¥{{ r.amount }}</span>
      </div>
      <p v-if="!props.plan.restock?.length" class="plan__empty">本次无需补货</p>
    </div>

    <!-- ② 怎么摆 -->
    <div class="plan__sec">
      <p class="plan__sec-title"><i>2</i> 怎么摆</p>
      <div v-for="(p, i) in props.plan.placement" :key="i" class="plan__place">
        <AppIcon name="check-circle" :size="13" color="var(--mn-green)" />
        <span>{{ p.text }}</span>
      </div>
      <p v-if="!props.plan.placement?.length" class="plan__empty">保持当前陈列即可</p>
    </div>

    <!-- ③ 订多少 -->
    <div class="plan__total">
      <div class="plan__total-row">
        <span>建议订多少</span>
        <b>合计 {{ props.plan.totalBottles }} 瓶</b>
      </div>
      <div class="plan__total-main">
        <span class="plan__money">¥{{ props.plan.totalAmount }}</span>
        <span class="plan__days">覆盖 {{ props.plan.coverDays }} 天动销</span>
      </div>
      <!-- 口径说明：这是「建议备多少货」，与风险卡的「预测会少卖多少」不是同一个数 -->
      <p class="plan__hint">口径：备货建议 = max(安全库存, 日均×(提前期+铺货天数), 缺口补齐)，已扣除在库</p>
      <div v-if="showActions" class="plan__actions">
        <button type="button" class="u-btn u-btn--ghost plan__btn u-tap" @click="emit('adjust')">调整数量</button>
        <button type="button" class="u-btn u-btn--primary plan__btn u-tap" @click="emit('order')">生成订货建议</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plan {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.plan__sec-title {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-1);
}

.plan__sec-title i {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--mn-green);
  color: #fff;
  font-size: 10px;
  font-style: normal;
}

.plan__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px dashed var(--border-color);
  font-size: 13px;
}

.plan__name {
  flex: 1;
  min-width: 0;
  color: var(--text-1);
}

.plan__qty {
  flex: none;
  color: var(--text-2);
}

.plan__amt {
  flex: none;
  width: 54px;
  text-align: right;
  font-weight: 700;
  color: var(--text-1);
}

.plan__place {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  padding: 3px 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-2);
}

.plan__empty {
  padding: 6px 0;
  font-size: 12px;
  color: var(--text-3);
}

.plan__total {
  padding: 12px;
  border-radius: 10px;
  background: var(--mn-green-light);
}

.plan__total-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-2);
}

.plan__total-row b {
  font-size: 13px;
  color: var(--text-1);
}

.plan__total-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 4px 0 10px;
}

.plan__money {
  font-size: 26px;
  font-weight: 700;
  color: var(--mn-green-dark);
  font-variant-numeric: tabular-nums;
}

.plan__hint {
  margin-top: 6px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--text-3);
}

.plan__days {
  font-size: 12px;
  color: var(--text-2);
}

.plan__actions {
  display: flex;
  gap: 8px;
}

.plan__btn {
  flex: 1;
  height: 34px;
  font-size: 13px;
}
</style>
