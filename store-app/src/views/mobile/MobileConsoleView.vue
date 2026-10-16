<script setup lang="ts">
/**
 * 移动门户（/m，name=mobile-console）—— 手机 / 窄屏访问经理、管理员功能时的
 * 移动版工作台。单文件、页内 4 个 tab（不做子路由）：
 *
 *  1. 经营：区域 KPI 网格 + 风险门店 + 业代红榜（getDashboardOverview / getLeaderboard）
 *  2. AI：ChatBI 移动版（getAskSuggestions + streamAiAsk 真 SSE，来源如实标注）
 *  3. 消息：直接挂共用组件 <MessageCenter mode="mobile" />
 *  4. 我的：AI 经营周报（streamWeeklyReport）+ admin 公告发布 + 切换电脑版 + 退出
 *
 * 运行在 App.vue 的 .dxc-mobile-full（fixed inset:0 / 100dvh）容器内：
 * 不套 MobileLayout，顶栏与底部 tab 全部在本文件内实现。
 * 所有颜色取 styles/tokens.css 变量，日夜主题均可用；品牌渐变块上的白字为特许例外。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import ThemeToggle from '@/components/common/ThemeToggle.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import MilkDropLoader from '@/components/common/MilkDropLoader.vue'
import MessageCenter from '@/components/business/MessageCenter.vue'
import { useToast } from '@/composables/useToast'
import { useSessionStore } from '@/stores/session'
import { getDashboardOverview } from '@/api'
import {
  getAskSuggestions,
  getLeaderboard,
  streamAiAsk,
  streamWeeklyReport,
  type LeaderboardRow,
} from '@/api/insights'
import { createAnnouncement, type AnnouncementAudience } from '@/api/admin'
import type { DashboardOverview } from '@/types'

const router = useRouter()
const session = useSessionStore()
const toast = useToast()

/* ═══════════════ 顶部与 tab ═══════════════ */

type TabKey = 'biz' | 'ai' | 'msg' | 'me'

interface MTab {
  key: TabKey
  label: string
  icon: string
}

const TABS: MTab[] = [
  { key: 'biz', label: '经营', icon: 'home' },
  { key: 'ai', label: 'AI', icon: 'sparkles' },
  { key: 'msg', label: '消息', icon: 'message' },
  { key: 'me', label: '我的', icon: 'user' },
]

const activeTab = ref<TabKey>('biz')

/** 按时段问候 */
const greeting = computed<string>(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

/** 退出登录（口径同 rep/MeView：确认 → 清会话 → 回登录页） */
function logout(): void {
  if (!window.confirm('退出后需重新登录，确认退出当前账号？')) return
  session.logout()
  toast.info('已退出登录')
  void router.push('/login')
}

/** 切换电脑版：?desktop=1 强制桌面形态（路由守卫识别后不再分流回 /m） */
function goDesktop(): void {
  void router.push({ path: '/manager/dashboard', query: { desktop: '1' } })
}

/* ═══════════════ Tab 1 · 经营  ═══════════════ */

const overview = ref<DashboardOverview | null>(null)
const bizLoading = ref<boolean>(true)
const bizError = ref<boolean>(false)

const board = ref<LeaderboardRow[]>([])
const boardLoading = ref<boolean>(true)
const boardError = ref<boolean>(false)

async function loadOverview(): Promise<void> {
  bizLoading.value = true
  bizError.value = false
  try {
    const res = await getDashboardOverview()
    overview.value = res.overview
  } catch {
    overview.value = null
    bizError.value = true
    toast.error('经营看板加载失败，请稍后重试')
  } finally {
    bizLoading.value = false
  }
}

async function loadLeaderboard(): Promise<void> {
  boardLoading.value = true
  boardError.value = false
  try {
    const res = await getLeaderboard()
    board.value = (res.list ?? []).slice(0, 5)
  } catch {
    board.value = []
    boardError.value = true
    toast.error('业代红榜加载失败')
  } finally {
    boardLoading.value = false
  }
}

function loadBiz(): void {
  // 两块数据互不阻塞，各自独立兜底
  void loadOverview()
  void loadLeaderboard()
}

/* ═══════════════ Tab 2 · AI（ChatBI 移动版） ═══════════════ */

interface AiMsg {
  id: number
  role: 'user' | 'ai'
  text: string
  /** null = 尚未拿到结束帧的来源标注 */
  source: 'llm' | 'fallback' | null
  streaming: boolean
}

let aiSeq = 0
const aiMessages = ref<AiMsg[]>([])
const aiInput = ref<string>('')
const aiSending = ref<boolean>(false)
const suggestions = ref<string[]>([])
const aiScrollRef = ref<HTMLElement | null>(null)
let aiController: AbortController | null = null

/* ── 等待首字期间的分阶段拟人话术：提问后每 900ms 换一句，
   首字到达 / 请求结束 / 失败 / 切 tab / 离开页面时立即清除定时器与文案 ── */
const AI_WAIT_PHRASES = [
  '正在翻看今天片区里的门店…',
  '在比对近 8 周的趋势数据…',
  '核对缺货率、铺货率这些底稿数字…',
  '把结论整理成你能直接执行的话…',
]
const aiWaitPhrase = ref<string>('')
let aiWaitTimer: number | undefined
let aiWaitIndex = 0

function startAiWaitPhrases(): void {
  stopAiWaitPhrases()
  aiWaitIndex = 0
  aiWaitPhrase.value = AI_WAIT_PHRASES[0]
  // 尊重系统「减弱动态效果」：只静态显示首条，不做轮换
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  aiWaitTimer = window.setInterval(() => {
    if (aiWaitIndex >= AI_WAIT_PHRASES.length - 1) return
    aiWaitIndex += 1
    aiWaitPhrase.value = AI_WAIT_PHRASES[aiWaitIndex]
  }, 900)
}

function stopAiWaitPhrases(): void {
  if (aiWaitTimer !== undefined) {
    window.clearInterval(aiWaitTimer)
    aiWaitTimer = undefined
  }
  aiWaitPhrase.value = ''
}

async function loadSuggestions(): Promise<void> {
  try {
    suggestions.value = await getAskSuggestions()
  } catch {
    suggestions.value = []
  }
}

function aiScrollToBottom(): void {
  void nextTick(() => {
    const el = aiScrollRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

/** 组装附加上下文（最近两轮，口径同桌面 AiAskView，后端最多收 300 字） */
function buildAiContext(): string {
  return aiMessages.value
    .slice(-4)
    .map((m) => `${m.role === 'user' ? '经理问' : '店小C答'}：${m.text}`)
    .join('　|　')
    .slice(0, 300)
}

async function askAi(raw: string): Promise<void> {
  const question = String(raw || '').trim()
  if (!question || aiSending.value) return
  aiMessages.value.push({ id: ++aiSeq, role: 'user', text: question, source: null, streaming: false })
  aiInput.value = ''
  const aiMsg: AiMsg = { id: ++aiSeq, role: 'ai', text: '', source: null, streaming: true }
  aiMessages.value.push(aiMsg)
  aiSending.value = true
  startAiWaitPhrases()
  aiScrollToBottom()

  const ctrl = new AbortController()
  aiController = ctrl
  try {
    const res = await streamAiAsk(
      question,
      (delta) => {
        // 首字到达：话术与定时器立刻退场
        if (aiWaitPhrase.value) stopAiWaitPhrases()
        aiMsg.text += delta
        aiScrollToBottom()
      },
      { context: buildAiContext(), signal: ctrl.signal },
    )
    // 切页主动中断：保留已流出的文字，不弹错误；一个字都没收到则撤掉占位气泡
    if (ctrl.signal.aborted) {
      aiMsg.streaming = false
      if (!aiMsg.text) {
        aiMessages.value = aiMessages.value.filter((m) => m.id !== aiMsg.id)
      }
      return
    }
    aiMsg.source = res.source
    aiMsg.streaming = false
    if (!res.ok && !aiMsg.text) {
      aiMsg.text = '暂时拿不到回答：后端未连接或服务异常，请稍后重试。'
      toast.error('AI 问答失败，请稍后重试')
    }
  } catch {
    aiMsg.streaming = false
    if (!ctrl.signal.aborted) {
      aiMsg.text = aiMsg.text || '请求失败，请稍后重试。'
      toast.error('AI 问答失败，请稍后重试')
    } else if (!aiMsg.text) {
      aiMessages.value = aiMessages.value.filter((m) => m.id !== aiMsg.id)
    }
  } finally {
    stopAiWaitPhrases()
    if (aiController === ctrl) aiController = null
    aiSending.value = false
    aiScrollToBottom()
  }
}

/* ═══════════════ Tab 4 · AI 经营周报 ═══════════════ */

const report = ref<string>('')
const reportStreaming = ref<boolean>(false)
const reportDone = ref<boolean>(false)
const reportSource = ref<'llm' | 'fallback' | null>(null)
let reportController: AbortController | null = null

async function generateReport(): Promise<void> {
  if (reportStreaming.value) return
  reportStreaming.value = true
  reportDone.value = false
  report.value = ''
  reportSource.value = null
  const ctrl = new AbortController()
  reportController = ctrl
  try {
    const res = await streamWeeklyReport(
      (delta) => {
        report.value += delta
      },
      { signal: ctrl.signal },
    )
    if (ctrl.signal.aborted) return
    reportSource.value = res.source
    reportDone.value = res.ok && !!report.value
    if (!res.ok && !report.value) {
      toast.error('周报生成失败，请稍后重试')
    }
  } catch {
    if (!ctrl.signal.aborted) toast.error('周报生成失败，请稍后重试')
  } finally {
    if (reportController === ctrl) reportController = null
    reportStreaming.value = false
  }
}

/* ═══════════════ Tab 4 · 发布公告（仅 admin） ═══════════════ */

const annTitle = ref<string>('')
const annContent = ref<string>('')
const annAudience = ref<AnnouncementAudience>('all')
const annPublishing = ref<boolean>(false)

const AUDIENCE_OPTIONS: { value: AnnouncementAudience; label: string }[] = [
  { value: 'all', label: '全部角色' },
  { value: 'rep', label: '业代' },
  { value: 'owner', label: '店主' },
  { value: 'manager', label: '区域经理' },
]

async function publishAnnouncement(): Promise<void> {
  const title = annTitle.value.trim()
  const content = annContent.value.trim()
  if (!title || !content) {
    toast.error('请填写公告标题与正文')
    return
  }
  annPublishing.value = true
  try {
    await createAnnouncement({ title, content, audience: annAudience.value })
    toast.success('公告已发布')
    annTitle.value = ''
    annContent.value = ''
    annAudience.value = 'all'
  } catch {
    toast.error('公告发布失败，请稍后重试')
  } finally {
    annPublishing.value = false
  }
}

/* ═══════════════ 生命周期：离开 AI tab / 离开页面均中断 SSE ═══════════════ */

watch(activeTab, (next, old) => {
  if (old === 'ai' && next !== 'ai' && aiSending.value && aiController) {
    aiController.abort()
    stopAiWaitPhrases()
  }
})

onMounted(() => {
  loadBiz()
  void loadSuggestions()
})

onBeforeUnmount(() => {
  aiController?.abort()
  reportController?.abort()
  stopAiWaitPhrases()
})
</script>

<template>
  <div class="mconsole">
    <h1 class="u-sr-only">店小C 移动工作台</h1>

    <!-- ══ 顶部：品牌渐变 + 问候 / 角色 + 主题 / 退出 ══ -->
    <header class="mconsole__hero">
      <div class="mconsole__hello">
        <p class="mconsole__greet">{{ greeting }}，{{ session.user?.name ?? '请登录' }}</p>
        <p class="mconsole__role">
          {{ session.roleLabel }} · 移动工作台
        </p>
      </div>
      <div class="mconsole__hero-actions">
        <ThemeToggle />
        <button
          type="button"
          class="mconsole__icon-btn u-tap"
          aria-label="退出登录"
          @click="logout"
        >
          <AppIcon name="close" :size="18" color="#fff" />
        </button>
      </div>
    </header>

    <!-- ══ 内容区：4 个页内 tab（v-show 保留对话 / 消息状态） ══ -->
    <div class="mconsole__panes">
      <!-- ────────────── Tab 1 · 经营 ────────────── -->
      <section v-show="activeTab === 'biz'" class="mpane">
        <div class="mpane__scroll u-scroll-y">
          <!-- KPI 2 列网格 -->
          <h2 class="msec-title">核心指标</h2>
          <div v-if="bizLoading" class="kpi-grid">
            <div v-for="n in 4" :key="n" class="u-card kpi-card">
              <SkeletonBlock width="58%" height="12px" />
              <SkeletonBlock width="72%" height="22px" style="margin-top: 8px" />
              <SkeletonBlock width="40%" height="11px" style="margin-top: 8px" />
            </div>
          </div>
          <EmptyState
            v-else-if="bizError"
            icon="warning"
            title="经营数据暂时不可用"
            desc="后端未连接或服务异常，请稍后重试。"
            action-text="重新加载"
            @action="loadOverview"
          />
          <div v-else-if="overview" class="kpi-grid u-animate-in">
            <div v-for="kpi in overview.kpis" :key="kpi.key" class="u-card kpi-card">
              <p class="kpi-card__label">{{ kpi.label }}</p>
              <p class="kpi-card__value" :class="{ 'is-danger': kpi.danger }">{{ kpi.value }}</p>
              <p class="kpi-card__delta">
                <AppIcon
                  v-if="kpi.trend === 'up'"
                  name="arrow-up"
                  :size="12"
                  :color="kpi.danger ? 'var(--level-risk)' : 'var(--mn-green)'"
                />
                <AppIcon
                  v-else-if="kpi.trend === 'down'"
                  name="arrow-down"
                  :size="12"
                  :color="kpi.danger ? 'var(--level-risk)' : 'var(--level-warning)'"
                />
                <span :class="{ 'is-danger': kpi.danger }">{{ kpi.delta }}</span>
              </p>
            </div>
          </div>

          <!-- 风险门店 -->
          <section v-if="!bizLoading && !bizError && overview" class="u-card msec u-animate-in">
            <header class="msec__head">
              <AppIcon name="warning" :size="16" color="var(--level-risk)" />
              <h2>风险门店</h2>
            </header>
            <ul v-if="overview.riskTop5.length" class="risk-list">
              <li v-for="(s, i) in overview.riskTop5" :key="s.storeId" class="risk-list__item">
                <span class="risk-list__no" :style="{ background: `var(--level-${s.level})` }">
                  {{ i + 1 }}
                </span>
                <div class="risk-list__main">
                  <p class="risk-list__name">{{ s.storeName }}</p>
                  <p class="risk-list__reason">{{ s.reason }}</p>
                </div>
                <b class="risk-list__score" :style="{ color: `var(--level-${s.level})` }">
                  {{ s.score }}
                </b>
              </li>
            </ul>
            <EmptyState v-else icon="shield" title="暂无风险门店" desc="本区域各门店健康状况良好。" />
          </section>

          <!-- 业代红榜 Top5 -->
          <section class="u-card msec">
            <header class="msec__head">
              <AppIcon name="zap" :size="16" color="var(--mn-green)" />
              <h2>业代红榜</h2>
            </header>
            <div v-if="boardLoading" class="board-skel">
              <SkeletonBlock v-for="n in 3" :key="n" width="100%" height="34px" />
            </div>
            <EmptyState
              v-else-if="boardError"
              icon="warning"
              title="红榜暂时不可用"
              desc="排行榜数据加载失败。"
              action-text="重试"
              @action="loadLeaderboard"
            />
            <ul v-else-if="board.length" class="board-list">
              <li v-for="(row, i) in board" :key="row.repId" class="board-list__item">
                <span class="board-list__rank" :class="{ 'board-list__rank--top': i < 3 }">
                  {{ row.rank || i + 1 }}
                </span>
                <span class="board-list__name">{{ row.name }}</span>
                <span class="board-list__score">{{ row.score }} 分</span>
              </li>
            </ul>
            <EmptyState v-else icon="info" title="暂无排行数据" desc="排行榜生成后会展示在这里。" />
          </section>
        </div>
      </section>

      <!-- ────────────── Tab 2 · AI ────────────── -->
      <section v-show="activeTab === 'ai'" class="mpane mpane--ai">
        <!-- 推荐问题 chips -->
        <div class="ai-chips u-scroll-y">
          <button
            v-for="s in suggestions"
            :key="s"
            type="button"
            class="ai-chip"
            :disabled="aiSending"
            @click="askAi(s)"
          >
            {{ s }}
          </button>
        </div>

        <!-- 对话流 -->
        <div ref="aiScrollRef" class="ai-stream u-scroll-y">
          <EmptyState
            v-if="!aiMessages.length"
            icon="sparkles"
            title="问点什么吧"
            desc="例如「这周健康分为什么下降」「哪三家店今天最该去」；也可以点上方推荐问题一键提问。"
          />
          <div
            v-for="m in aiMessages"
            :key="m.id"
            class="ai-turn"
            :class="`ai-turn--${m.role}`"
          >
            <!-- 提问后 ~ 首字流出：用户气泡下方、AI 气泡出现前的一行分阶段等待话术 -->
            <div
              v-if="m.role === 'ai' && m.streaming && !m.text && aiWaitPhrase"
              class="ai-wait"
              role="status"
              aria-label="AI 正在准备回答"
            >
              <span class="ai-wait-dot" aria-hidden="true" />
              <span :key="aiWaitPhrase" class="ai-wait-text" aria-hidden="true">{{ aiWaitPhrase }}</span>
            </div>
            <div v-if="m.text || !m.streaming" class="ai-bubble" :class="`ai-bubble--${m.role}`">
              <p class="ai-text">{{ m.text }}<span v-if="m.streaming" class="ai-caret" /></p>
            </div>
            <span
              v-if="m.role === 'ai' && !m.streaming && m.text"
              class="ai-src"
              :class="m.source === 'llm' ? 'ai-src--llm' : 'ai-src--rule'"
            >
              {{ m.source === 'llm' ? 'AI 生成' : '标准答案库' }}
            </span>
          </div>
        </div>

        <!-- 底部输入条 -->
        <footer class="ai-composer">
          <input
            v-model="aiInput"
            type="text"
            class="ai-input"
            placeholder="输入经营问题"
            enterkeyhint="send"
            :disabled="aiSending"
            @keydown.enter="askAi(aiInput)"
          >
          <MilkDropLoader v-if="aiSending" size="button" label="" />
          <button
            v-else
            type="button"
            class="ai-send u-tap"
            aria-label="发送"
            :disabled="!aiInput.trim()"
            @click="askAi(aiInput)"
          >
            <AppIcon name="send" :size="20" color="#fff" />
          </button>
        </footer>
      </section>

      <!-- ────────────── Tab 3 · 消息 ────────────── -->
      <section v-show="activeTab === 'msg'" class="mpane">
        <MessageCenter mode="mobile" />
      </section>

      <!-- ────────────── Tab 4 · 我的 ────────────── -->
      <section v-show="activeTab === 'me'" class="mpane">
        <div class="mpane__scroll u-scroll-y">
          <!-- 个人名片 -->
          <section class="u-card me-card u-animate-in">
            <div class="me-card__avatar">{{ session.avatarText }}</div>
            <div class="me-card__info">
              <p class="me-card__name">{{ session.user?.name ?? '未登录' }}</p>
              <p class="me-card__meta">
                <span class="me-card__role">{{ session.roleLabel }}</span>
                <span class="me-card__region">
                  <AppIcon name="map-pin" :size="12" color="var(--text-3)" />
                  {{ session.user?.regionId || '未分配区域' }}
                </span>
              </p>
            </div>
          </section>

          <!-- AI 经营周报 -->
          <section class="u-card msec">
            <header class="msec__head msec__head--between">
              <span class="msec__head-text">
                <AppIcon name="sparkles" :size="16" color="var(--ai-purple)" />
                <h2>AI 经营周报</h2>
              </span>
              <button
                type="button"
                class="u-btn u-btn--ghost msec__action"
                :disabled="reportStreaming"
                @click="generateReport"
              >
                <AppIcon name="refresh" :size="13" />
                {{ reportStreaming ? '生成中' : reportDone || report ? '重新生成' : '生成周报' }}
              </button>
            </header>

            <div v-if="reportStreaming" class="report-loading">
              <MilkDropLoader size="button" label="" />
            </div>
            <p v-if="report" class="report-text">
              {{ report }}<span v-if="reportStreaming" class="ai-caret ai-caret--inline" />
            </p>
            <span
              v-if="reportDone || (reportSource && !reportStreaming)"
              class="ai-src"
              :class="reportSource === 'llm' ? 'ai-src--llm' : 'ai-src--rule'"
            >
              {{ reportSource === 'llm' ? 'AI 生成' : '标准答案库' }}
            </span>
            <p v-if="!report && !reportStreaming" class="msec__hint">
              点击右上角「生成周报」，AI 将汇总本周经营数据并流式输出。
            </p>
          </section>

          <!-- 发布公告（仅平台管理员） -->
          <section v-if="session.role === 'admin'" class="u-card msec">
            <header class="msec__head">
              <AppIcon name="bell" :size="16" color="var(--mn-green)" />
              <h2>发布公告</h2>
            </header>
            <div class="form-row">
              <label class="form-label" for="mc-ann-title">标题</label>
              <input
                id="mc-ann-title"
                v-model="annTitle"
                type="text"
                class="m-input"
                maxlength="50"
                placeholder="请输入公告标题"
              >
            </div>
            <div class="form-row">
              <label class="form-label" for="mc-ann-content">正文</label>
              <textarea
                id="mc-ann-content"
                v-model="annContent"
                class="m-input"
                rows="4"
                placeholder="请输入公告正文"
              />
            </div>
            <div class="form-row">
              <label class="form-label" for="mc-ann-audience">面向角色</label>
              <select id="mc-ann-audience" v-model="annAudience" class="m-input">
                <option v-for="opt in AUDIENCE_OPTIONS" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
            <button
              type="button"
              class="u-btn u-btn--primary m-btn-block"
              :disabled="annPublishing"
              @click="publishAnnouncement"
            >
              <AppIcon name="send" :size="15" />
              {{ annPublishing ? '发布中…' : '发布公告' }}
            </button>
          </section>

          <!-- 切换电脑版 -->
          <button type="button" class="u-btn u-btn--ghost m-btn-block" @click="goDesktop">
            <AppIcon name="sliders" :size="15" />
            切换电脑版
          </button>

          <!-- 退出登录 -->
          <button type="button" class="u-btn m-btn-block m-btn-logout" @click="logout">
            <AppIcon name="close" :size="15" />
            退出登录
          </button>
        </div>
      </section>
    </div>

    <!-- ══ 底部 tab（≥44px 触控热区，选中品牌绿） ══ -->
    <nav class="mconsole__tabbar u-safe-bottom" aria-label="移动工作台导航">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        class="mtab u-tap"
        :class="{ 'mtab--on': activeTab === t.key }"
        :aria-current="activeTab === t.key ? 'page' : undefined"
        @click="activeTab = t.key"
      >
        <AppIcon :name="t.icon" :size="22" />
        <span>{{ t.label }}</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
/* ══ 根容器：撑满 .dxc-mobile-full（fixed inset:0 / 100dvh） ══ */
.mconsole {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-page);
  color: var(--text-1);
}

/* ══ 顶部品牌渐变头（绿底白字为特许硬编码例外；横屏侧边刘海吃 env） ══ */
.mconsole__hero {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: max(10px, env(safe-area-inset-top, 0px))
    max(14px, env(safe-area-inset-right, 0px)) 14px
    max(14px, env(safe-area-inset-left, 0px));
  background: var(--grad-brand-deep);
  color: #fff;
}

.mconsole__hello {
  min-width: 0;
}

.mconsole__greet {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mconsole__role {
  margin: 2px 0 0;
  font-size: 11.5px;
  line-height: 1.3;
  opacity: 0.85;
}

.mconsole__hero-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 渐变块上的半透明白底圆形按钮（白字/白图标特许） */
.mconsole__icon-btn {
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.mconsole__icon-btn:active {
  background: rgba(255, 255, 255, 0.3);
}

/* ══ 内容区：唯一纵向高度分配点 ══ */
.mconsole__panes {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.mpane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.mpane__scroll {
  flex: 1;
  min-height: 0;
  padding: 14px max(12px, env(safe-area-inset-right, 0px)) 20px
    max(12px, env(safe-area-inset-left, 0px));
  overflow-x: hidden;
  overflow-wrap: break-word;
  word-break: break-word;
}

/* ══ 区块通用 ══ */
.msec-title {
  margin: 0 2px 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-2);
}

.msec {
  margin-top: 12px;
  padding: 14px;
}

.msec__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.msec__head--between {
  justify-content: space-between;
}

.msec__head-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.msec__head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

.msec__action {
  height: 30px;
  padding: 0 12px;
  font-size: 12px;
}

.msec__hint {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-3);
}

/* ══ KPI 网格 ══ */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.kpi-card {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.kpi-card__label {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kpi-card__value {
  margin: 6px 0 0;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.2;
  color: var(--text-1);
}

.kpi-card__value.is-danger {
  color: var(--level-risk);
}

.kpi-card__delta {
  margin: 6px 0 0;
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 11.5px;
  color: var(--text-3);
}

.kpi-card__delta .is-danger {
  color: var(--level-risk);
}

/* ══ 风险门店 ══ */
.risk-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}

.risk-list__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border-color);
}

.risk-list__item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.risk-list__no {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
}

.risk-list__main {
  flex: 1;
  min-width: 0;
}

.risk-list__name {
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.risk-list__reason {
  margin: 2px 0 0;
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.risk-list__score {
  flex: none;
  font-size: 18px;
  font-weight: 800;
}

/* ══ 业代红榜 ══ */
.board-skel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.board-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}

.board-list__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
}

.board-list__item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.board-list__rank {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
  background: var(--bg-page);
  border: 1px solid var(--border-color);
}

.board-list__rank--top {
  background: var(--mn-green);
  border-color: var(--mn-green);
  color: #fff;
}

.board-list__name {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.board-list__score {
  flex: none;
  font-size: 13px;
  font-weight: 700;
  color: var(--mn-green);
}

/* ══ AI tab ══ */
.ai-chips {
  flex: none;
  display: flex;
  gap: 8px;
  padding: 10px max(12px, env(safe-area-inset-right, 0px)) 4px
    max(12px, env(safe-area-inset-left, 0px));
  overflow-x: auto;
  overflow-y: hidden;
}

.ai-chip {
  flex: none;
  max-width: 70%;
  padding: 7px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--r-pill);
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-chip:active:not(:disabled) {
  border-color: var(--ai-purple);
  color: var(--ai-purple);
}

.ai-chip:disabled {
  opacity: 0.5;
}

.ai-stream {
  flex: 1;
  min-height: 0;
  padding: 10px max(12px, env(safe-area-inset-right, 0px)) 12px
    max(12px, env(safe-area-inset-left, 0px));
}

.ai-turn {
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
}

.ai-turn--user {
  align-items: flex-end;
}

.ai-turn--ai {
  align-items: flex-start;
}

.ai-bubble {
  max-width: 82%;
  padding: 9px 12px;
  border-radius: 12px;
  font-size: 13.5px;
  line-height: 1.7;
}

.ai-bubble--user {
  background: var(--grad-brand);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.ai-bubble--ai {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-1);
  border-bottom-left-radius: 4px;
}

.ai-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 首字流出前的分阶段等待话术（在 .ai-stream 滚动区内、底部输入条上方，不遮挡输入条） */
.ai-wait {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0 4px;
}

.ai-wait-dot {
  flex: none;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 2px solid var(--border-color);
  border-top-color: var(--ai-purple);
  animation: ai-wait-spin 0.8s linear infinite;
}

.ai-wait-text {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
  animation: ai-wait-in var(--dur-fast) var(--ease-standard) both;
}

@keyframes ai-wait-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes ai-wait-in {
  from {
    opacity: 0;
    transform: translateY(2px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.ai-caret {
  display: inline-block;
  width: 7px;
  height: 14px;
  margin-left: 2px;
  vertical-align: -2px;
  background: var(--ai-purple);
  animation: ai-blink 1s steps(2) infinite;
}

.ai-caret--inline {
  height: 13px;
}

@keyframes ai-blink {
  0%,
  50% {
    opacity: 1;
  }
  51%,
  100% {
    opacity: 0;
  }
}

/* 来源胶囊：llm 紫 / 兜底灰（如实标注，不夸大） */
.ai-src {
  margin-top: 5px;
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: var(--r-pill);
  font-size: 10.5px;
  line-height: 1.6;
}

.ai-src--llm {
  background: var(--ai-mist);
  color: var(--ai-purple);
}

.ai-src--rule {
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  color: var(--text-3);
}

.ai-composer {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px max(12px, env(safe-area-inset-right, 0px)) 10px
    max(12px, env(safe-area-inset-left, 0px));
  border-top: 1px solid var(--border-color);
  background: var(--bg-card);
}

.ai-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--r-pill);
  background: var(--bg-page);
  color: var(--text-1);
  font-size: 14px;
}

.ai-input:focus {
  outline: none;
  border-color: var(--mn-green);
  box-shadow: 0 0 0 2px var(--mn-green-light);
}

.ai-input:disabled {
  opacity: 0.6;
}

.ai-send {
  flex: none;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--grad-brand);
  box-shadow: var(--sh-brand);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ai-send:disabled {
  opacity: 0.45;
  box-shadow: none;
}

/* ══ 我的 tab ══ */
.me-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 14px;
}

.me-card__avatar {
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--grad-brand);
  color: #fff;
  font-size: 18px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.me-card__info {
  min-width: 0;
}

.me-card__name {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  color: var(--text-1);
}

.me-card__meta {
  margin: 4px 0 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-3);
}

.me-card__role {
  padding: 1px 8px;
  border-radius: var(--r-pill);
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-weight: 600;
}

.me-card__region {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.report-loading {
  display: flex;
  justify-content: center;
  padding: 8px 0 4px;
}

.report-text {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.85;
  color: var(--text-1);
  white-space: pre-wrap;
  word-break: break-word;
}

/* 公告表单 */
.form-row {
  margin-bottom: 12px;
}

.form-row:last-of-type {
  margin-bottom: 14px;
}

.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-2);
}

.m-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--r-s);
  background: var(--bg-page);
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
}

textarea.m-input {
  resize: none;
}

.m-input:focus {
  outline: none;
  border-color: var(--mn-green);
  box-shadow: 0 0 0 2px var(--mn-green-light);
}

.m-btn-block {
  width: 100%;
  margin-top: 12px;
}

.m-btn-logout {
  background: var(--bg-card);
  border: 1px solid var(--color-danger);
  color: var(--color-danger);
}

.m-btn-logout:active {
  background: var(--danger-bg);
}

/* ══ 底部 tab（视觉语言对齐 TabBar.vue，项不同故自写） ══ */
.mconsole__tabbar {
  flex: none;
  display: flex;
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  /* u-safe-bottom 已给底部安全区；这里只补横屏左右刘海 */
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
}

.mtab {
  flex: 1;
  min-width: 0;
  min-height: var(--touch-target-min);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 0;
  border: none;
  background: none;
  color: var(--text-3);
  font-size: 11px;
}

.mtab--on {
  color: var(--mn-green);
  font-weight: 700;
}

.mtab span {
  white-space: nowrap;
  line-height: 1.2;
}

/* 减弱动效：等待点静止、话术不做入场动效（JS 侧同样不轮换） */
@media (prefers-reduced-motion: reduce) {
  .ai-wait-dot,
  .ai-wait-text {
    animation: none;
  }
}
</style>
