<script setup lang="ts">
/**
 * P6 店员端 · 自助诊断（PRD 4.6 · T05.4）。
 *
 * 独立轻量闭环：三步引导 → 轻量拍照 → 口语化结果 → 一键订货成功。
 * 不做注册/支付/历史；不出现「健康分 / 六维度 / 雷达」等内部术语。
 * 复用 P4 的识别图（AnnotatedImage）与行动方案（plan.restock），但全部口语化。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import AiBadge from '@/components/common/AiBadge.vue'
import AiLoadingOverlay from '@/components/business/AiLoadingOverlay.vue'
import AnnotatedImage from '@/components/business/AnnotatedImage.vue'
import OrderConfirmDialog from '@/components/business/OrderConfirmDialog.vue'
import SmartImage from '@/components/common/SmartImage.vue'
import { getDiagnosis, createDiagnosis, createTicket, uploadPhoto, streamGenerate, getTickets } from '@/api'
import { useToast } from '@/composables/useToast'
import { useHaptics } from '@/composables/useHaptics'
import { useDemoStore } from '@/stores/demo'
import { useSessionStore } from '@/stores/session'
import { useLoadingSteps } from '@/composables/useLoadingSteps'
import { aiBadgeOf, type AiSource } from '@/domain/constants'
import { onRealtime, offRealtime } from '@/realtime/client'
import type { Diagnosis, Ticket, Step } from '@/types'

const router = useRouter()
const toast = useToast()
const haptics = useHaptics()
const session = useSessionStore()

/** 流程阶段：guide 引导 / capture 拍照 / result 结果 / success 订货成功 */
type Stage = 'guide' | 'capture' | 'result' | 'success' | 'orders'
const stage = ref<Stage>('guide')

/** 三步说明（口语化） */
const steps = [
  { no: '1', icon: 'camera', title: '对着冷柜拍一张', sub: '不用摆好、不用专业' },
  { no: '2', icon: 'sparkles', title: 'AI 帮你看哪不对', sub: '3 秒钟出结果' },
  { no: '3', icon: 'cart', title: '一键补货，货就送到', sub: '不用算、不用记' },
]

/* ═══════════════ 拍照 / 数据 ═══════════════ */

/** 内置示例冷柜照（好邻居·地铁口店） */
const DEFAULT_PHOTO = '/stores/S2/cold_before.jpg'
/** 本地上传的陌生照片（可选） */
const uploadedUrl = ref<string>('')
/** 上传后后端返回的 photoId（供诊断引用） */
const uploadedPhotoId = ref<string>('')
/** 当前展示的照片 */
const shownPhoto = computed<string>(() => uploadedUrl.value || DEFAULT_PHOTO)

const fileInput = ref<HTMLInputElement | null>(null)
function pickFile(): void {
  fileInput.value?.click()
}

/** 上传任意照片 → base64 真上传后端 → 走通用识别兜底，绝不白屏 */
function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadedUrl.value = URL.createObjectURL(file)
  const reader = new FileReader()
  reader.onload = () => {
    uploadPhoto(String(reader.result), file.name)
      .then(({ photoId }) => {
        uploadedPhotoId.value = photoId
      })
      .catch(() => {
        uploadedPhotoId.value = ''
      })
    toast.success('照片已上传，将用通用规则帮你看')
  }
  reader.readAsDataURL(file)
  input.value = ''
}

/** 换回示例照片 */
function resetPhoto(): void {
  uploadedUrl.value = ''
  uploadedPhotoId.value = ''
}

/* ═══════════════ 分析 ═══════════════ */

const analyzing = ref<boolean>(false)
const diagnosis = ref<Diagnosis | null>(null)

/** 分步加载动画（P6 店主版：3 步约 3s，体现「AI 在干活」的表演） */
const demo = useDemoStore()
const overlayVisible = ref<boolean>(false)
const localSteps = ref<Step[]>([
  { text: '正在上传货架照片…', delayMs: 1000 },
  { text: 'AI 正在识别货架与陈列…', delayMs: 1000 },
  { text: '正在为你生成建议…', delayMs: 1000 },
])
const { current, done, percent, play, reset } = useLoadingSteps(localSteps.value)

/** AI 口语化解读：流式累计原文 + 结果页逐字显 */
const ownerRaw = ref<string>('')
const ownerText = ref<string>('')
const aiReal = ref<boolean>(false)
/** ★ A2：P6 口语化解读的真实来源（llm / fallback / null），决定角标措辞 */
const ownerSource = ref<AiSource | null>(null)
const ownerTyping = ref<boolean>(false)
let typeTimer: number | null = null

/** 打字机：把 source 逐字显到 ownerText（真·AI 与降级都用，保证渐进填充感） */
function startTypewriter(source: string): void {
  if (typeTimer !== null) window.clearInterval(typeTimer)
  ownerText.value = ''
  ownerTyping.value = true
  let i = 0
  typeTimer = window.setInterval(() => {
    if (i >= source.length) {
      if (typeTimer !== null) window.clearInterval(typeTimer)
      typeTimer = null
      ownerTyping.value = false
      return
    }
    ownerText.value += source[i]
    i += 1
  }, 26)
}

/** 降级文案：用既有 verbalize 话术拼一句店主人话（无真实 AI 时） */
function buildOwnerDegrade(): string {
  const list = findings.value
  const lead = list.length ? `帮你看了下，发现 ${list.length} 件事：${list.join('；')}。` : '帮你看了下，目前排面挺整齐。'
  return `${lead}建议优先补 ${totalBottles.value} 瓶货、把陈列调一调，生意会更好。`
}

/** 开始 AI 看：上传了就走公式兜底，否则用预置诊断数据；全程播分步动画 + 真·AI 流式 */
async function startAnalyze(): Promise<void> {
  if (analyzing.value) return
  analyzing.value = true
  overlayVisible.value = true
  reset()
  ownerRaw.value = ''
  ownerText.value = ''
  aiReal.value = false
  if (typeTimer !== null) {
    window.clearInterval(typeTimer)
    typeTimer = null
  }
  try {
    // 1) 先拿到诊断（拍照上传 / 预置）
    const res = uploadedUrl.value
      ? await createDiagnosis({ storeId: 'S2', photoIds: uploadedPhotoId.value ? [uploadedPhotoId.value] : [], shootTypes: ['cold'], unknownPhoto: true })
      : await getDiagnosis('D_S2_BEFORE')
    diagnosis.value = res.diagnosis
    const diagId = res.diagnosis.id

    // 2) 并行：播分步动画 + 真·AI 流式（http 模式才真连后端；mock 自动降级为兜底整段）
    // ★ A2：以「后端 source」而非「有没有收到增量」判定是否算真 AI ——
    //   降级路径同样会发 delta 帧，用 delivered 会被误标成 AI 生成。
    let source: AiSource | null = null
    const onDelta = (t: string): void => {
      ownerRaw.value += t
    }
    await Promise.all([
      play(demo.speed),
      streamGenerate('owner', diagId, onDelta).then((res) => {
        source = res.source
      }),
    ])
    overlayVisible.value = false
    ownerSource.value = source
    // 只有真大模型（llm）才算 aiReal；fallback / 网络失败都不宣称 AI
    aiReal.value = source === 'llm'

    // 3) 结果页渐进填充：真·AI 用流式原文逐字显；降级用 verbalize 话术逐字显
    stage.value = 'result'
    startTypewriter(source === 'llm' ? ownerRaw.value : buildOwnerDegrade())
  } catch {
    overlayVisible.value = false
    toast.error('AI 看失败了，请再试一次')
  } finally {
    analyzing.value = false
  }
}

/* ═══════════════ 口语化结果 ═══════════════ */

/** 把内部问题标题转成店主人话 */
function verbalize(title: string): string {
  if (/竞品|占位|黄金/.test(title)) return '黄金位置被别的牌子占了'
  if (/缺货|缺 1|缺\d/.test(title)) return '有几排货架空了，该补货了'
  if (/价签/.test(title)) return '有几个价签不见了，顾客没法比价'
  if (/物料|堆头/.test(title)) return '促销物料没摆上，少了个卖点'
  return '有些地方可以摆得更好卖'
}

/** 「AI 帮你发现 N 件事」（最多 3 条，口语化） */
const findings = computed<string[]>(() => {
  const issues = diagnosis.value?.issues ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (const iss of issues) {
    const v = verbalize(iss.title)
    if (!seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
    if (out.length >= 3) break
  }
  // 兜底：即使陌生照片没识别出问题，也给一条友好提示
  if (!out.length) out.push('已经帮你看过啦，目前排面不错，继续保持')
  return out
})

/** 补货建议（口语化：品牌 + 数量，不出现「SKU」术语） */
const restock = computed(() => diagnosis.value?.plan.restock ?? [])
const totalBottles = computed<number>(() => diagnosis.value?.plan.totalBottles ?? restock.value.reduce((s, r) => s + r.bottles, 0))
const totalAmount = computed<number>(() => diagnosis.value?.plan.totalAmount ?? restock.value.reduce((s, r) => s + r.amount, 0))

/* ═══════════════ 一键订货 ═══════════════ */

const ordering = ref<boolean>(false)
const ticket = ref<Ticket | null>(null)

async function order(): Promise<void> {
  if (ordering.value || !diagnosis.value) return
  ordering.value = true
  try {
    const plan = diagnosis.value.plan
    const res = await createTicket({
      kind: 'order',
      storeId: diagnosis.value.storeId,
      items: plan.restock,
      note: '店主自助订货',
      totalBottles: totalBottles.value,
      totalAmount: totalAmount.value,
    })
    ticket.value = res.ticket
    stage.value = 'success'
    haptics.success() // 下单成功触感（金额类关键动作；iOS 静默降级）
  } catch {
    haptics.error()
    toast.error('下单失败，请再试一次')
  } finally {
    ordering.value = false
  }
}

/* ═══════════════ 下单确认（O-1 容错：高影响动作不可逆，先给一次「再想想」） ═══════════════ */

const confirmVisible = ref<boolean>(false)

/** 点开底部确认单（只打开本地弹层，不碰任何接口） */
function openConfirm(): void {
  if (ordering.value || !diagnosis.value) return
  confirmVisible.value = true
}

function closeConfirm(): void {
  confirmVisible.value = false
}

/** 只有用户在确认单里点「确认下单」后，才执行既有的 order()；
 *  下单接口、入参、成功跳转与失败提示全部沿用原逻辑，本函数不加任何新接口行为 */
async function confirmOrder(): Promise<void> {
  confirmVisible.value = false
  await order()
}

/**
 * O-4 菲茨定律：拍照页 / 结果页主 CTA 固定在手机壳底部，
 * 内容滚动区（ml-body）底部相应留白，避免最后一张卡片贴着主按钮。
 */
const bodyPad = computed<number>(() => {
  // 拍照 / 结果阶段为吸底 CTA 留白；引导阶段挂着底部 TabBar（约 60px），也要避让
  if (stage.value === 'capture' || stage.value === 'result') return 88
  return 72
})

/** 重来一次 */
function restart(): void {
  if (typeTimer !== null) {
    window.clearInterval(typeTimer)
    typeTimer = null
  }
  stage.value = 'guide'
  diagnosis.value = null
  ticket.value = null
  accepted.value = false
  uploadedUrl.value = ''
  ownerRaw.value = ''
  ownerText.value = ''
  aiReal.value = false
  ownerSource.value = null
  ownerTyping.value = false
}

/**
 * 引导页顶栏「返回」：退出当前店主账号回登录页换账号。
 * 旧实现推 /role（角色自选页），该页已废弃并重定向到 /login，
 * 而已登录访问 /login 又会守卫弹回 /owner，形成原地死循环，故直接 logout。
 */
function backToRole(): void {
  session.logout()
  void router.push('/login')
}
/* ═══════════════ 我的订单（店主端补齐：订了什么、接了没） ═══════════════ */

const myOrders = ref<Ticket[]>([])
const ordersLoading = ref<boolean>(false)
/** O-3：拉取失败不再伪装成空列表，与「真空态」分开呈现并提供重试 */
const ordersError = ref<boolean>(false)

/** 拉取本店订单（后端 GET /tickets 已支持按门店过滤） */
async function loadOrders(): Promise<void> {
  ordersLoading.value = true
  ordersError.value = false
  try {
    const res = await getTickets({ storeId: 'S2' })
    myOrders.value = (res.tickets ?? []).slice(0, 10)
  } catch {
    ordersError.value = true
  } finally {
    ordersLoading.value = false
  }
}

/** 进入我的订单页并拉取 */
async function openOrders(): Promise<void> {
  stage.value = 'orders'
  await loadOrders()
}

/** O-6（选择：onMounted 预拉一次）：引导页「我的订单(N)」角标依赖真实数据，
 *  进页先静默拉一次——复用既有 GET /tickets，不新增接口；失败保持角标隐藏，
 *  不打扰店主（进入订单列表时还会显式拉取并看到重试入口） */
async function preloadOrders(): Promise<void> {
  try {
    const res = await getTickets({ storeId: 'S2' })
    myOrders.value = (res.tickets ?? []).slice(0, 10)
  } catch {
    /* 静默：角标非关键信息，预拉失败等同无角标 */
  }
}

/** O-5 状态语义色：待接单=中性 info（不再用警告橙制造焦虑）；
 *  已接单=成功绿；后端若返回 timeout（当前类型未含）才用警告橙 */
function orderState(t: Ticket): { text: string; cls: string } {
  if (t.status === 'accepted') return { text: '业代已接单', cls: 'p6-orders__state--ok' }
  if ((t.status as string) === 'timeout') return { text: '已超时', cls: 'p6-orders__state--warn' }
  return { text: '待接单', cls: 'p6-orders__state--info' }
}

/* ═══════════════ 接单回执（三端闭环的最后一跳） ═══════════════ */

/** 业代是否已接单（收到 ticket:status 推送后置 true，成功页显示回执） */
const accepted = ref<boolean>(false)
/** 推送里可能不带全量单据，用 id 兜底匹配 */
function onTicketStatus(payload: { id?: string; status?: string }): void {
  if (payload?.status !== 'accepted') return
  // 未下单时忽略；已下单时若 id 为空或与当前单一致，标记已接单
  if (!ticket.value) return
  if (payload.id && payload.id !== ticket.value.id) return
  accepted.value = true
  // 单据状态已变，若店主正停留在订单列表则同步刷新
  if (stage.value === 'orders') void openOrders()
}

onMounted(() => {
  // O-6：ticket:status 只注册一次（此前重复注册/防御性 off-on 已删除），
  // 卸载时在 onUnmounted 里退订，不依赖挂载前的清理
  onRealtime<{ id?: string; status?: string }>('ticket:status', onTicketStatus)
  // 角标数据预拉（见 preloadOrders 注释）
  void preloadOrders()
})

onUnmounted(() => {
  offRealtime('ticket:status', onTicketStatus)
})

</script>

<template>
  <MobileLayout
    :title="stage === 'guide' ? '店主自助服务' : '货架小助手'"
    :back="true"
    :show-tab-bar="stage === 'guide'"
    :content-padding-bottom="bodyPad"
    @back="stage === 'guide' ? backToRole() : stage = 'guide'"
  >
    <!-- ══ AI 分步加载遮罩（拍照后播放，体现真·AI 在干活） ══ -->
    <AiLoadingOverlay
      :visible="overlayVisible"
      :steps="localSteps"
      :current="current"
      :done="done"
      :percent="percent"
    />

    <!-- ══ ① 三步引导（克制的错峰入场：3 步 + 3 个信息块，不加内容） ══ -->
    <div v-if="stage === 'guide'" class="p6">
      <div class="p6__hero mot-fade-up">
        <p class="p6__hero-title">3 步看好你的货架</p>
        <p class="p6__hero-sub">张大姐 · 好邻居地铁口店</p>
      </div>

      <div class="p6__steps mot-stagger">
        <div v-for="s in steps" :key="s.no" class="p6__step">
          <span class="p6__step-no">{{ s.no }}</span>
          <span class="p6__step-icon"><AppIcon :name="s.icon" :size="18" /></span>
          <div>
            <p class="p6__step-title">{{ s.title }}</p>
            <p class="p6__step-sub">{{ s.sub }}</p>
          </div>
        </div>
      </div>

      <div class="p6__cta mot-fade-up" style="animation-delay: 180ms">
        <button type="button" class="p6__btn mot-tap" @click="stage = 'capture'">
          <AppIcon name="sparkles" :size="17" color="#fff" />
          开始自助诊断
        </button>
        <button type="button" class="p6__btn p6__btn--ghost mot-tap" @click="openOrders">
          <AppIcon name="clipboard" :size="16" />
          我的订单<span v-if="myOrders.length">（{{ myOrders.length }}）</span>
        </button>

        <!-- 快捷入口：补货模拟 / 经营报告 / 懂行知识库 -->
        <div class="p6__quick">
          <button
            type="button"
            class="p6__quick-item u-tap"
            @click="router.push('/owner/restock')"
          >
            <span class="p6__quick-icon"><AppIcon name="package" :size="18" /></span>
            <span class="p6__quick-label">补货模拟</span>
          </button>
          <button type="button" class="p6__quick-item u-tap" @click="router.push('/owner/report')">
            <span class="p6__quick-icon"><AppIcon name="layers" :size="18" /></span>
            <span class="p6__quick-label">经营报告</span>
          </button>
          <button
            type="button"
            class="p6__quick-item u-tap"
            @click="router.push('/owner/knowledge')"
          >
            <span class="p6__quick-icon"><AppIcon name="clipboard" :size="18" /></span>
            <span class="p6__quick-label">懂行知识库</span>
          </button>
        </div>

        <p class="p6__trust">蒙牛业代 <b>李强</b> 邀请你免费体验</p>
      </div>
    </div>

    <!-- ══ 我的订单（店主最关心：订了什么、接了没） ══ -->
    <div v-else-if="stage === 'orders'" class="p6-orders">
      <p class="p6-orders__title">我的订单</p>
      <p v-if="ordersLoading" class="p6-orders__empty" aria-live="polite">正在加载…</p>

      <!-- O-3：拉取失败 = 明确的错误态 + 重试，不再伪装成「还没有订单」 -->
      <div v-else-if="ordersError" class="p6-orders__error" role="alert">
        <p class="p6-orders__error-title">订单没拉到</p>
        <p class="p6-orders__error-sub">可能网络开了个小差，点下面再试一次</p>
        <button
          type="button"
          class="u-btn u-btn--primary p6-orders__retry u-tap mot-tap"
          @click="loadOrders"
        >
          订单没拉到，点我重试
        </button>
      </div>

      <p v-else-if="!myOrders.length" class="p6-orders__empty">
        还没有订单。点「开始自助诊断」，看完货架就能一键下单。
      </p>
      <template v-else>
        <div v-for="t in myOrders" :key="t.id" class="p6-orders__item">
          <div class="p6-orders__head">
            <span class="p6-orders__id">{{ t.id }}</span>
            <span class="p6-orders__state" :class="orderState(t).cls">
              {{ orderState(t).text }}
            </span>
          </div>
          <p class="p6-orders__items">
            {{ (t.items ?? []).map((i) => i.skuName).join('、') }}
          </p>
          <p class="p6-orders__meta">
            共 <b>{{ t.totalBottles }}</b> 瓶 · ¥{{ t.totalAmount }} · {{ t.createdAt }}
          </p>
        </div>
      </template>
      <button type="button" class="p6__btn p6__btn--ghost mot-tap" @click="stage = 'guide'">
        返回
      </button>
    </div>

    <!-- ══ ② 轻量拍照 ══ -->
    <div v-else-if="stage === 'capture'" class="p6-capture">
      <p class="p6-cap__tip">对着冷柜拍一张，剩下的交给 AI</p>
      <div class="p6-cap__photo">
        <SmartImage :src="shownPhoto" alt="冷柜照片" />
        <span class="p6-cap__brand"><AiBadge text="AI 识别" /></span>
      </div>

      <div class="p6-cap__ops">
        <button type="button" class="p6-cap__op u-tap" @click="pickFile">
          <AppIcon name="camera" :size="16" /> {{ uploadedUrl ? '换一张' : '上传照片' }}
        </button>
        <button v-if="uploadedUrl" type="button" class="p6-cap__op u-tap" @click="resetPhoto">
          <AppIcon name="refresh" :size="15" /> 用示例照
        </button>
      </div>
      <input ref="fileInput" type="file" accept="image/*" class="p6-cap__file" @change="onFileChange" />
    </div>

    <!-- ══ ③ 轻量结果 ══ -->
    <div v-else-if="stage === 'result' && diagnosis" class="p6-result">
      <div class="p6-res__img">
        <!-- O-2：对店主关闭术语图例；框上的内部标签在本页 :deep 隐藏，
             只保留下方两句口语说明（不改 AnnotatedImage 组件本身） -->
        <AnnotatedImage
          :src="diagnosis.photoUrl"
          :annotations="diagnosis.annotations"
          :aspect="2 / 3"
          :show-legend="false"
        />
      </div>
      <!-- 口语图例：颜色本身不说话，配两句大白话（红=空位该补货，黄=摆得不对） -->
      <div class="p6-res__legend" aria-label="图中颜色说明">
        <span class="p6-res__lg-item"><i class="p6-res__lg-dot p6-res__lg-dot--red" />红圈＝空位该补货</span>
        <span class="p6-res__lg-item"><i class="p6-res__lg-dot p6-res__lg-dot--yellow" />黄圈＝摆得不对</span>
      </div>

      <section class="p6-res__card">
        <p class="p6-res__title">
          <AppIcon name="sparkles" :size="16" color="var(--ai-purple)" />
          AI 帮你发现 {{ findings.length }} 件事
        </p>
        <div v-for="(f, i) in findings" :key="i" class="p6-res__find">
          <span class="p6-res__find-no">{{ i + 1 }}</span>
          <span>{{ f }}</span>
        </div>
      </section>

      <section class="p6-res__card" v-if="ownerText">
        <p class="p6-res__title">
          <AppIcon name="sparkles" :size="16" :color="aiReal ? 'var(--ai-purple)' : 'var(--mn-green)'" />
          <!-- ★ A2：AI 措辞只给真大模型；fallback 用统一常量里的诚实文案 -->
          <!-- 逐字输出中 / 来源未定时用中性文案，避免生成中闪现「内容生成未完成」；
               source=null 时本页展示的是 buildOwnerDegrade() 的完整兜底话术（非异常分支），同样归入中性文案 -->
          <span v-if="aiReal || ownerTyping || ownerSource === null">AI 帮你看了</span>
          <span v-else-if="ownerSource === 'fallback'">{{ aiBadgeOf('fallback').text }}</span>
          <span v-else>{{ aiBadgeOf(ownerSource).text }}</span>
        </p>
        <!-- O-5：逐字输出对读屏器隐藏，避免每个字符都打断播报 -->
        <p class="p6-res__owner" aria-hidden="true">
          {{ ownerText }}<span v-if="ownerTyping" class="p6-res__caret">▌</span>
        </p>
        <!-- 完成稿一次性写入 polite 直播区，打字结束才朗读全文 -->
        <p class="u-sr-only" aria-live="polite">{{ ownerTyping ? '' : ownerText }}</p>
      </section>

      <section class="p6-res__card">
        <p class="p6-res__title">
          <AppIcon name="package" :size="16" color="var(--mn-green)" />
          建议补这些货
        </p>
        <div v-for="r in restock" :key="r.skuId" class="p6-res__row">
          <span class="p6-res__name">{{ r.skuName }}</span>
          <b>{{ r.bottles }} 瓶</b>
        </div>
        <div v-if="!restock.length" class="p6-res__empty">目前货挺齐，暂时不用补</div>
        <div class="p6-res__total">
          <span>合计</span>
          <b>{{ totalBottles }} 瓶 · ¥{{ totalAmount }}</b>
        </div>
      </section>

      <p class="p6-res__foot">
        <AiBadge v-if="aiReal" text="AI 识别与建议，下单后由业代联系确认" />
        <span v-else class="p6__foot-plain">识别建议，下单后由业代联系确认</span>
      </p>
    </div>

    <!-- ══ ④ 订货成功 ══ -->
    <div v-else-if="stage === 'success' && ticket" class="p6-success">
      <div class="p6-ok">
        <span class="p6-ok__icon"><AppIcon name="check" :size="30" color="#fff" /></span>
        <p class="p6-ok__title">订货成功</p>
        <p class="p6-ok__sub">货马上安排，稍等就好</p>
      </div>

      <div class="p6-ok__card">
        <p class="p6-ok__store">{{ ticket.storeName }} · 订货单 {{ ticket.id }}</p>
        <p v-if="accepted" class="p6-ok__accepted">
          <AppIcon name="check" :size="13" color="#fff" /> 业代 {{ session.user?.name ?? '李强' }} 已接单，会在 2 小时内与你确认
        </p>
        <div v-for="r in ticket.items" :key="r.skuId" class="p6-ok__row">
          <span>{{ r.skuName }}</span>
          <b>{{ r.bottles }} 瓶 · ¥{{ r.amount }}</b>
        </div>
        <div class="p6-ok__total">
          <span>合计</span>
          <b>{{ ticket.totalBottles }} 瓶 · ¥{{ ticket.totalAmount }}</b>
        </div>
      </div>

      <p class="p6-ok__contact">
        <AppIcon name="user" :size="15" color="var(--mn-green)" />
        业代 <b>李强</b> 将在 2 小时内与你联系确认订单
      </p>

      <div class="p6-ok__btns">
        <button type="button" class="u-btn u-btn--ghost" @click="restart">再诊断一次</button>
        <button type="button" class="u-btn u-btn--primary" @click="stage = 'guide'">完成</button>
      </div>
    </div>

    <!-- ══ O-4：主 CTA 固定底部（菲茨定律：拇指热区，52px + 安全区 + 按压反馈） ══ -->
    <template #footer>
      <div v-if="stage === 'capture'" class="p6-cta-bar">
        <button type="button" class="p6__btn p6__bar-btn mot-tap" :disabled="analyzing" @click="startAnalyze">
          <span v-if="analyzing" class="p6__spinner" />
          <template v-else><AppIcon name="sparkles" :size="17" color="#fff" /></template>
          {{ analyzing ? 'AI 正在看…' : '开始 AI 看' }}
        </button>
      </div>
      <div v-else-if="stage === 'result' && diagnosis" class="p6-cta-bar">
        <!-- O-1：先弹轻确认单，不再一点就直接下单 -->
        <button type="button" class="p6__btn p6__bar-btn mot-tap" :disabled="ordering" @click="openConfirm">
          {{ ordering ? '下单中…' : `一键订货 · ${totalBottles} 瓶` }}
        </button>
      </div>
    </template>

    <!-- ══ O-1：下单轻确认弹层（明细/合计/业代 2 小时联系 + 明显取消） ══ -->
    <OrderConfirmDialog
      :visible="confirmVisible"
      :items="restock"
      :total-bottles="totalBottles"
      :total-amount="totalAmount"
      @close="closeConfirm"
      @confirm="confirmOrder"
    />
  </MobileLayout>
</template>

<style scoped>
/* ── 引导页 ── */
.p6 {
  padding: 18px 16px;
}

.p6__hero {
  text-align: center;
  margin-bottom: 20px;
}

.p6__hero-title {
  font-size: 20px;
  font-weight: 700;
}

.p6__hero-sub {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-3);
}

.p6__steps {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: var(--radius-card);
  background: #fff;
  box-shadow: var(--shadow-card);
}

.p6__step {
  display: flex;
  align-items: center;
  gap: 10px;
}

.p6__step-no {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--mn-green);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.p6__step-icon {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
}

.p6__step-title {
  font-size: 14.5px;
  font-weight: 700;
}

.p6__step-sub {
  margin-top: 1px;
  font-size: 11.5px;
  color: var(--text-3);
}

.p6__cta {
  margin-top: 24px;
  text-align: center;
}

.p6__btn {
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
  cursor: pointer;
}

.p6__btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* 按压即时反馈（触摸端） */
.p6__btn:active {
  transform: scale(0.98);
}

/* 桌面鼠标：悬停轻微上浮，仅在能 hover 的设备生效，避免触屏残留态 */
@media (hover: hover) {
  .p6__btn:not(:disabled):hover {
    transform: translateY(-1px);
  }

  .p6__btn--ghost:not(:disabled):hover {
    background: var(--mn-green-light);
  }
}

/* ── O-4 底部固定主 CTA 栏（在手机壳 flex 流内，不遮挡滚动内容） ── */
.p6-cta-bar {
  flex: none;
  padding: 10px 16px;
  /* 内容视觉留白 12px + 全面屏手势安全区 */
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  background: var(--bg-card, #fff);
  border-top: 1px solid var(--border-color);
}

.p6__bar-btn {
  flex: none;
}

.p6__trust {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-3);
}

.p6__trust b {
  color: var(--mn-green);
}

/* ── 快捷入口（补货模拟 / 经营报告 / 懂行知识库） ── */
.p6__quick {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 14px;
}

.p6__quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 6px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}

.p6__quick-item:active {
  transform: scale(0.97);
}

.p6__quick-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
}

.p6__quick-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-1);
}

.p6-res__foot {
  margin-top: 14px;
  text-align: center;
}

.p6__foot-plain {
  font-size: 12px;
  color: var(--text-3);
}

/* ── 拍照页 ── */
.p6-capture {
  padding: 18px 16px;
}

.p6-cap__tip {
  text-align: center;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--text-2);
}

.p6-cap__photo {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  aspect-ratio: 2 / 3;
  max-height: 420px;
  margin: 0 auto;
  box-shadow: var(--shadow-card);
}

.p6-cap__brand {
  position: absolute;
  top: 10px;
  left: 10px;
}

.p6-cap__ops {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}

.p6-cap__op {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 14px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: #fff;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
}

.p6-cap__file {
  display: none;
}

.p6__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── 结果页 ── */
.p6-result {
  padding: 16px;
  padding-bottom: 24px;
}

.p6-res__img {
  border-radius: 14px;
  overflow: hidden;
  margin-bottom: 10px;
  box-shadow: var(--shadow-card);
}

/* O-2：店主页不出现「空位 / 竞品 / 价签问题」等内部术语标签。
   AnnotatedImage 未提供关闭框上 label 的 prop，又不允许改该组件，
   故仅在本页用 :deep 隐去标签文字（价签角标收成一个小黄点），
   含义由下方两句口语图例承担。 */
.p6-res__img :deep(.anno__label) {
  display: none;
}

.p6-res__img :deep(.anno__tag) {
  min-width: 10px;
  min-height: 10px;
  padding: 0;
  border-radius: 50%;
  font-size: 0;
}

/* ── 口语图例（替代 AnnotatedImage 的术语图例） ── */
.p6-res__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-bottom: 12px;
  padding: 0 2px;
}

.p6-res__lg-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-2);
}

.p6-res__lg-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.p6-res__lg-dot--red {
  background: var(--color-danger);
}

.p6-res__lg-dot--yellow {
  background: var(--color-warning);
}

.p6-res__card {
  padding: 14px 16px;
  border-radius: var(--radius-card);
  background: #fff;
  box-shadow: var(--shadow-card);
  margin-bottom: 12px;
}

.p6-res__title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 700;
}

.p6-res__find {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  color: var(--text-1);
}

.p6-res__find-no {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--ai-purple-light);
  color: var(--ai-purple);
  font-size: 11px;
  font-weight: 700;
}

.p6-res__owner {
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--text-1);
}

.p6-res__caret {
  display: inline-block;
  margin-left: 1px;
  color: var(--ai-purple);
  animation: caret-blink 0.9s step-end infinite;
}

@keyframes caret-blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}

/* 尊重系统「减少动态效果」：光标不闪、旋转环停转（等待态仍有「AI 正在看…」文案承载） */
@media (prefers-reduced-motion: reduce) {
  .p6-res__caret,
  .p6__spinner {
    animation: none;
  }
}

.p6-res__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 0;
  border-bottom: 1px dashed var(--border-color);
  font-size: 13px;
}

.p6-res__name {
  color: var(--text-1);
}

.p6-res__row b {
  color: var(--text-1);
}

.p6-res__empty {
  padding: 6px 0;
  font-size: 12px;
  color: var(--text-3);
}

.p6-res__total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  font-size: 13px;
}

.p6-res__total b {
  font-size: 15px;
  color: var(--mn-green-dark);
}

/* ── 成功页 ── */
.p6-ok__accepted {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin: 8px auto 0;
  padding: 6px 12px;
  width: fit-content;
  border-radius: 999px;
  background: var(--mn-green, #009639);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.p6-orders {
  padding: 4px 2px;
}

.p6-orders__title {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1, #1f2937);
}

.p6-orders__empty {
  margin: 20px 0;
  font-size: 12.5px;
  color: var(--text-3, #6b7280);
  text-align: center;
  line-height: 1.7;
}

.p6-orders__item {
  margin-bottom: 10px;
  padding: 11px 12px;
  border-radius: 12px;
  background: #fff;
  box-shadow: var(--shadow-card, 0 2px 10px rgba(0, 0, 0, 0.05));
}

.p6-orders__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.p6-orders__id {
  font-size: 12px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  color: var(--text-3, #6b7280);
}

.p6-orders__state {
  padding: 2px 8px;
  border-radius: 999px;
  /* O-6：待接单默认中性 info 蓝（不再用警告橙制造焦虑） */
  background: var(--info-bg);
  color: var(--info-fg);
  font-size: 11px;
  font-weight: 700;
}

/* 已接单 = 成功绿 */
.p6-orders__state--ok {
  background: var(--success-bg);
  color: var(--success-fg);
}

/* 超时才用警告橙（后端当前未返回该状态，预留语义位） */
.p6-orders__state--warn {
  background: var(--warning-bg);
  color: var(--warning-fg);
}

/* O-3：错误态卡片（与空态区分，给重试一个明确落点） */
.p6-orders__error {
  margin: 24px 0;
  padding: 22px 16px;
  border-radius: var(--radius-card);
  background: var(--bg-card, #fff);
  box-shadow: var(--shadow-card);
  text-align: center;
}

.p6-orders__error-title {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text-1, #1f2937);
}

.p6-orders__error-sub {
  margin: 6px 0 14px;
  font-size: 12.5px;
  color: var(--text-3, #6b7280);
}

.p6-orders__retry {
  min-width: 168px;
}

.p6-orders__items {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--text-1, #1f2937);
}

.p6-orders__meta {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-3, #6b7280);
}

.p6__btn--ghost {
  margin-top: 10px;
  background: #fff;
  color: var(--mn-green-dark, #0a7d43);
  border: 1px solid var(--mn-green, #009639);
  font-weight: 600;
}

.p6-success {
  padding: 30px 20px 24px;
}

.p6-ok {
  text-align: center;
  margin-bottom: 20px;
}

.p6-ok__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--mn-green) 0%, var(--mn-green-dark) 100%);
  box-shadow: 0 8px 20px rgba(0, 150, 57, 0.28);
}

.p6-ok__title {
  margin-top: 12px;
  font-size: 20px;
  font-weight: 700;
}

.p6-ok__sub {
  margin-top: 3px;
  font-size: 12.5px;
  color: var(--text-3);
}

.p6-ok__card {
  padding: 14px 16px;
  border-radius: var(--radius-card);
  background: #fff;
  box-shadow: var(--shadow-card);
}

.p6-ok__store {
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-2);
}

.p6-ok__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 13px;
}

.p6-ok__total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  font-size: 13px;
}

.p6-ok__total b {
  font-size: 15px;
  color: var(--mn-green-dark);
}

.p6-ok__contact {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin-top: 16px;
  padding: 10px;
  border-radius: 10px;
  background: var(--mn-green-light);
  font-size: 13px;
  color: var(--text-2);
}

.p6-ok__contact b {
  color: var(--mn-green-dark);
}

.p6-ok__btns {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.p6-ok__btns .u-btn {
  flex: 1;
}
</style>
