<script setup lang="ts">
/**
 * P3 业代端 · 巡店拍照页 —— T04.2。
 *
 * 门店确认卡 + 切换门店弹层 + 拍摄类型分段控件 + 三入口照片 + 缩略图(≤6) + 打卡行 + 主按钮。
 * 点击「✦ 开始 AI 诊断」→ 播放 5 步加载动画 → 跳转 P4。
 */
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import AiLoadingOverlay from '@/components/business/AiLoadingOverlay.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import SmartImage from '@/components/common/SmartImage.vue'
import { useApi } from '@/composables/useApi'
import { useToast } from '@/composables/useToast'
import { useLoadingSteps } from '@/composables/useLoadingSteps'
import { getStores, createDiagnosis, createVisit, uploadPhoto } from '@/api'
import { useDemoStore } from '@/stores/demo'
import { SHOOT_TYPES } from '@/domain/constants'
import type { Store, ShootType, Photo } from '@/types'

const route = useRoute()
const router = useRouter()
const demo = useDemoStore()
const toast = useToast()

/** 门店列表（含照片 url） */
const { data: storeData, loading } = useApi(() => getStores({ repId: 'U_REP' }), { initial: { stores: [] } })
const stores = computed<Store[]>(() => storeData.value?.stores ?? [])

/** 当前门店 id */
const storeId = ref<string>(String(route.params.storeId || 'S3'))
/** 当前门店对象 */
const store = computed<Store | undefined>(() => stores.value.find((s) => s.id === storeId.value))

/** 切换门店弹层 */
const pickerOpen = ref<boolean>(false)
/** 拍摄部位（单选，默认冷藏柜） */
const shootType = ref<ShootType>('cold')

/** 当前展示的照片在该店照片集中的下标（「换一张」用） */
const photoIndex = ref<number>(0)

/** 本次已选照片列表（最多 6 张，元素为 Photo 或本地上传项） */
interface PickedPhoto {
  id: string
  url: string
  type: ShootType
  caption: string
  /** true = 本地上传的陌生照片，走兜底识别 */
  unknown?: boolean
}
const picked = ref<PickedPhoto[]>([])
/** 本地上传的 base64 是否走兜底 */
const hasUnknown = computed<boolean>(() => picked.value.some((p) => p.unknown))

/** 当前门店可用照片（按拍摄类型过滤） */
const candidates = computed<Photo[]>(() => {
  const all = store.value?.photos ?? []
  const hit = all.filter((p) => p.type === shootType.value)
  return hit.length ? hit : all
})

/** 主展示区照片 */
const heroPhoto = computed<PickedPhoto>(() => {
  if (picked.value.length) return picked.value[0]
  const list = candidates.value
  if (!list.length) return { id: '', url: '', type: shootType.value, caption: '暂无照片' }
  const p = list[Math.min(photoIndex.value, list.length - 1)]
  return { id: p.id, url: p.url, type: p.type, caption: p.caption ?? '' }
})

watch(
  () => [storeId.value, shootType.value],
  () => {
    photoIndex.value = 0
    picked.value = []
  },
)

/** 打卡时间（静态演示文案） */
const checkinAt = ref<string>('10:24')

/** 是否有可诊断的照片 */
const hasPhoto = computed<boolean>(() => !!heroPhoto.value.url)

/* ═══════════════ AI 分析动画 ═══════════════ */

const overlayVisible = ref<boolean>(false)
/** 5 步默认文案（与 mock 返回的 steps 一致；请求返回后以服务端 steps 为准） */
const localSteps = ref([
  { text: '正在上传货架照片…', delayMs: 480 },
  { text: '已识别 14 个目标：SKU 8 / 空位 1 / 竞品 2 / 价签 3', delayMs: 480 },
  { text: '正在比对「C 类便利店陈列标准」…', delayMs: 480 },
  { text: '正在结合近 4 周动销数据推理…', delayMs: 480 },
  { text: '诊断完成', delayMs: 480 },
])
const { current, done, percent, play, reset } = useLoadingSteps(localSteps.value)

/* ═══════════════ 照片操作 ═══════════════ */

/** 模拟拍照：快门动画 0.6s 后直接取预置照片 */
const shooting = ref<boolean>(false)
async function takePhoto(): Promise<void> {
  if (shooting.value) return
  shooting.value = true
  toast.info('快门：模拟拍摄成功（演示态不调用真实摄像头）')
  await new Promise((r) => setTimeout(r, 600))
  shooting.value = false
  addCurrentPhoto()
}

/** 把当前主展示照片加入已选列表 */
function addCurrentPhoto(): void {
  const p = heroPhoto.value
  if (!p.url) return
  if (picked.value.some((x) => x.id === p.id && x.unknown === p.unknown)) {
    toast.info('该照片已在选择列表中')
    return
  }
  if (picked.value.length >= 6) {
    toast.info('最多选择 6 张照片')
    return
  }
  picked.value = [...picked.value, { ...p }]
  toast.success('照片已就绪')
}

/** 换一张 */
function rotatePhoto(): void {
  photoIndex.value = (photoIndex.value + 1) % Math.max(1, candidates.value.length)
}

/** 删除已选照片 */
function removePhoto(id: string): void {
  picked.value = picked.value.filter((p) => p.id !== id)
}

/** 从相册上传：真实 file input，走兜底通用识别 */
const fileInput = ref<HTMLInputElement | null>(null)
function pickFromAlbum(): void {
  fileInput.value?.click()
}

/** 读取上传文件 → base64 → 真上传后端（http 模式落盘，mock 模式回落本地 blob） */
function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (picked.value.length >= 6) {
    toast.info('最多选择 6 张照片')
    input.value = ''
    return
  }
  const localUrl = URL.createObjectURL(file)
  const reader = new FileReader()
  reader.onload = () => {
    // 真上传（拿到后端 photoId）；失败则退回本地占位 id，保证演示不中断
    uploadPhoto(String(reader.result), file.name)
      .then(({ photoId }) => {
        picked.value = [
          ...picked.value,
          {
            id: photoId,
            url: localUrl,
            type: shootType.value,
            caption: `上传照片 · ${file.name.slice(0, 12)}`,
            unknown: true,
          },
        ]
        toast.success('已上传，将使用通用陈列规则识别')
      })
      .catch(() => {
        picked.value = [
          ...picked.value,
          {
            id: `UP_${Date.now()}`,
            url: localUrl,
            type: shootType.value,
            caption: `上传照片 · ${file.name.slice(0, 12)}`,
            unknown: true,
          },
        ]
        toast.success('已上传，将使用通用陈列规则识别')
      })
  }
  reader.readAsDataURL(file)
  input.value = ''
}

/* ═══════════════ 开始 AI 诊断 ═══════════════ */

/** 是否已在处理中（防重复点击） */
const diagnosing = ref<boolean>(false)

async function startDiagnosis(): Promise<void> {
  if (!hasPhoto.value || diagnosing.value) return
  diagnosing.value = true
  overlayVisible.value = true
  reset()

  try {
    // 请求与动画并行；两者都完成再跳转（保证 2.4s 的智能感表演完整）
    const photos = picked.value.length
      ? picked.value
      : [{ ...heroPhoto.value }]
    const promise = createDiagnosis({
      storeId: storeId.value,
      photoIds: photos.map((p) => p.id).filter(Boolean),
      shootTypes: [shootType.value],
      unknownPhoto: hasUnknown.value,
    })

    const [res] = await Promise.all([promise, play(demo.speed)])
    overlayVisible.value = false

    // 回写一次巡店记录（完成态），再进 P4
    await createVisit({
      storeId: storeId.value,
      photoIds: photos.map((p) => p.id).filter(Boolean),
      shootTypes: [shootType.value],
      checkin: { lat: 31.2304, lng: 121.4737, at: `${checkinAt.value}` },
    })
    router.replace(`/rep/diagnosis/${res.diagnosis.id}`)
  } catch {
    overlayVisible.value = false
    diagnosing.value = false
    toast.error('AI 分析失败，请重试')
  }
}

/** 切换门店 */
function pickStore(id: string): void {
  storeId.value = id
  pickerOpen.value = false
  router.replace(`/rep/capture/${id}`)
}

/** 人数日程信息 */
function goBack(): void {
  router.push('/rep/today')
}
</script>

<template>
  <MobileLayout title="巡店拍照" :back="true" :content-padding-bottom="20" @back="goBack">
    <!-- 门店确认卡 -->
    <div class="p3-store">
      <SkeletonBlock v-if="loading" height="92px" radius="12px" />
      <div v-else-if="store" class="p3-store__card">
        <div class="p3-store__row">
          <p class="p3-store__name">
            <AppIcon name="map-pin" :size="14" color="var(--mn-green)" />
            {{ store.name }}
          </p>
          <button class="p3-store__switch" @click="pickerOpen = true">切换门店</button>
        </div>
        <p class="p3-store__meta">{{ store.typeLabel }} · 负责人：{{ store.ownerName }}</p>
        <p class="p3-store__meta">
          上次健康分 <b>{{ store.lastScore }}</b>
          <template v-if="store.prevScore != null && store.lastScore - store.prevScore > 5">
            （{{ store.prevScore }} → {{ store.lastScore }}，+{{ store.lastScore - store.prevScore }}）
          </template>
          · 第 {{ (store.photos?.length ?? 0) + 3 }} 次巡店
        </p>
      </div>
    </div>

    <!-- 拍摄类型 -->
    <div class="p3-sec">
      <p class="p3-label">拍摄类型（必选）</p>
      <div class="p3-seg">
        <button
          v-for="s in SHOOT_TYPES"
          :key="s.key"
          class="p3-seg__item"
          :class="{ 'p3-seg__item--on': shootType === s.key }"
          @click="shootType = s.key"
        >
          {{ s.label }}
        </button>
      </div>
    </div>

    <!-- 照片主展示区 -->
    <div class="p3-sec">
      <div class="p3-photo" :class="{ 'p3-photo--empty': !hasPhoto }">
        <SmartImage v-if="hasPhoto" class="p3-photo__img" :src="heroPhoto.url" :alt="heroPhoto.caption" />
        <div v-else class="p3-photo__empty">
          <AppIcon name="camera" :size="28" color="#B9C4BC" />
          <p>请拍摄或上传货架照片</p>
        </div>
        <span v-if="hasPhoto" class="p3-photo__ready">✓ 已就绪</span>
        <span v-if="hasPhoto" class="p3-photo__caption">{{ heroPhoto.caption }}</span>
      </div>

      <div class="p3-entry">
        <button class="p3-entry__btn" :disabled="shooting" @click="takePhoto">
          <AppIcon name="camera" :size="15" /> 拍照
        </button>
        <button class="p3-entry__btn" @click="pickFromAlbum">
          <AppIcon name="layers" :size="15" /> 从相册上传
        </button>
        <button class="p3-entry__btn" @click="rotatePhoto">
          <AppIcon name="refresh" :size="15" /> 换一张
        </button>
      </div>
      <input ref="fileInput" class="p3-hidden-file" type="file" accept="image/*" @change="onFileChange" />

      <!-- 缩略图 -->
      <div class="p3-thumbs">
        <div v-for="p in picked" :key="p.id" class="p3-thumb">
          <!-- 上传的 blob: URL 由 assetUrl 原样透传，预置图走相对路径 -->
          <SmartImage :src="p.url" :alt="p.caption" />
          <button class="p3-thumb__del" @click="removePhoto(p.id)">✕</button>
        </div>
        <button class="p3-thumb p3-thumb--add" @click="addCurrentPhoto">＋</button>
        <span class="p3-thumbs__tip">已选 {{ picked.length }} 张 · 最多 6 张</span>
      </div>
    </div>

    <!-- 打卡行 -->
    <div class="p3-checkin">
      <AppIcon name="check-circle" :size="14" color="var(--mn-green)" />
      <span>已打卡 · GPS 定位成功 · {{ checkinAt }}</span>
    </div>

    <!-- 主按钮 -->
    <div class="p3-submit">
      <button class="p3-submit__btn" :disabled="!hasPhoto || diagnosing" @click="startDiagnosis">
        <AppIcon name="sparkles" :size="17" color="#fff" />
        开始 AI 诊断
      </button>
      <p v-if="!hasPhoto" class="p3-submit__tip">至少 1 张照片</p>
    </div>

    <!-- 切换门店弹层 -->
    <div v-if="pickerOpen" class="p3-mask" @click.self="pickerOpen = false">
      <div class="p3-sheet">
        <p class="p3-sheet__title">选择门店</p>
        <button
          v-for="s in stores"
          :key="s.id"
          class="p3-sheet__item"
          :class="{ 'p3-sheet__item--on': s.id === storeId }"
          @click="pickStore(s.id)"
        >
          <span>{{ s.name }}</span>
          <em>{{ s.typeLabel }} · {{ s.distanceKm }}km</em>
        </button>
      </div>
    </div>

    <!-- AI 分步加载遮罩 -->
    <AiLoadingOverlay :visible="overlayVisible" :steps="localSteps" :current="current" :done="done" :percent="percent" />
  </MobileLayout>
</template>

<style scoped>
.p3-store {
  padding: 14px 12px 0;
}

.p3-store__card {
  padding: 12px;
  border-radius: var(--radius-card);
  background: #fff;
  box-shadow: var(--shadow-card);
  border-left: 4px solid var(--mn-green);
}

.p3-store__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.p3-store__name {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 15px;
  font-weight: 700;
}

.p3-store__switch {
  flex: none;
  padding: 3px 10px;
  border: 1px solid var(--mn-green);
  border-radius: 999px;
  background: #fff;
  color: var(--mn-green);
  font-size: 11px;
  font-weight: 600;
}

.p3-store__meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-3);
}

.p3-store__meta b {
  color: var(--text-1);
}

.p3-sec {
  padding: 14px 12px 0;
}

.p3-label {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}

.p3-seg {
  display: flex;
  gap: 6px;
  padding: 3px;
  border-radius: 12px;
  background: #eaf0ec;
}

.p3-seg__item {
  flex: 1;
  height: 34px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.p3-seg__item--on {
  background: var(--mn-green);
  color: #fff;
  box-shadow: 0 2px 6px rgba(0, 150, 57, 0.28);
}

.p3-photo {
  position: relative;
  width: 100%;
  height: 208px;
  border-radius: 10px;
  overflow: hidden;
  background: #eef0ef;
}

.p3-photo--empty {
  border: 1.5px dashed #c9d1cd;
  background: #fafbfb;
}

.p3-photo__img {
  width: 100%;
  height: 104%;
  margin-bottom: -4%;
  border-radius: 10px;
  overflow: hidden;
}

/* :deep 穿透到 SmartImage 内部的图片，统一裁掉底部水印区 */
.p3-photo__img :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}

.p3-photo__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
  color: var(--text-3);
  font-size: 13px;
}

.p3-photo__ready {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--mn-green);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}

.p3-photo__caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 14px 10px 8px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.5) 100%);
  color: #fff;
  font-size: 11px;
}

.p3-entry {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.p3-entry__btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: #fff;
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
}

.p3-entry__btn:active {
  border-color: var(--mn-green);
  color: var(--mn-green);
}

.p3-hidden-file {
  display: none;
}

.p3-thumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.p3-thumb {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: 8px;
  overflow: hidden;
  background: #eef0ef;
  border: none;
  padding: 0;
}

.p3-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.p3-thumb__del {
  position: absolute;
  right: 2px;
  top: 2px;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 10px;
  line-height: 16px;
}

.p3-thumb--add {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px dashed #c9d1cd;
  background: #fff;
  color: var(--text-3);
  font-size: 18px;
}

.p3-thumbs__tip {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
}

.p3-checkin {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 14px 12px 0;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-size: 12px;
  font-weight: 600;
}

.p3-submit {
  padding: 16px 12px 4px;
}

.p3-submit__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 52px;
  border: none;
  border-radius: 26px;
  background: linear-gradient(135deg, var(--ai-purple) 0%, var(--ai-purple-2) 100%);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  box-shadow: 0 8px 20px rgba(109, 59, 245, 0.28);
  position: relative;
  overflow: hidden;
}

.p3-submit__btn::after {
  content: '';
  position: absolute;
  top: 0;
  left: -60%;
  width: 40%;
  height: 100%;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.32) 50%, rgba(255, 255, 255, 0) 100%);
  animation: flow 2.6s ease infinite;
}

@keyframes flow {
  0% {
    left: -60%;
  }
  60%,
  100% {
    left: 120%;
  }
}

.p3-submit__btn:disabled {
  background: #cfd6d2;
  box-shadow: none;
  opacity: 0.85;
}

.p3-submit__btn:disabled::after {
  display: none;
}

.p3-submit__tip {
  margin-top: 6px;
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
}

/* 切换门店弹层 */
.p3-mask {
  position: absolute;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.4);
}

.p3-sheet {
  width: 100%;
  padding: 14px 12px 18px;
  border-radius: 16px 16px 0 0;
  background: #fff;
}

.p3-sheet__title {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 700;
}

.p3-sheet__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 11px 10px;
  border: none;
  border-bottom: 1px dashed var(--border-color);
  background: none;
  text-align: left;
  font-size: 13px;
  color: var(--text-1);
}

.p3-sheet__item em {
  font-style: normal;
  font-size: 11px;
  color: var(--text-3);
}

.p3-sheet__item--on {
  color: var(--mn-green);
  font-weight: 700;
}
</style>
