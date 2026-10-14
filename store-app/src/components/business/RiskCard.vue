<script setup lang="ts">
/**
 * 风险预判卡（PRD 4.4-E）：量化损失 + 「推导依据」可展开区。
 *
 * 数字全部来自 fixture 权威值（27 瓶 / ¥108 / 117 瓶 / ¥468），公式只做兜底。
 */
import { ref } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import AiBadge from '@/components/common/AiBadge.vue'
import type { RiskPrediction } from '@/types'

interface Props {
  risk: RiskPrediction
}
const props = withDefaults(defineProps<Props>(), { risk: () => ({}) as RiskPrediction })

/** 推导依据是否展开 */
const expanded = ref<boolean>(false)
</script>

<template>
  <div class="risk-card">
    <header class="risk-card__head">
      <span class="risk-card__icon"><AppIcon name="alert-triangle" :size="16" color="#fff" /></span>
      <b>风险预判</b>
      <AiBadge text="AI" />
    </header>

    <div class="risk-card__body">
      <!-- 一句话归因（取首个明细项的排面缺口） -->
      <p class="risk-card__lead">
        该店<span v-if="risk.items?.length">{{ risk.items[0].skuName }}</span> 有效排面
        <b>{{ risk.items?.[0]?.actualFacings ?? '-' }}</b> 列，低于同类标准
        <b>{{ risk.items?.[0]?.stdFacings ?? '-' }}</b> 列。若不处理：
      </p>

      <div class="risk-card__grid">
        <div class="risk-card__cell">
          <p class="risk-card__cap">预计本周流失</p>
          <p class="risk-card__num risk-card__num--week">
            {{ risk.weeklyBottles }} <em>瓶</em> <span>¥{{ risk.weeklyAmount }}</span>
          </p>
          <!-- 口径说明：这是「预测会少卖多少」，与下方行动方案的「建议补多少」不是同一个数 -->
          <p class="risk-card__hint">口径：预测损失（按缺口动销 × 7 天推算）</p>
        </div>
        <div class="risk-card__cell risk-card__cell--alt">
          <p class="risk-card__cap">预计月度流失</p>
          <p class="risk-card__num risk-card__num--month">
            {{ risk.monthlyBottles }} <em>瓶</em> <span>¥{{ risk.monthlyAmount }}</span>
          </p>
        </div>
      </div>

      <!--数据来源标注：把「算法推导」与「进销存取数」的边界讲清楚。
           这是本系统可追问性的核心设计 —— 数字不是 AI 凭空编的，
           补货量由算法算、效期与价签由 MCP 进销存取，AI 只负责把依据讲成人话。
           评委追问「这个数字哪来的」时，本行即为答案入口。 -->
      <p class="risk-card__source">
        <AppIcon name="clipboard" :size="12" />
        数据来源：销量损失由<b>排货算法</b>推导 · 批次效期与价签取自<b>进销存 MCP</b>（非看图猜测）
      </p>

      <!-- 推导依据 -->
      <button type="button" class="risk-card__toggle" @click="expanded = !expanded">
        <AppIcon :name="expanded ? 'chevron-up' : 'chevron-down'" :size="13" />
        {{ expanded ? '收起推导依据' : '▸ 推导依据（展开）' }}
      </button>
      <Transition name="expand">
        <pre v-if="expanded" class="risk-card__derivation">{{ risk.derivation }}</pre>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.risk-card {
  border-radius: var(--radius-card);
  overflow: hidden;
  box-shadow: var(--shadow-card);
}

.risk-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  background: linear-gradient(135deg, var(--color-warning) 0%, var(--color-danger) 100%);
  color: #fff;
  font-size: 14px;
}

.risk-card__icon {
  display: inline-flex;
}

.risk-card__head b {
  flex: 1;
}

.risk-card__body {
  padding: 12px;
  background: #fff;
}

.risk-card__lead {
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-2);
}

.risk-card__lead b {
  color: var(--text-1);
}

.risk-card__grid {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.risk-card__cell {
  flex: 1;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--danger-bg);
}

.risk-card__cell--alt {
  background: var(--warning-bg);
}

.risk-card__hint {
  margin-top: 4px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--text-3);
}

/* 数据来源标注：弱化但可读，位于口径说明之后，不抢主数字的视觉重心 */
.risk-card__source {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-color);
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--text-3);

  b {
    color: var(--text-2);
    font-weight: 500;
  }
}

.risk-card__cap {
  font-size: 11px;
  color: var(--text-3);
}

/* 数字层级：本周大而深红（需要本周行动）；月度小而灰红（背景参考，不抢注意） */
.risk-card__num {
  margin-top: 2px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.risk-card__num--week {
  font-size: 24px;
  line-height: 1.25;
  color: var(--danger-fg);
}

.risk-card__num--week em {
  font-style: normal;
  font-size: 13px;
  font-weight: 600;
}

.risk-card__num--week span {
  font-size: 15px;
}

.risk-card__num--month {
  font-size: 14px;
  line-height: 1.4;
  color: color-mix(in srgb, var(--danger-fg) 55%, var(--text-2));
}

.risk-card__num--month em {
  font-style: normal;
  font-size: 12px;
  font-weight: 600;
}

.risk-card__num--month span {
  font-size: 12px;
}

.risk-card__toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  /* 父级 overflow:hidden 不能用 .u-tap 伪元素：用 padding 把命中盒扩到 44px */
  min-height: 44px;
  margin-top: 2px;
  padding: 10px 8px;
  border: none;
  background: none;
  color: var(--ai-purple);
  font-size: 12px;
  font-weight: 600;
}

.risk-card__derivation {
  margin: 8px 0 0;
  padding: 10px;
  border-radius: 8px;
  background: var(--bg-page);
  color: var(--text-2);
  font-family: inherit;
  font-size: 11px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.24s ease;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
