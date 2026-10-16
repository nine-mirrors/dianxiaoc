<script setup lang="ts">
/**
 * 消息中心（四端共用核心组件）。
 *
 * 组成：① 会话 IM（会话列表 + 消息流 + 输入框）② 公告（管理员发布 → 三端实时收到）
 *
 * 列表与消息能力：
 *   - 会话检索（按 标题 / 成员角色 / 最后一条消息 匹配）+「未读」筛选；
 *   - 会话内消息检索（命中数 + 关键词高亮，纯文本切分，不用 v-html）；
 *   - 图片消息（复用统一上传通道 POST /api/v1/uploads，点击可看大图）；
 *   - 会话操作面板：置顶、免打扰（未读不进角标）、删除会话（按账号隔离的软删除，
 *     对方再来消息会自动重新出现）。三者均「按登录账号隔离」，只影响自己。
 *
 * 实时能力：订阅 realtime 的 `message:new` / `announcement:new`
 *   - 当前打开的会话收到新消息 → 直接追加并自动标记已读；
 *   - 其他会话收到新消息 → 仅未读数 +1、列表置顶；
 *   - 新公告 → 公告页置顶插入并把角标 +1。
 *
 * 使用方（各端薄包装，保证桌面/手机两种形态各取所需）：
 *   - 手机端  views/common/MessagesView.vue          （mode=mobile）
 *   - 经理端  views/manager/MessagesView.vue         （mode=desktop）
 *   - 管理端  views/admin/AdminMessagesView.vue      （mode=desktop）
 *
 * 身份判定：消息 senderId 存的是**登录账号名**（如 liqiang）；本组件从会话 token
 * 首段取出账号名（token = `username.ts.exp.sig`），据此区分「我 / 对方」气泡方向。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useToast } from '@/composables/useToast'
import { useSessionStore } from '@/stores/session'
import { onRealtime } from '@/realtime/client'
import {
  listConversations,
  getConversation,
  sendMessage,
  markConversationRead,
  pinConversation,
  muteConversation,
  hideConversation,
  markAnnouncementRead,
  getNotifications,
  type AnnouncementItem,
  type ConversationItem,
  type MessageItem,
  type NotificationFeed,
  type NotificationTask,
  type SystemEvent,
} from '@/api/messages'
import { uploadAvatarImage } from '@/api/profile'
import { updateTaskStatus } from '@/api'
import { DEMO_TODAY, DEMO_WEATHER, DEMO_WEEKDAY } from '@/domain/constants'

interface Props {
  /** mobile：单列，会话列表 → 点开进入消息流；desktop：双列并排 */
  mode?: 'mobile' | 'desktop'
}
const props = withDefaults(defineProps<Props>(), { mode: 'mobile' })

const session = useSessionStore()
const { success, error: toastError } = useToast()

/** 当前登录账号名（token 首段）——用于判定「我发的」气泡方向 */
const myName = computed<string>(() => String(session.token || '').split('.')[0] || '')

/** 当前页签：notify = 通知中心（任务待办 + 公告 + 系统动态 + 天气）；chat = 会话 IM */
const tab = ref<'notify' | 'chat'>('notify')
const loading = ref(true)

/* ── 会话 ── */
const conversations = ref<ConversationItem[]>([])
const activeId = ref<string>('')
const messages = ref<MessageItem[]>([])
const threadLoading = ref(false)
const draft = ref('')
const sending = ref(false)
const hasMore = ref(false)
const listRef = ref<HTMLElement | null>(null)

/* ── 通知中心聚合（任务待办 + 公告 + 系统动态 + 天气） ── */
const feed = ref<NotificationFeed | null>(null)
const feedLoading = ref(false)
/** 待办任务（含 overdue / dueSoon / minutesLeft，由后端按演示基准时间算好） */
const tasks = ref<NotificationTask[]>([])
/** 系统动态（真实巡店 / 整改 / 单据记录派生） */
const systemEvents = ref<SystemEvent[]>([])
/** 公告（来自聚合接口，结构与 /announcements 一致） */
const announcements = ref<AnnouncementItem[]>([])
const expandedId = ref<string>('')
/** 正在提交「完成」的待办 id */
const markingId = ref<string>('')

/* ── 会话检索 / 未读筛选 ── */
const keyword = ref('')
const unreadOnly = ref(false)

/* ── 会话内消息检索（在当前会话的消息里找关键词） ── */
const msgKeyword = ref('')
const msgSearchOpen = ref(false)

/* ── 会话操作菜单（免打扰 / 删除会话） ── */
const menuConv = ref<ConversationItem | null>(null)

/* ── 图片消息 ── */
const fileRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const previewUrl = ref('')

const activeConv = computed<ConversationItem | null>(
  () => conversations.value.find((c) => c.id === activeId.value) ?? null,
)
/** 会话角标：免打扰会话的未读不计入（与后端 /messages/unread 口径一致） */
const chatUnread = computed<number>(() =>
  conversations.value.reduce((s, c) => s + (c.muted ? 0 : c.unread), 0),
)
/** 通知角标：未读公告 + 逾期任务（与后端 /messages/unread 的 total 同口径） */
const notifyUnread = computed<number>(() => {
  const c = feed.value?.counts
  return c ? c.unreadAnnouncements + c.overdueTasks : 0
})

/** 是否业代 —— 只有业代能对任务回执「完成」（与 PATCH /tasks/:id 的角色限制一致） */
const canCompleteTasks = computed<boolean>(() => session.user?.role === 'rep')

/**
 * 天气卡内容：来自前端演示基准常量（与后端 dashboard.js 的 DEMO_TODAY 同源）。
 * ⚠ 项目没有真实气象数据源，此处如实使用演示基准，不编造实时天气接口。
 */
const weather = computed<{ date: string; text: string; tip: string }>(() => ({
  date: `${DEMO_TODAY} ${DEMO_WEEKDAY}`,
  text: DEMO_WEATHER,
  tip: '适宜门店走访；冷链门店到店先确认冰柜温度与纯净度',
}))

/** 会话列表筛选结果：关键词匹配「标题 / 成员角色 / 最后一条消息」，并可只看未读 */
const filteredConversations = computed<ConversationItem[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  return conversations.value.filter((c) => {
    if (unreadOnly.value && !c.unread) return false
    if (!kw) return true
    const haystack = [
      c.title,
      ...c.members.map((r) => ROLE_LABEL[r] ?? r),
      c.lastMessage?.senderName ?? '',
      c.lastMessage?.content ?? '',
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(kw)
  })
})

/** 会话内命中消息（未搜索时为 null，列表按原顺序完整展示） */
const matchedMessages = computed<MessageItem[] | null>(() => {
  const kw = msgKeyword.value.trim().toLowerCase()
  if (!kw) return null
  return messages.value.filter((m) => m.kind === 'text' && m.content.toLowerCase().includes(kw))
})

/** 消息区实际渲染的数据源：搜索时只显示命中项 */
const visibleMessages = computed<MessageItem[]>(() => matchedMessages.value ?? messages.value)

const searchingThread = computed<boolean>(() => !!msgKeyword.value.trim())

/** 把一条文本按关键词切成 [前段(非命中)|命中段|后段] 供模板高亮（纯文本切分，不用 v-html） */
function segments(text: string): Array<{ text: string; hit: boolean }> {
  const kw = msgKeyword.value.trim()
  if (!kw) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const needle = kw.toLowerCase()
  const out: Array<{ text: string; hit: boolean }> = []
  let i = 0
  while (i < text.length) {
    const at = lower.indexOf(needle, i)
    if (at === -1) {
      out.push({ text: text.slice(i), hit: false })
      break
    }
    if (at > i) out.push({ text: text.slice(i, at), hit: false })
    out.push({ text: text.slice(at, at + needle.length), hit: true })
    i = at + needle.length
  }
  return out.length ? out : [{ text, hit: false }]
}

/** 是否「我」发的 */
function isMine(m: MessageItem): boolean {
  return !!myName.value && m.senderId === myName.value
}

/** HH:mm（今天）/ MM-DD HH:mm（更早） */
function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return sameDay ? hm : `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hm}`
}

const ROLE_LABEL: Record<string, string> = {
  rep: '业代',
  manager: '区域经理',
  owner: '店主',
  admin: '管理员',
}

/** 会话头像图标：门店→store / 组织→bell / 其余→user（无真实头像时回落，与既有视觉一致） */
function convIcon(c: ConversationItem | null): string {
  if (!c) return 'user'
  return c.kind === 'store' ? 'store' : c.kind === 'org' ? 'bell' : 'user'
}

/** 头像加载失败 → 清空 URL，回落到图标，避免裂图/空白 */
function clearAvatar(conv: ConversationItem | null): void {
  if (conv) conv.peerAvatarUrl = ''
}

/** 会话排序：置顶优先，同档内按最新消息时间倒序（与后端 pinned DESC, last_at DESC 一致） */
function sortConversations(): void {
  conversations.value = [...conversations.value].sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1
    return a.lastAt < b.lastAt ? 1 : -1
  })
}

/** 置顶 / 取消置顶：乐观更新 + 失败回滚并提示 */
async function togglePin(c: ConversationItem): Promise<void> {
  const next = !c.pinned
  c.pinned = next // 先改本地 UI
  sortConversations() // 立即按「置顶优先」重排
  closeMenu() // 若从操作面板触发，顺手收起面板
  try {
    const updated = await pinConversation(c.id, { pinned: next })
    Object.assign(c, updated) // 以后端返回为准
    sortConversations()
  } catch {
    c.pinned = !next // 回滚到原状态
    sortConversations()
    toastError('置顶操作失败，请稍后重试', {
      action: { text: '再试一次', onAction: () => void togglePin(c) },
    })
  }
}

/* ── 会话操作（免打扰 / 删除会话） ── */

/** 打开会话操作菜单 */
function openMenu(c: ConversationItem): void {
  menuConv.value = c
}

function closeMenu(): void {
  menuConv.value = null
}

/** 免打扰 / 取消免打扰：乐观更新 + 失败回滚（按账号隔离，只影响自己） */
async function toggleMute(c: ConversationItem): Promise<void> {
  const next = !c.muted
  c.muted = next
  closeMenu()
  try {
    const updated = await muteConversation(c.id, { muted: next })
    Object.assign(c, updated)
    success(next ? `已对「${c.title}」开启免打扰` : `已取消「${c.title}」的免打扰`)
  } catch {
    c.muted = !next
    toastError('操作失败，请稍后重试')
  }
}

/** 删除会话：仅从「我」的列表移除（不发删除消息，对方再来消息会自动重新出现） */
async function removeConv(c: ConversationItem): Promise<void> {
  closeMenu()
  if (!window.confirm(`删除会话「${c.title}」？\n仅从你的会话列表移除，对方发来新消息后会重新出现。`)) return
  try {
    await hideConversation(c.id)
    conversations.value = conversations.value.filter((x) => x.id !== c.id)
    if (activeId.value === c.id) backToList()
    success('已从会话列表移除')
  } catch {
    toastError('删除失败，请稍后重试')
  }
}

/* ── 图片消息（复用统一上传通道 POST /api/v1/uploads） ── */

/** 唤起系统文件选择（图片） */
function pickImage(): void {
  if (uploading.value) return
  fileRef.value?.click()
}

/** FileReader → dataURL（后端 /uploads 接收 `data:image/…;base64,…` 形态） */
function readAsDataURL(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ''))
    fr.onerror = () => reject(new Error('图片读取失败'))
    fr.readAsDataURL(file)
  })
}

/** 选定图片 → 上传落盘 → 以 kind=image 发送（content 存可访问 URL） */
async function onImagePicked(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 允许连续选择同一张图片
  const convId = activeId.value
  if (!file || !convId) return
  if (!file.type.startsWith('image/')) {
    toastError('请选择图片文件（jpg / png / webp）')
    return
  }
  if (file.size > 6 * 1024 * 1024) {
    toastError('图片请控制在 6MB 以内')
    return
  }
  uploading.value = true
  try {
    const data = await readAsDataURL(file)
    const up = await uploadAvatarImage(data, file.name)
    const res = await sendMessage(convId, { kind: 'image', content: up.url })
    // 与文本发送同口径：广播路径可能已先入列，按 id 判重避免渲染两遍
    if (!messages.value.some((m) => m.id === res.message.id)) {
      messages.value = [...messages.value, res.message]
    }
    const conv = conversations.value.find((c) => c.id === convId)
    if (conv) conv.lastMessage = res.message
    await scrollBottom()
    success('图片已发送')
  } catch {
    toastError('图片发送失败，请检查网络后重试')
  } finally {
    uploading.value = false
  }
}

/* ── 图片预览 ── */

function openPreview(url: string): void {
  previewUrl.value = url
}

function closePreview(): void {
  previewUrl.value = ''
}

/* ── 会话内消息检索 ── */

/** 展开 / 收起会话内搜索；收起时清空关键词，回到完整消息流 */
function toggleMsgSearch(): void {
  msgSearchOpen.value = !msgSearchOpen.value
  if (!msgSearchOpen.value) msgKeyword.value = ''
}

/** 滚到消息流底部 */
async function scrollBottom(): Promise<void> {
  await nextTick()
  const el = listRef.value
  if (el) el.scrollTop = el.scrollHeight
}

/** 拉取会话列表（首次 + 手动刷新） */
async function loadConversations(): Promise<void> {
  try {
    const res = await listConversations()
    conversations.value = res.items
    sortConversations() // 兜底：保证「置顶优先」，与后端排序一致
  } catch {
    /* 后端不可用时保持空列表，界面显示空态 */
  }
}

/** 打开会话：拉历史消息 + 标记已读 */
async function openConv(id: string): Promise<void> {
  activeId.value = id
  closeMenu()
  msgKeyword.value = '' // 进入另一会话时清空上一个会话的搜索词
  threadLoading.value = true
  try {
    const res = await getConversation(id, { limit: 40 })
    messages.value = res.items
    hasMore.value = res.hasMore
    await scrollBottom()
    const conv = conversations.value.find((c) => c.id === id)
    if (conv?.unread) {
      await markConversationRead(id)
      conv.unread = 0
    }
  } catch {
    toastError('消息加载失败，请稍后重试')
  } finally {
    threadLoading.value = false
  }
}

/** 上翻更早消息 */
async function loadMore(): Promise<void> {
  if (!activeId.value || !hasMore.value) return
  const first = messages.value[0]
  if (!first) return
  const el = listRef.value
  const keepHeight = el?.scrollHeight ?? 0
  try {
    const res = await getConversation(activeId.value, { before: first.createdAt, limit: 30 })
    messages.value = [...res.items, ...messages.value]
    hasMore.value = res.hasMore
    await nextTick()
    if (el) el.scrollTop = el.scrollHeight - keepHeight
  } catch {
    /* 忽略：不打断阅读 */
  }
}

/** 发送消息 */
async function send(): Promise<void> {
  const text = draft.value.trim()
  if (!text || !activeId.value || sending.value) return
  sending.value = true
  try {
    const res = await sendMessage(activeId.value, { kind: 'text', content: text })
    // ★ 后端在返回响应**之前**就已广播 message:new，realtime 那条路径通常先到达并已入列；
    //   这里必须同样按 id 判重，否则一条消息会被渲染两遍（发 2 次看到 4 条）。
    if (!messages.value.some((m) => m.id === res.message.id)) {
      messages.value = [...messages.value, res.message]
    }
    draft.value = ''
    const conv = conversations.value.find((c) => c.id === activeId.value)
    if (conv) conv.lastMessage = res.message
    await scrollBottom()
  } catch {
    toastError('发送失败，请检查网络后重试')
  } finally {
    sending.value = false
  }
}

/** 拉取通知中心聚合（任务待办 + 公告 + 系统动态）：一次请求拿全，避免两屏数字不同源 */
async function loadNotifications(): Promise<void> {
  feedLoading.value = true
  try {
    const res = await getNotifications()
    feed.value = res
    tasks.value = res.tasks.items
    systemEvents.value = res.system
    announcements.value = res.announcements
  } catch {
    /* 后端不可用时保持上次数据（首屏为空则显示空态） */
  } finally {
    feedLoading.value = false
  }
}

/**
 * 标记待办完成（仅业代可回执，与 PATCH /tasks/:id 的角色限制一致）。
 * 完成后本地移除该条并刷新聚合，经理看板的任务完成率随之变化（管理有回执）。
 */
async function markTaskDone(t: NotificationTask): Promise<void> {
  if (markingId.value) return
  markingId.value = t.id
  try {
    await updateTaskStatus(t.id, 'done')
    tasks.value = tasks.value.filter((x) => x.id !== t.id)
    success(`已完成待办：${t.storeName} · ${t.taskTypeLabel}`)
    void loadNotifications()
  } catch {
    toastError('标记失败，请稍后重试')
  } finally {
    markingId.value = ''
  }
}

/**
 * 时限文案（依据后端给出的 minutesLeft，以**演示基准时间**为准）：
 *   负数 → 「已逾期 X 小时 Y 分」；0 分钟 → 「即将到期」；否则「剩余 X 小时 Y 分」。
 */
function dueText(t: NotificationTask): string {
  const m = t.minutesLeft
  if (m === null) return ''
  const sign = m < 0 ? '已逾期' : '剩余'
  const abs = Math.abs(m)
  const h = Math.floor(abs / 60)
  const min = abs % 60
  if (h === 0 && min === 0) return '即将到期'
  return h === 0 ? `${sign} ${min} 分钟` : `${sign} ${h} 小时${min ? ` ${min} 分` : ''}`
}

/** 系统动态分类文案与图标（与后端 kind 一一对应） */
const SYS_META: Record<string, { label: string; icon: string }> = {
  visit: { label: '巡店', icon: 'check-circle' },
  rectification: { label: '整改', icon: 'shield' },
  ticket: { label: '单据', icon: 'clipboard' },
}
function sysMeta(kind: string): { label: string; icon: string } {
  return SYS_META[kind] ?? { label: '动态', icon: 'info' }
}

/** 展开/收起公告；首次展开即标记已读（并同步递减聚合里的未读公告数，角标即时更新） */
async function toggleNotice(a: AnnouncementItem): Promise<void> {
  expandedId.value = expandedId.value === a.id ? '' : a.id
  if (expandedId.value === a.id && !a.read) {
    try {
      const res = await markAnnouncementRead(a.id)
      a.read = true
      a.readCount = res.readCount
      if (feed.value) {
        feed.value.counts.unreadAnnouncements = Math.max(0, feed.value.counts.unreadAnnouncements - 1)
      }
    } catch {
      /* 静默：下次进入再标 */
    }
  }
}

/** 页签切换：通知页首屏未取到聚合数据时补拉（会话由 onMounted 预取） */
function switchTab(t: 'notify' | 'chat'): void {
  tab.value = t
  if (t === 'notify' && !feed.value) void loadNotifications()
}

/* ── 实时订阅 ── */
let offMsg: (() => void) | null = null
let offAnn: (() => void) | null = null
let offTask: (() => void) | null = null

onMounted(async () => {
  loading.value = true
  // 通知聚合与会话列表并行取（互不依赖），首屏更快
  void loadNotifications()
  await loadConversations()
  // 桌面端默认打开第一个会话（双列并排，右侧不至于空着）；
  // 移动端保持「先看到会话列表」——搜索 / 未读筛选与行内操作都在列表上，
  // 点开某一行再进入消息流、用「‹」返回（与常见 IM 的层级一致）
  if (props.mode === 'desktop' && conversations.value.length) {
    await openConv(conversations.value[0].id)
  }
  loading.value = false

  offMsg = onRealtime<{ convId: string; message: MessageItem }>('message:new', (payload) => {
    if (!payload?.message || !payload.convId) return
    const conv = conversations.value.find((c) => c.id === payload.convId)
    if (!conv) {
      // 会话不在列表：可能是我此前「删除」过、现在又来了新消息 → 重新拉列表让它复现
      if (!isMine(payload.message)) void loadConversations()
      return
    }
    conv.lastMessage = payload.message
    conv.lastAt = payload.message.createdAt
    // 列表重排：置顶优先，其余按最新消息时间（不破坏置顶项在最前）
    sortConversations()
    if (payload.convId === activeId.value) {
      // 自己发的消息 HTTP 已回显，去重后再追加
      if (!messages.value.some((m) => m.id === payload.message.id)) {
        messages.value = [...messages.value, payload.message]
        void scrollBottom()
        void markConversationRead(payload.convId)
      }
    } else if (!isMine(payload.message)) {
      conv.unread += 1
    }
  })

  offAnn = onRealtime<{ announcement: AnnouncementItem }>('announcement:new', (payload) => {
    const a = payload?.announcement
    if (!a) return
    if (!announcements.value.some((x) => x.id === a.id)) {
      const item: AnnouncementItem = { ...a, read: false, readCount: a.readCount ?? 0 }
      // 置顶公告插到最前；非置顶插到「所有置顶项之后」，不打乱后端既有相对顺序
      const firstPlain = announcements.value.findIndex((x) => !x.pinned)
      const at = item.pinned ? 0 : firstPlain === -1 ? announcements.value.length : firstPlain
      announcements.value = [
        ...announcements.value.slice(0, at),
        item,
        ...announcements.value.slice(at),
      ]
    }
    success(`收到新公告：${a.title}`)
    // 聚合里的未读公告计数同步 +1，通知页签角标即时反映
    if (feed.value) feed.value.counts.unreadAnnouncements += 1
  })

  // 经理下派 → 业代端实时收到（后端 `task:new` 定向投递给 rep）：
  // 直接重拉聚合，待办区与逾期计数同步更新，不用手刷
  offTask = onRealtime<{ task: NotificationTask }>('task:new', (payload) => {
    const t = payload?.task
    if (!t) return
    void loadNotifications()
    success(`收到新待办：${t.storeName} · ${t.taskTypeLabel}`)
  })
})

onBeforeUnmount(() => {
  offMsg?.()
  offAnn?.()
  offTask?.()
})

/** 手机端打开会话时隐藏列表（返回键回到列表） */
function backToList(): void {
  activeId.value = ''
  messages.value = []
  msgKeyword.value = ''
  msgSearchOpen.value = false
  closeMenu()
}
</script>

<template>
  <div class="mc" :class="`mc--${mode}`">
    <!-- 顶部页签：① 通知中心（统一收口） ② 会话 IM -->
    <div class="mc__tabs" role="tablist">
      <button
        class="mc__tab"
        :class="{ 'mc__tab--on': tab === 'notify' }"
        role="tab"
        :aria-selected="tab === 'notify'"
        @click="switchTab('notify')"
      >
        通知
        <span v-if="notifyUnread" class="mc__badge">{{ notifyUnread > 99 ? '99+' : notifyUnread }}</span>
      </button>
      <button
        class="mc__tab"
        :class="{ 'mc__tab--on': tab === 'chat' }"
        role="tab"
        :aria-selected="tab === 'chat'"
        @click="switchTab('chat')"
      >
        会话
        <span v-if="chatUnread" class="mc__badge">{{ chatUnread > 99 ? '99+' : chatUnread }}</span>
      </button>
    </div>

    <!-- ══ 会话 ══ -->
    <div v-if="tab === 'chat'" class="mc__body">
      <!-- 会话列表（桌面常显；手机仅未选中会话时显示） -->
      <aside class="mc__list" :class="{ 'mc__list--hidden': mode === 'mobile' && activeId }">
        <!-- 会话检索 + 未读筛选 -->
        <div class="mc__search">
          <label class="mc__search-box">
            <AppIcon name="search" :size="15" />
            <input
              v-model="keyword"
              type="search"
              class="mc__search-input"
              placeholder="搜索会话 / 消息内容"
              aria-label="搜索会话"
            />
            <button
              v-if="keyword"
              type="button"
              class="mc__search-clear u-tap"
              aria-label="清空搜索"
              @click="keyword = ''"
            >
              <AppIcon name="close" :size="13" />
            </button>
          </label>
          <button
            type="button"
            class="mc__chip u-tap"
            :class="{ 'mc__chip--on': unreadOnly }"
            :aria-pressed="unreadOnly"
            @click="unreadOnly = !unreadOnly"
          >
            未读<span v-if="chatUnread" class="mc__chip-num">{{ chatUnread > 99 ? '99+' : chatUnread }}</span>
          </button>
        </div>

        <div class="mc__list-body mot-stagger">
          <p v-if="loading" class="mc__hint">加载中…</p>
          <EmptyState
            v-else-if="!conversations.length"
            icon="message"
            title="暂无会话"
            desc="暂时没有新消息，去看看通知里有没有新安排"
            action-text="查看通知"
            @action="switchTab('notify')"
          />
          <EmptyState
            v-else-if="!filteredConversations.length"
            icon="search"
            :title="unreadOnly ? '没有未读会话' : '没有匹配的会话'"
            :desc="unreadOnly ? '取消「未读」筛选即可看到全部会话' : '换个关键词试试，或清空搜索'"
          />
          <div
            v-for="c in filteredConversations"
            v-else
            :key="c.id"
            class="mc__conv"
            :class="{ 'mc__conv--on': c.id === activeId, 'mc__conv--pinned': c.pinned }"
          >
            <button
              type="button"
              class="mc__conv-open u-tap"
              :aria-label="`打开会话：${c.title}`"
              @click="openConv(c.id)"
            >
              <span class="mc__conv-avatar">
                <img
                  v-if="c.peerAvatarUrl"
                  :src="c.peerAvatarUrl"
                  alt=""
                  loading="lazy"
                  @error="clearAvatar(c)"
                />
                <AppIcon v-else :name="convIcon(c)" :size="17" />
              </span>
              <span class="mc__conv-main">
                <span class="mc__conv-title">{{ c.title }}</span>
                <span class="mc__conv-last">
                  <template v-if="c.lastMessage">
                    {{ c.lastMessage.senderName }}：{{
                      c.lastMessage.kind === 'image' ? '[图片]' : c.lastMessage.content
                    }}
                  </template>
                  <template v-else>暂无消息</template>
                </span>
              </span>
              <span class="mc__conv-side">
                <span class="mc__conv-meta">
                  <AppIcon v-if="c.muted" name="bell-off" :size="11" class="mc__conv-mute" />
                  <span class="mc__conv-time">{{ c.lastAt ? fmtTime(c.lastAt) : '' }}</span>
                </span>
                <span v-if="c.unread" class="mc__badge" :class="{ 'mc__badge--muted': c.muted }">
                  {{ c.unread > 99 ? '99+' : c.unread }}
                </span>
              </span>
            </button>
            <button
              type="button"
              class="mc__conv-pin u-tap"
              :class="{ 'mc__conv-pin--on': c.pinned }"
              :aria-pressed="c.pinned"
              :aria-label="c.pinned ? `取消置顶会话：${c.title}` : `置顶会话：${c.title}`"
              @click="togglePin(c)"
            >
              <AppIcon name="map-pin" :size="15" />
            </button>
            <button
              type="button"
              class="mc__conv-more u-tap"
              :aria-label="`会话操作：${c.title}`"
              @click="openMenu(c)"
            >
              <AppIcon name="more" :size="16" />
            </button>
          </div>
        </div>
      </aside>

      <!-- 消息流（桌面常显；手机仅选中会话时显示） -->
      <section class="mc__thread" :class="{ 'mc__thread--hidden': mode === 'mobile' && !activeId }">
        <template v-if="activeConv">
          <header class="mc__thread-head">
            <button
              v-if="mode === 'mobile'"
              class="mc__back u-tap"
              type="button"
              aria-label="返回会话列表"
              @click="backToList"
            >
              ‹
            </button>
            <span class="mc__thread-avatar">
              <img
                v-if="activeConv.peerAvatarUrl"
                :src="activeConv.peerAvatarUrl"
                alt=""
                @error="clearAvatar(activeConv)"
              />
              <AppIcon v-else :name="convIcon(activeConv)" :size="16" />
            </span>
            <div class="mc__thread-title">
              <b>
                {{ activeConv.title }}
                <AppIcon v-if="activeConv.muted" name="bell-off" :size="12" class="mc__conv-mute" />
              </b>
              <small>{{ activeConv.members.map((r) => ROLE_LABEL[r] ?? r).join(' · ') }}</small>
            </div>
            <button
              type="button"
              class="mc__thread-search u-tap"
              :class="{ 'mc__thread-search--on': msgSearchOpen }"
              :aria-pressed="msgSearchOpen"
              :aria-label="msgSearchOpen ? '关闭消息搜索' : '在会话中搜索消息'"
              @click="toggleMsgSearch"
            >
              <AppIcon :name="msgSearchOpen ? 'close' : 'search'" :size="16" />
            </button>
          </header>

          <!-- 会话内消息搜索条（展开时淡入下滑，收起即卸载，不占常态空间） -->
          <Transition name="mc-slide">
            <div v-if="msgSearchOpen" class="mc__thread-searchbar">
              <AppIcon name="search" :size="14" />
              <input
                v-model="msgKeyword"
                type="search"
                class="mc__thread-searchinput"
                placeholder="在本会话消息中搜索"
                aria-label="在本会话消息中搜索"
              />
              <span v-if="searchingThread" class="mc__thread-searchhint">
                命中 {{ matchedMessages?.length ?? 0 }} 条
              </span>
            </div>
          </Transition>

          <div ref="listRef" class="mc__msgs u-scroll-y">
            <button v-if="hasMore && !searchingThread" class="mc__more u-tap" @click="loadMore">
              查看更早消息
            </button>
            <p v-if="threadLoading" class="mc__hint">消息加载中…</p>
            <p v-else-if="searchingThread && !visibleMessages.length" class="mc__hint">
              当前已加载的消息里没有匹配「{{ msgKeyword.trim() }}」的内容，可先「查看更早消息」再搜
            </p>
            <TransitionGroup name="mc-msg" tag="div" class="mc__rows">
              <div
                v-for="m in visibleMessages"
                :key="m.id"
                class="mc__row"
                :class="{ 'mc__row--mine': isMine(m) }"
              >
                <div class="mc__bubble" :class="{ 'mc__bubble--img': m.kind === 'image' }">
                  <p v-if="!isMine(m)" class="mc__sender">
                    {{ m.senderName }}
                    <small>{{ ROLE_LABEL[m.senderRole] ?? m.senderRole }}</small>
                  </p>
                  <img
                    v-if="m.kind === 'image'"
                    class="mc__img u-tap"
                    :src="m.content"
                    alt="图片消息"
                    loading="lazy"
                    @click="openPreview(m.content)"
                  />
                  <p v-else class="mc__text">
                    <template v-for="(seg, i) in segments(m.content)" :key="i">
                      <mark v-if="seg.hit" class="mc__mark">{{ seg.text }}</mark>
                      <template v-else>{{ seg.text }}</template>
                    </template>
                  </p>
                  <p class="mc__time">{{ fmtTime(m.createdAt) }}</p>
                </div>
              </div>
            </TransitionGroup>
          </div>

          <div class="mc__compose">
            <input
              ref="fileRef"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="mc__file"
              tabindex="-1"
              aria-hidden="true"
              @change="onImagePicked"
            />
            <button
              type="button"
              class="mc__attach u-tap"
              :class="{ 'mc__attach--busy': uploading }"
              :disabled="uploading"
              :aria-label="uploading ? '图片上传中' : '发送图片'"
              @click="pickImage"
            >
              <AppIcon name="image" :size="18" />
            </button>
            <textarea
              v-model="draft"
              class="mc__input"
              rows="1"
              maxlength="2000"
              placeholder="输入消息，回车发送"
              aria-label="消息输入框"
              @keydown.enter.exact.prevent="send"
            />
            <button
              class="mc__send u-tap"
              :disabled="!draft.trim() || sending"
              aria-label="发送"
              @click="send"
            >
              <AppIcon name="send" :size="18" />
            </button>
          </div>
        </template>
        <EmptyState
          v-else
          icon="message"
          :title="mode === 'mobile' ? '选择一个会话' : '选择左侧会话查看消息'"
          desc="与经理 / 店主 / 总部保持实时沟通"
        />
      </section>
    </div>

    <!-- ══ 通知中心：天气 + 待办任务（逾期预警）+ 系统动态 + 公告 ══ -->
    <div v-else class="mc__notify u-scroll-y">
      <p v-if="feedLoading && !feed" class="mc__hint">通知加载中…</p>

      <div v-else class="mc__notify-body mot-stagger">
        <!-- 汇总条：三块口径与后端 counts 同源，避免与页签角标打架 -->
        <div class="mc__summary">
          <span class="mc__summary-item">
            <AppIcon name="bell" :size="13" />
            未读公告 <b>{{ feed?.counts.unreadAnnouncements ?? 0 }}</b>
          </span>
          <span
            class="mc__summary-item"
            :class="{ 'mc__summary-item--alert': (feed?.counts.overdueTasks ?? 0) > 0 }"
          >
            <AppIcon name="clock" :size="13" />
            逾期待办 <b>{{ feed?.counts.overdueTasks ?? 0 }}</b>
          </span>
          <span class="mc__summary-item">
            <AppIcon name="message" :size="13" />
            未读会话 <b>{{ feed?.counts.unreadConversations ?? 0 }}</b>
          </span>
        </div>

        <!-- 天气卡（演示基准，与后端 DEMO_TODAY 同源；项目无真实气象接口） -->
        <article class="mc__weather">
          <span class="mc__weather-ico"><AppIcon name="sun" :size="20" /></span>
          <div class="mc__weather-main">
            <p class="mc__weather-date">{{ weather.date }}</p>
            <p class="mc__weather-text">{{ weather.text }}</p>
          </div>
          <p class="mc__weather-tip">{{ weather.tip }}</p>
        </article>

        <!-- ① 待办任务（逾期 / 临期预警，业代可当场回执） -->
        <section v-if="tasks.length" class="mc__sec">
          <h3 class="mc__sec-title">
            待办任务
            <em>
              {{ tasks.length }} 项<span v-if="feed?.counts.overdueTasks">
                · 逾期 {{ feed.counts.overdueTasks }}</span
              ><span v-if="feed?.counts.dueSoonTasks"> · 临期 {{ feed.counts.dueSoonTasks }}</span>
            </em>
          </h3>
          <TransitionGroup name="mc-msg" tag="div" class="mc__tasks">
            <article
              v-for="t in tasks"
              :key="t.id"
              class="mc__task"
              :class="{ 'mc__task--overdue': t.overdue, 'mc__task--soon': t.dueSoon }"
            >
              <header class="mc__task-head">
                <b>{{ t.storeName }}</b>
                <span class="mc__tag">{{ t.taskTypeLabel }}</span>
                <span v-if="t.overdue" class="mc__tag mc__tag--alert">{{ dueText(t) }}</span>
                <span v-else-if="t.dueSoon" class="mc__tag mc__tag--soon">{{ dueText(t) }}</span>
              </header>
              <p v-if="t.note" class="mc__task-note">{{ t.note }}</p>
              <footer class="mc__task-foot">
                <span class="mc__task-due">
                  <AppIcon name="clock" :size="12" />
                  截止 {{ t.dueAtLabel || t.dueAt }}
                </span>
                <button
                  v-if="canCompleteTasks"
                  type="button"
                  class="mc__task-done u-tap"
                  :class="{ 'mot-press-loading': markingId === t.id }"
                  :disabled="!!markingId"
                  @click="markTaskDone(t)"
                >
                  {{ markingId === t.id ? '提交中…' : '标记完成' }}
                </button>
              </footer>
              <p class="mc__task-from">来自 {{ t.creatorName }}</p>
            </article>
          </TransitionGroup>
        </section>
        <EmptyState
          v-else
          :icon="canCompleteTasks ? 'check-circle' : 'clipboard'"
          :title="canCompleteTasks ? '今日待办已清空' : '暂无可跟进的待办'"
          :desc="
            canCompleteTasks
              ? '经理新派的任务会实时出现在这里'
              : '经理下派的任务会在这里汇总，逾期项会置顶提醒'
          "
        />

        <!-- ② 系统动态（由真实巡店 / 整改 / 单据记录派生） -->
        <section v-if="systemEvents.length" class="mc__sec">
          <h3 class="mc__sec-title">系统动态 <em>来自真实巡店 / 整改 / 单据记录</em></h3>
          <article v-for="e in systemEvents" :key="e.id" class="mc__sys">
            <span class="mc__sys-ico" :class="`mc__sys-ico--${e.kind}`">
              <AppIcon :name="sysMeta(e.kind).icon" :size="15" />
            </span>
            <div class="mc__sys-main">
              <p class="mc__sys-title">
                {{ e.title }}
                <span class="mc__tag">{{ sysMeta(e.kind).label }}</span>
              </p>
              <p class="mc__sys-desc">{{ e.desc }}</p>
            </div>
            <span class="mc__sys-time">{{ fmtTime(e.at) }}</span>
          </article>
        </section>

        <!-- ③ 公告（沿用展开标记已读的交互） -->
        <section v-if="announcements.length" class="mc__sec">
          <h3 class="mc__sec-title">公告 <em>管理员发布后实时送达</em></h3>
          <article
            v-for="a in announcements"
            :key="a.id"
            class="mc__notice"
            :class="{ 'mc__notice--unread': !a.read }"
            @click="toggleNotice(a)"
          >
            <header class="mc__notice-head">
              <span v-if="a.pinned" class="mc__pin">置顶</span>
              <b class="mc__notice-title">{{ a.title }}</b>
              <span v-if="!a.read" class="mc__dot" aria-label="未读" />
            </header>
            <p class="mc__notice-meta">
              {{ fmtTime(a.createdAt) }} · 面向
              {{ a.audience === 'all' ? '全部角色' : ROLE_LABEL[a.audience] ?? a.audience }} · 已读
              {{ a.readCount }} 人
            </p>
            <p class="mc__notice-body" :class="{ 'mc__notice-body--clamp': expandedId !== a.id }">
              {{ a.content }}
            </p>
          </article>
        </section>
      </div>
    </div>


    <!-- ══ 会话操作面板（免打扰 / 置顶 / 删除会话） ══ -->
    <Transition name="mc-sheet">
      <div v-if="menuConv" class="mc__sheet-mask" @click.self="closeMenu">
        <div class="mc__sheet" role="dialog" aria-modal="true" :aria-label="`会话操作：${menuConv.title}`">
          <p class="mc__sheet-title">{{ menuConv.title }}</p>
          <button type="button" class="mc__sheet-item u-tap" @click="toggleMute(menuConv)">
            <AppIcon :name="menuConv.muted ? 'bell' : 'bell-off'" :size="17" />
            {{ menuConv.muted ? '取消消息免打扰' : '消息免打扰' }}
          </button>
          <button type="button" class="mc__sheet-item u-tap" @click="togglePin(menuConv)">
            <AppIcon name="map-pin" :size="17" />
            {{ menuConv.pinned ? '取消置顶' : '置顶会话' }}
          </button>
          <button
            type="button"
            class="mc__sheet-item mc__sheet-item--danger u-tap"
            @click="removeConv(menuConv)"
          >
            <AppIcon name="trash" :size="17" />
            删除会话
          </button>
          <button type="button" class="mc__sheet-cancel u-tap" @click="closeMenu">取消</button>
        </div>
      </div>
    </Transition>

    <!-- ══ 图片预览（点气泡内图片查看大图） ══ -->
    <Transition name="mc-zoom">
      <div v-if="previewUrl" class="mc__viewer" @click="closePreview">
        <img :src="previewUrl" alt="图片预览" />
        <button type="button" class="mc__viewer-close u-tap" aria-label="关闭预览">
          <AppIcon name="close" :size="18" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.mc {
  position: relative; /* 操作面板 / 图片预览的绝对定位基准 */
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-page);
}

.mc__tabs {
  display: flex;
  flex: none;
  gap: 6px;
  padding: 8px 12px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
}

.mc__tab {
  position: relative;
  flex: 1;
  height: 34px;
  border: none;
  border-radius: var(--radius-pill, 999px);
  background: var(--bg-page);
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
}

.mc__tab--on {
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
}

.mc__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--red);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

/* 免打扰会话的未读数：弱化为灰底，提示「不打扰、但仍有未读」 */
.mc__badge--muted {
  background: var(--text-4);
}

.mc__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.mc__list {
  display: flex;
  flex-direction: column;
  flex: none;
  width: 100%;
  min-height: 0;
  /* 检索区固定、列表体独立滚动（检索框不随列表滚出视野） */
  overflow: hidden;
  background: var(--bg-card);
}

.mc__list-body {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* ── 会话检索区：搜索框 + 未读筛选胶囊 ── */
.mc__search {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
}

.mc__search-box {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--bg-page);
  color: var(--text-4);
  transition:
    border-color var(--dur-fast, 160ms) var(--ease-standard, ease),
    background var(--dur-fast, 160ms) var(--ease-standard, ease);
}

.mc__search-box:focus-within {
  border-color: var(--mn-green);
  color: var(--mn-green);
  background: var(--bg-card);
}

.mc__search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  background: none;
  color: var(--text-1);
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
}

.mc__search-input::placeholder {
  color: var(--text-4);
}

/* 清空按钮：仅有关键词时出现，点击即清空（省去全选删除的操作成本） */
.mc__search-clear {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: var(--border-color);
  color: var(--text-2);
}

.mc__chip {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 11px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--bg-page);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  transition:
    background var(--dur-fast, 160ms) var(--ease-standard, ease),
    color var(--dur-fast, 160ms) var(--ease-standard, ease),
    border-color var(--dur-fast, 160ms) var(--ease-standard, ease);
}

.mc__chip--on {
  border-color: transparent;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
}

.mc__chip-num {
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

.mc--desktop .mc__list {
  /* 264 → 320：桌面端行内新增了「更多」按钮，列宽留足标题单行所需空间，
     避免「好邻居 · 地铁口店」这类店名被挤成两行（行高随之抖动） */
  width: 320px;
  border-right: 1px solid var(--border-color);
}

/* 桌面端行更紧凑，行内按钮收窄；移动端保持 ≥40px 触控热区（菲茨定律） */
.mc--desktop .mc__conv-pin,
.mc--desktop .mc__conv-more {
  width: 32px;
  height: 32px;
}

.mc__list--hidden,
.mc__thread--hidden {
  display: none;
}

/* 会话行：外层为定位容器，内部「打开」大热区与右侧置顶按钮各自独立可点 */
.mc__conv {
  position: relative;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
}

.mc__conv--on {
  background: var(--mn-green-light);
}

.mc__conv-open {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  border: none;
  background: none;
  text-align: left;
}

/* 置顶标记：置顶行左侧一道克制的品牌色内嵌条（贴合现有卡片风格） */
.mc__conv--pinned .mc__conv-open {
  box-shadow: inset 3px 0 0 0 var(--mn-green);
}

/* 置顶按钮：未置顶为弱色；置顶后转为品牌绿，即行内的「小图钉」标记 */
.mc__conv-pin,
.mc__conv-more {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-right: 4px;
  border: none;
  border-radius: 10px;
  background: none;
  color: var(--text-4);
}

/* 会话操作按钮（免打扰 / 删除）：常驻弱色，hover / focus 时提亮，不喧宾夺主 */
.mc__conv-more {
  margin-right: 8px;
}

.mc__conv-more:hover,
.mc__conv-more:focus-visible,
.mc__conv-pin:hover,
.mc__conv-pin:focus-visible {
  color: var(--text-2);
}

.mc__conv-pin--on {
  color: var(--mn-green);
}

.mc__conv-avatar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  overflow: hidden;
  border-radius: 11px;
  background: var(--grad-brand);
  color: #fff;
}

/* 真实头像：铺满圆角方块；无图时由上方渐变底 + AppIcon 回落（视觉与原来一致） */
.mc__conv-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}

.mc__conv-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.mc__conv-title {
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-1);
  /* 单行标题 + 省略号：会话行高度恒定，列表不因店名长短参差 */
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mc__conv-last {
  overflow: hidden;
  color: var(--text-3);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mc__conv-side {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.mc__conv-meta {
  display: flex;
  align-items: center;
  gap: 3px;
}

/* 免打扰标记：会话名 / 时间旁的一枚小斜杠铃铛（弱色，不抢视觉焦点） */
.mc__conv-mute {
  flex: none;
  color: var(--text-4);
}

.mc__conv-time {
  color: var(--text-4);
  font-size: 10px;
}

.mc__thread {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.mc__thread-head {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
}

/* 聊天面板头部「对方」头像：真实头像铺满；无图时渐变底 + AppIcon 回落 */
.mc__thread-avatar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  overflow: hidden;
  border-radius: 10px;
  background: var(--grad-brand);
  color: #fff;
}

.mc__thread-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}

.mc__back {
  flex: none;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  color: var(--text-2);
  font-size: 22px;
  line-height: 1;
}

.mc__thread-title b {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13.5px;
  color: var(--text-1);
}

.mc__thread-title small {
  display: block;
  color: var(--text-3);
  font-size: 11px;
}

.mc__msgs {
  flex: 1;
  min-height: 0;
  padding: 10px 12px;
  background: var(--bg-page);
}

.mc__more {
  display: block;
  margin: 0 auto 8px;
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-3);
  font-size: 11px;
}

.mc__row {
  display: flex;
  margin-bottom: 9px;
}

.mc__row--mine {
  justify-content: flex-end;
}

.mc__bubble {
  max-width: 78%;
  padding: 7px 10px;
  border-radius: 12px;
  background: var(--bg-card);
  box-shadow: var(--sh-1);
}

.mc__row--mine .mc__bubble {
  background: var(--mn-green-light);
}

.mc__sender {
  margin-bottom: 2px;
  color: var(--text-3);
  font-size: 10.5px;
}

.mc__sender small {
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--bg-page);
  font-size: 9px;
}

.mc__text {
  color: var(--text-1);
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: break-word;
  word-break: break-word;
}

.mc__time {
  margin-top: 3px;
  color: var(--text-4);
  font-size: 9.5px;
  text-align: right;
}

.mc__compose {
  display: flex;
  flex: none;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
}

.mc__input {
  flex: 1;
  min-height: 34px;
  max-height: 92px;
  padding: 8px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--bg-page);
  color: var(--text-1);
  font-family: inherit;
  font-size: 13px;
  resize: none;
}

.mc__input:focus-visible {
  border-color: var(--mn-green);
  outline: 2px solid var(--brand);
}

.mc__send {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 12px;
  background: var(--grad-brand);
  color: #fff;
}

.mc__send:disabled {
  opacity: 0.45;
}

/* ════════════════════════════════════════════════════════════
 * 通知中心（任务待办 + 天气 + 系统动态 + 公告）
 * ════════════════════════════════════════════════════════════ */
.mc__notify {
  flex: 1;
  min-height: 0;
  padding: 12px;
}

.mc__notify-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 8px;
}

/* ── 汇总条：三个计数与后端 counts 同源 ── */
.mc__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mc__summary-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 11.5px;
}

.mc__summary-item b {
  font-variant-numeric: tabular-nums;
  color: var(--text-1);
}

/* 有逾期时整条转为告警色（色彩心理学：红=需要立刻处理） */
.mc__summary-item--alert {
  background: var(--risk-bg, rgba(230, 0, 18, 0.1));
  color: var(--red);
}

.mc__summary-item--alert b {
  color: var(--red);
}

/* ── 天气卡 ── */
.mc__weather {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 4px 10px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card, 14px);
  background: var(--bg-card);
}

.mc__weather-ico {
  display: flex;
  grid-row: span 2;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--warning-bg);
  color: var(--warning-fg, #b26a00);
}

.mc__weather-date {
  color: var(--text-3);
  font-size: 11.5px;
}

.mc__weather-text {
  color: var(--text-1);
  font-size: 15px;
  font-weight: 700;
}

.mc__weather-tip {
  grid-column: 1 / -1;
  margin-top: 6px;
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.6;
}

/* ── 分区标题 ── */
.mc__sec {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mc__sec-title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  color: var(--text-1);
  font-size: 13px;
  font-weight: 700;
}

.mc__sec-title em {
  color: var(--text-3);
  font-size: 11px;
  font-style: normal;
  font-weight: 500;
}

/* ── 待办任务卡（逾期 / 临期预警） ── */
.mc__tasks {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mc__task {
  position: relative;
  padding: 11px 12px;
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--border-strong);
  border-radius: var(--radius-card, 14px);
  background: var(--bg-card);
}

/* 逾期：左侧红条 + 浅红底；临期：琥珀条。与汇总条、角标同一套色彩语义 */
.mc__task--overdue {
  border-left-color: var(--red);
  background: var(--risk-bg, rgba(230, 0, 18, 0.06));
}

.mc__task--soon {
  border-left-color: var(--amber, #f0a020);
}

.mc__task-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.mc__task-head b {
  color: var(--text-1);
  font-size: 13.5px;
}

.mc__task-note {
  margin-top: 6px;
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.6;
}

.mc__task-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.mc__task-due {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-3);
  font-size: 11.5px;
}

.mc__task--overdue .mc__task-due {
  color: var(--red);
  font-weight: 600;
}

.mc__task-done {
  margin-left: auto;
  padding: 6px 14px;
  border: none;
  border-radius: 999px;
  background: var(--grad-brand);
  color: #fff;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
}

.mc__task-done:disabled {
  opacity: 0.6;
}

.mc__task-from {
  margin-top: 6px;
  color: var(--text-4);
  font-size: 10.5px;
}

/* ── 小标签（任务类型 / 逾期时长 / 动态分类） ── */
.mc__tag {
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--bg-page);
  color: var(--text-3);
  font-size: 10px;
  font-weight: 600;
}

.mc__tag--alert {
  background: var(--red);
  color: #fff;
}

.mc__tag--soon {
  background: var(--warning-bg);
  color: var(--warning-fg, #b26a00);
}

/* ── 系统动态行 ── */
.mc__sys {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card, 14px);
  background: var(--bg-card);
}

.mc__sys-ico {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
}

.mc__sys-ico--rectification {
  background: var(--info-bg, rgba(58, 120, 200, 0.12));
  color: var(--info-fg, #2a6bb5);
}

.mc__sys-ico--ticket {
  background: var(--warning-bg);
  color: var(--warning-fg, #b26a00);
}

.mc__sys-main {
  flex: 1;
  min-width: 0;
}

.mc__sys-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  color: var(--text-1);
  font-size: 12.5px;
  font-weight: 600;
}

.mc__sys-desc {
  margin-top: 3px;
  color: var(--text-2);
  font-size: 11.5px;
  line-height: 1.55;
}

.mc__sys-time {
  flex: none;
  color: var(--text-4);
  font-size: 10px;
}

/* 分区之间的公告卡不再叠加坡度间距（父级 gap 已负责） */
.mc__sec .mc__notice {
  margin-bottom: 0;
}

.mc__notice {
  margin-bottom: 10px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card, 14px);
  background: var(--bg-card);
  cursor: pointer;
}

.mc__notice--unread {
  border-left: 3px solid var(--mn-green);
}

.mc__notice-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mc__pin {
  flex: none;
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--warning-bg);
  color: var(--warning-fg);
  font-size: 9.5px;
  font-weight: 700;
}

.mc__notice-title {
  flex: 1;
  color: var(--text-1);
  font-size: 13.5px;
}

.mc__dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--red);
}

.mc__notice-meta {
  margin: 5px 0 6px;
  color: var(--text-3);
  font-size: 11px;
}

.mc__notice-body {
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.65;
}

.mc__notice-body--clamp {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.mc__hint {
  padding: 18px;
  color: var(--text-3);
  font-size: 12px;
  text-align: center;
}

@media (min-width: 900px) {
  .mc--desktop .mc__msgs {
    padding: 14px 18px;
  }
}

/* ════════════════════════════════════════════════════════════
 * 本轮新增交互动效：会话搜索 / 图片消息 / 操作面板 / 图片预览
 * 统一只动 transform 与 opacity；时长、缓动取自 styles/motion.css
 * 的 --dur-* / --ease-*（全局 :root，始终启用，不做 reduced-motion 降级）
 * ════════════════════════════════════════════════════════════ */

/* ── 会话内搜索：头部开关 + 展开条 ── */
.mc__thread-search {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin-left: auto;
  border: none;
  border-radius: 9px;
  background: none;
  color: var(--text-3);
  transition: background var(--dur-fast) var(--ease-standard);
}

.mc__thread-search:hover {
  background: var(--bg-page);
}

.mc__thread-search--on {
  background: var(--mn-green-light);
  color: var(--mn-green);
}

.mc__thread-searchbar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  background: var(--bg-page);
  border-bottom: 1px solid var(--border-color);
  color: var(--text-4);
}

.mc__thread-searchinput {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-1);
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
}

.mc__thread-searchinput:focus-visible {
  border-color: var(--mn-green);
}

.mc__thread-searchhint {
  flex: none;
  color: var(--text-3);
  font-size: 11px;
}

/* 搜索条展开 / 收起：淡入 + 轻微下滑（不做高度动画，避免消息区抖动） */
.mc-slide-enter-active,
.mc-slide-leave-active {
  transition:
    opacity var(--dur-fast) var(--ease-standard),
    transform var(--dur-fast) var(--ease-standard);
}

.mc-slide-enter-from,
.mc-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ── 消息出现动效：新气泡淡入上移；离场仅淡出，避免列表位移 ── */
.mc-msg-enter-active {
  transition:
    opacity var(--dur-base) var(--ease-decel),
    transform var(--dur-base) var(--ease-decel);
}

.mc-msg-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

.mc-msg-leave-active {
  transition: opacity var(--dur-fast) var(--ease-standard);
}

.mc-msg-leave-to {
  opacity: 0;
}

/* ── 图片消息气泡 / 关键词高亮 ── */
.mc__bubble--img {
  padding: 5px 5px 4px;
}

.mc__img {
  display: block;
  width: 168px;
  max-width: 100%;
  max-height: 220px;
  border-radius: 9px;
  object-fit: cover;
  background: var(--bg-page);
  cursor: zoom-in;
}

.mc__mark {
  padding: 0 2px;
  border-radius: 3px;
  background: var(--warning-bg);
  color: inherit;
}

/* ── 输入区图片按钮（触控热区 ≥36px，与发送键同尺寸对齐） ── */
.mc__file {
  display: none;
}

.mc__attach {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  background: var(--bg-page);
  color: var(--text-2);
  transition:
    color var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard);
}

.mc__attach:hover:not(:disabled) {
  border-color: var(--mn-green);
  color: var(--mn-green);
}

/* 上传中：按钮整体降透明度 + 呼吸，明确「正在忙，别重复点」 */
.mc__attach--busy {
  opacity: 0.6;
  animation: mc-attach-pulse 1s var(--ease-standard) infinite;
}

@keyframes mc-attach-pulse {
  50% {
    transform: scale(0.94);
  }
}

/* ── 会话操作面板（底部动作面板，移动 / 桌面通用） ── */
.mc__sheet-mask {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;
  background: rgba(16, 24, 20, 0.42);
}

.mc__sheet {
  width: 100%;
  max-width: 380px;
  padding: 8px;
  border-radius: 18px;
  background: var(--bg-card);
  box-shadow: var(--sh-3);
}

.mc__sheet-title {
  padding: 8px 12px 10px;
  color: var(--text-3);
  font-size: 12px;
  text-align: center;
}

.mc__sheet-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: none;
  border-radius: 12px;
  background: none;
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
  text-align: left;
  transition: background var(--dur-fast) var(--ease-standard);
}

.mc__sheet-item:hover {
  background: var(--bg-page);
}

.mc__sheet-item--danger {
  color: var(--red);
}

.mc__sheet-cancel {
  width: 100%;
  margin-top: 4px;
  padding: 12px;
  border: none;
  border-top: 1px solid var(--border-color);
  background: none;
  color: var(--text-3);
  font-family: inherit;
  font-size: 14px;
}

/* 面板：遮罩淡入 + 面板自底部滑入 */
.mc-sheet-enter-active,
.mc-sheet-leave-active {
  transition: opacity var(--dur-base) var(--ease-standard);
}

.mc-sheet-enter-active .mc__sheet,
.mc-sheet-leave-active .mc__sheet {
  transition: transform var(--dur-base) var(--ease-decel);
}

.mc-sheet-enter-from,
.mc-sheet-leave-to {
  opacity: 0;
}

.mc-sheet-enter-from .mc__sheet,
.mc-sheet-leave-to .mc__sheet {
  transform: translateY(18px);
}

/* ── 图片预览：遮罩淡入 + 图片由 0.94 轻微放大归位 ── */
.mc__viewer {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 22px;
  background: rgba(12, 18, 15, 0.78);
  cursor: zoom-out;
}

.mc__viewer img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 12px;
  object-fit: contain;
}

.mc__viewer-close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.mc-zoom-enter-active,
.mc-zoom-leave-active {
  transition: opacity var(--dur-base) var(--ease-standard);
}

.mc-zoom-enter-active img {
  transition: transform var(--dur-base) var(--ease-decel);
}

.mc-zoom-enter-from,
.mc-zoom-leave-to {
  opacity: 0;
}

.mc-zoom-enter-from img {
  transform: scale(0.94);
}
</style>
