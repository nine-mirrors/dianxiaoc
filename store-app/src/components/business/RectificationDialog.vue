<script setup lang="ts">
/**
 * 整改回执弹层（任务 A2：让「已处理」真落库 + 可溯源算分）。
 *
 * 流程：问题清单点「已处理」→ 弹出本层 → 上传整改后照片（可选）+ 备注
 *      → 调 `POST /api/v1/rectifications` → **分数由后端算**，前端只展示返回值。
 *
 * ★ 关键约束：afterScore / derivation 一律取后端返回值，前端绝不自行计算，
 *   保证「凭什么加分」这个问题有唯一、可溯源的答案。
 */
import { ref, computed, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import SmartImage from '@/components/common/SmartImage.vue'
import { createRectification } from '@/api'
import { useToast } from '@/composables/useToast'
import { useDialogFocus } from '@/composables/useDialogFocus'
import type { Diagnosis, Issue, Rectification, Severity } from '@/types'

interface Props {
  visible: boolean
  diagnosis: Diagnosis
  issue: Issue | null
}
const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'done', rect: Rectification): void
}>()

const toast = useToast()

/**
 * 弹窗焦点管理：Esc 关闭 / Tab 焦点陷阱 / 关闭后焦点还到「已处理」按钮。
 * visible 来自 prop，包一层 computed 保持只读 Ref 语义。
 */
const visibleRef = computed<boolean>(() => props.visible)
const { panelRef } = useDialogFocus({
  visible: visibleRef,
  onClose: () => emit('close'),
})

/** 提交中 */
const submitting = ref<boolean>(false)
/** 提交失败时的一次性抖动（纯 transform；animationend 后复位，保证可重播） */
const shake = ref<boolean>(false)
function triggerShake(): void {
  shake.value = false
  window.requestAnimationFrame(() => {
    shake.value = true
  })
}
/** 选中的整改后照片（base64） */
const photo = ref<string>('')
/** 照片预览 url */
const photoPreview = ref<string>('')
/** 备注 */
const note = ref<string>('')
/** 上传失败提示 */
const photoError = ref<string>('')

const fileInput = ref<HTMLInputElement | null>(null)

/** 打开时重置状态（每次都是干净的一次回执） */
watch(
  () => props.visible,
  (v) => {
    if (v) {
      photo.value = ''
      photoPreview.value = ''
      note.value = ''
      photoError.value = ''
      submitting.value = false
    }
  },
)

/** 当前诊断分与预期分（弹层顶部展示，让「加分」有参照） */
const beforeScore = computed<number>(() => props.diagnosis?.health?.score ?? 0)
const expectedScore = computed<number>(() => props.diagnosis?.health?.expectedScore ?? 100)

/** 严重度 → 中文（与问题清单一致） */
const SEVERITY_LABEL: Record<Severity, string> = {
  severe: '严重',
  medium: '中度',
  low: '轻度',
}
const severityLabel = computed<string>(() => (props.issue ? SEVERITY_LABEL[props.issue.severity] : '—'))

/** 选择整改后照片 → 预览 + 交给后端上传（沿用统一上传通道） */
function pickPhoto(): void {
  fileInput.value?.click()
}

function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  photoError.value = ''
  const reader = new FileReader()
  reader.onload = () => {
    const data = String(reader.result)
    photo.value = data
    photoPreview.value = URL.createObjectURL(file)
  }
  reader.onerror = () => {
    photoError.value = '照片读取失败，请重试'
  }
  reader.readAsDataURL(file)
  input.value = ''
}

/** 提交整改回执（照片先走 uploadPhoto 拿 photoId/photoUrl，再连同回执一起提交） */
async function submit(): Promise<void> {
  if (submitting.value || !props.issue) return
  submitting.value = true
  try {
    const res = await createRectification({
      diagnosisId: props.diagnosis.id,
      issueId: props.issue.id,
      issueTitle: props.issue.title,
      severity: props.issue.severity,
      photo: photo.value || undefined,
      filename: 'rectification.jpg',
      note: note.value,
    })
    const rect = res.rectification
    // ★ 数字取后端返回值，不自己算
    toast.success(`已留证：健康分 ${rect.beforeScore} → ${rect.afterScore}（+${rect.gain}）`)
    emit('done', rect)
    emit('close')
  } catch {
    toast.error('留证提交失败，请重试')
    triggerShake()
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Transition name="rc">
    <div v-if="visible && issue" class="rc-mask" @click.self="emit('close')">
      <div
        ref="panelRef"
        class="rc"
        :class="{ 'mot-shake': shake }"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rc-title"
        @animationend="shake = false"
      >
        <p id="rc-title" class="rc__title">
          <AppIcon name="clipboard" :size="16" color="var(--mn-green)" />
          整改回执 · 留证闭环
        </p>
        <button type="button" class="rc__x u-tap" data-close aria-label="关闭" @click="emit('close')">✕</button>

        <p class="rc__issue">{{ issue.title }}</p>
        <p class="rc__sev">严重程度：{{ severityLabel }}</p>

        <!-- 分数参照：整改前 → 预期上限 -->
        <div class="rc__score">
          <div class="rc__score-item">
            <p class="rc__score-num">{{ beforeScore }}</p>
            <p class="rc__score-cap">当前健康分</p>
          </div>
          <span class="rc__score-arrow">→</span>
          <div class="rc__score-item">
            <p class="rc__score-num rc__score-num--target">{{ expectedScore }}</p>
            <p class="rc__score-cap">预期上限</p>
          </div>
        </div>
        <p class="rc__hint">整改后分数由后端按「严重度权重 × 修复分」计算，并以预期分为上限。</p>

        <!-- 整改后照片 -->
        <div class="rc__photo">
          <div v-if="photoPreview" class="rc__photo-prev">
            <SmartImage :src="photoPreview" alt="整改后照片" />
            <button
              type="button"
              class="rc__photo-clear u-tap"
              @click="photo = ''; photoPreview = ''"
            >
              移除
            </button>
          </div>
          <button v-else type="button" class="rc__photo-btn" @click="pickPhoto">
            <AppIcon name="camera" :size="16" /> 上传整改后照片（强烈建议）
          </button>
          <input ref="fileInput" type="file" accept="image/*" class="rc__file" @change="onFileChange" />
        </div>
        <p v-if="photoError" class="rc__err">{{ photoError }}</p>
        <p v-else-if="!photo" class="rc__tip">未留证将按 50% 折算加分，且状态记为「待复查」。</p>

        <!-- 备注 -->
        <label for="rc-note" class="rc__note-label">备注（可选）</label>
        <textarea
          id="rc-note"
          v-model="note"
          class="rc__note"
          rows="2"
          placeholder="如「已补货并调整排面」"
        />

        <div class="rc__ops">
          <button type="button" class="u-btn u-btn--ghost" data-close :disabled="submitting" @click="emit('close')">
            取消
          </button>
          <button
            type="button"
            class="u-btn u-btn--primary"
            :class="{ 'mot-press-loading': submitting }"
            :disabled="submitting"
            @click="submit"
          >
            {{ submitting ? '提交中…' : '提交留证' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.rc-mask {
  position: absolute;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: flex-end;
  background: var(--bg-mask);
}

.rc {
  position: relative;
  width: 100%;
  max-height: 90dvh;
  overflow-y: auto;
  padding: 18px 16px 16px;
  border-radius: 18px 18px 0 0;
  background: var(--bg-card);
}

.rc__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

.rc__x {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--text-3);
  font-size: 15px;
  cursor: pointer;
}

.rc__issue {
  margin-top: 10px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-1);
  line-height: 1.5;
}

.rc__sev {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--text-3);
}

.rc__score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  margin-top: 12px;
  padding: 12px;
  border-radius: 12px;
  background: var(--mn-green-light);
}

.rc__score-item {
  text-align: center;
}

.rc__score-num {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-1);
}

.rc__score-num--target {
  color: var(--mn-green-dark);
}

.rc__score-cap {
  margin-top: 2px;
  font-size: 10.5px;
  color: var(--text-3);
}

.rc__score-arrow {
  font-size: 16px;
  color: var(--text-3);
}

.rc__hint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.5;
}

.rc__photo {
  margin-top: 12px;
}

.rc__photo-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 42px;
  border: 1px dashed var(--brand);
  border-radius: 12px;
  background: var(--bg-card);
  color: var(--brand);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.rc__photo-prev {
  position: relative;
  border-radius: 12px;
}

/* 不用 overflow:hidden 裁切圆角：保证「移除」小钮的 .u-tap 热区不被父级裁掉 */
.rc__photo-prev :deep(img) {
  display: block;
  width: 100%;
  border-radius: 12px;
}

.rc__photo-clear {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 5px 10px;
  border: none;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 11px;
  cursor: pointer;
}

.rc__file {
  display: none;
}

.rc__tip {
  margin-top: 6px;
  font-size: 11px;
  color: var(--warning-fg);
}

.rc__err {
  margin-top: 6px;
  font-size: 11px;
  color: var(--danger-fg);
}

.rc__note-label {
  display: block;
  margin-top: 10px;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.rc__note {
  width: 100%;
  margin-top: 0;
  padding: 9px 11px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-page);
  font-size: 12.5px;
  color: var(--text-1);
  outline: none;
  resize: none;
  font-family: inherit;
}

.rc__note:focus {
  border-color: var(--mn-green);
}

.rc__ops {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.rc__ops .u-btn {
  flex: 1;
}

.rc-enter-active,
.rc-leave-active {
  transition: opacity 0.24s ease;
}

.rc-enter-active .rc,
.rc-leave-active .rc {
  transition: transform 0.24s ease;
}

.rc-enter-from,
.rc-leave-to {
  opacity: 0;
}

.rc-enter-from .rc,
.rc-leave-to .rc {
  transform: translateY(24px);
}
</style>
