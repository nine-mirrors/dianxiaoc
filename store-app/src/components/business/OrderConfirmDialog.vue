<script setup lang="ts">
/**
 * 下单轻确认底部弹层（店主自助端 O-1 容错）。
 *
 * 高影响动作（一键订货）不可逆，点击主 CTA 后先给一次「再想想」：
 * 展示商品明细 / 合计瓶数 / 金额，用户明确点「确认下单」才由父级调接口，
 * 本组件绝不碰任何 API。「取消」与遮罩/Esc 三条路径同等明显，
 * 不阻断「仅查看不买」。
 *
 * 无障碍：role="dialog" + aria-modal + aria-labelledby；
 * 焦点管理（进入聚焦、Tab 陷阱、Esc 关闭、关闭还原焦点）统一走 useDialogFocus。
 * 不可逆动作默认焦点落在「取消」上，避免误触回车直接下单。
 */
import { toRef } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useDialogFocus } from '@/composables/useDialogFocus'
import type { RestockItem } from '@/types'

interface Props {
  /** 弹层显隐（由父级持有） */
  visible: boolean
  /** 商品明细 */
  items: RestockItem[]
  /** 合计瓶数 */
  totalBottles: number
  /** 合计金额（元） */
  totalAmount: number
}
const props = withDefaults(defineProps<Props>(), {
  items: () => [],
  totalBottles: 0,
  totalAmount: 0,
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm'): void
}>()

/** 焦点陷阱 / Esc 关闭 / 关闭后焦点归还触发按钮（WAI-ARIA Dialog） */
const { panelRef } = useDialogFocus({
  visible: toRef(props, 'visible'),
  onClose: () => emit('close'),
})
</script>

<template>
  <Transition name="ocd">
    <div v-if="visible" class="ocd-mask" @click.self="emit('close')">
      <section
        ref="panelRef"
        class="ocd-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ocd-title"
      >
        <header class="ocd-head">
          <p class="ocd-title">
            <AppIcon name="cart" :size="17" color="var(--ai-purple)" />
            <span id="ocd-title">确认下单</span>
          </p>
          <button type="button" class="ocd-x u-tap" data-close aria-label="关闭" @click="emit('close')">
            <AppIcon name="close" :size="15" color="var(--text-3)" />
          </button>
        </header>

        <!-- 明细区：商品多时弹层内部滚动，弹层整体不超过 90dvh -->
        <div class="ocd-body">
          <p class="ocd-tip">按下面这些货补，确认后业代会跟你核对：</p>
          <div class="ocd-list">
            <div v-for="r in items" :key="r.skuId" class="ocd-row">
              <span class="ocd-name">{{ r.skuName }}</span>
              <span class="ocd-qty">{{ r.bottles }} 瓶</span>
              <b class="ocd-amt">¥{{ r.amount }}</b>
            </div>
            <p v-if="!items.length" class="ocd-empty">暂时没有要补的货</p>
          </div>
          <div class="ocd-total">
            <span>合计</span>
            <b>{{ totalBottles }} 瓶 · ¥{{ totalAmount }}</b>
          </div>
        </div>

        <footer class="ocd-foot">
          <button type="button" class="ocd-confirm mot-tap" @click="emit('confirm')">
            <AppIcon name="check" :size="17" color="var(--milk)" />
            确认下单，业代 2 小时内联系
          </button>
          <!-- 默认焦点落在这里：不可逆操作防误触；「仅看看不买」可一键退出 -->
          <button type="button" class="ocd-cancel mot-tap" data-autofocus @click="emit('close')">
            取消
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
/* 定位与 RectificationDialog 同口径：相对手机壳 .phone 全覆盖、底对齐 */
.ocd-mask {
  position: absolute;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: flex-end;
  background: var(--bg-mask);
}

.ocd-sheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 90dvh;
  border-radius: 18px 18px 0 0;
  background: var(--bg-card);
  outline: none;
}

.ocd-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 10px;
}

.ocd-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-1);
}

.ocd-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--bg-page);
}

.ocd-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 16px;
}

.ocd-tip {
  font-size: 12.5px;
  color: var(--text-3);
  padding-bottom: 8px;
}

.ocd-list {
  border-top: 1px solid var(--border-color);
}

.ocd-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--border-color);
  font-size: 13.5px;
  color: var(--text-1);
}

.ocd-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ocd-qty {
  flex: none;
  color: var(--text-2);
}

.ocd-amt {
  flex: none;
  min-width: 52px;
  text-align: right;
  font-weight: 700;
}

.ocd-empty {
  padding: 14px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-3);
}

.ocd-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0 4px;
  font-size: 14px;
  color: var(--text-1);
}

.ocd-total b {
  font-size: 16px;
  color: var(--brand-deep);
}

.ocd-foot {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px 16px;
  /* 底部安全区：全面屏手势条不遮挡按钮 */
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border-color);
}

.ocd-confirm {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-height: 52px;
  padding: 0 16px;
  border: none;
  border-radius: 26px;
  background: var(--ai-grad);
  color: var(--milk);
  font-size: 15.5px;
  font-weight: 700;
}

.ocd-cancel {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--brand);
  border-radius: 22px;
  background: var(--bg-card);
  color: var(--brand-deep);
  font-size: 15px;
  font-weight: 600;
}

/* 入场只动 transform / opacity（底单上推 + 遮罩淡入） */
.ocd-enter-active,
.ocd-leave-active {
  transition: opacity var(--dur-base, 220ms) var(--ease-standard, ease);
}

.ocd-enter-active .ocd-sheet,
.ocd-leave-active .ocd-sheet {
  transition: transform var(--dur-base, 220ms) var(--ease-decel, ease);
}

.ocd-enter-from,
.ocd-leave-to {
  opacity: 0;
}

.ocd-enter-from .ocd-sheet,
.ocd-leave-to .ocd-sheet {
  transform: translateY(100%);
}

@media (prefers-reduced-motion: reduce) {
  .ocd-enter-active,
  .ocd-leave-active,
  .ocd-enter-active .ocd-sheet,
  .ocd-leave-active .ocd-sheet {
    transition-duration: 0.01ms;
  }

  .ocd-enter-from .ocd-sheet,
  .ocd-leave-to .ocd-sheet {
    transform: none;
  }
}
</style>
