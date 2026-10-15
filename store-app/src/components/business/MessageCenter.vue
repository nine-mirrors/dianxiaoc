<script setup lang="ts">
/**
 * 消息中心（四端共用核心组件）。
 *
 * 组成：① 会话 IM（会话列表 + 消息流 + 输入框）② 公告（管理员发布 → 三端实时收到）
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
  listAnnouncements,
  markAnnouncementRead,
  type AnnouncementItem,
  type ConversationItem,
  type MessageItem,
} from '@/api/messages'

interface Props {
  /** mobile：单列，会话列表 → 点开进入消息流；desktop：双列并排 */
  mode?: 'mobile' | 'desktop'
}
withDefaults(defineProps<Props>(), { mode: 'mobile' })

const session = useSessionStore()
const { success, error: toastError } = useToast()

/** 当前登录账号名（token 首段）——用于判定「我发的」气泡方向 */
const myName = computed<string>(() => String(session.token || '').split('.')[0] || '')

const tab = ref<'chat' | 'notice'>('chat')
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

/* ── 公告 ── */
const announcements = ref<AnnouncementItem[]>([])
const expandedId = ref<string>('')

const activeConv = computed<ConversationItem | null>(
  () => conversations.value.find((c) => c.id === activeId.value) ?? null,
)
const chatUnread = computed<number>(() => conversations.value.reduce((s, c) => s + c.unread, 0))
const noticeUnread = computed<number>(() => announcements.value.filter((a) => !a.read).length)

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
  } catch {
    /* 后端不可用时保持空列表，界面显示空态 */
  }
}

/** 打开会话：拉历史消息 + 标记已读 */
async function openConv(id: string): Promise<void> {
  activeId.value = id
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
    messages.value = [...messages.value, res.message]
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

/** 拉取公告 */
async function loadAnnouncements(): Promise<void> {
  try {
    const res = await listAnnouncements({ pageSize: 50 })
    announcements.value = res.items
  } catch {
    /* 保持空列表 */
  }
}

/** 展开/收起公告；首次展开即标记已读 */
async function toggleNotice(a: AnnouncementItem): Promise<void> {
  expandedId.value = expandedId.value === a.id ? '' : a.id
  if (expandedId.value === a.id && !a.read) {
    try {
      const res = await markAnnouncementRead(a.id)
      a.read = true
      a.readCount = res.readCount
    } catch {
      /* 静默：下次进入再标 */
    }
  }
}

/** 切到公告页时才拉取（减少首屏请求） */
function switchTab(t: 'chat' | 'notice'): void {
  tab.value = t
  if (t === 'notice' && !announcements.value.length) void loadAnnouncements()
}

/* ── 实时订阅 ── */
let offMsg: (() => void) | null = null
let offAnn: (() => void) | null = null

onMounted(async () => {
  loading.value = true
  await loadConversations()
  // 默认打开第一个会话（桌面端体验；手机端也可直接看到内容）
  if (conversations.value.length) {
    await openConv(conversations.value[0].id)
  }
  loading.value = false

  offMsg = onRealtime<{ convId: string; message: MessageItem }>('message:new', (payload) => {
    if (!payload?.message || !payload.convId) return
    const conv = conversations.value.find((c) => c.id === payload.convId)
    if (conv) {
      conv.lastMessage = payload.message
      conv.lastAt = payload.message.createdAt
      // 列表按最新时间置顶
      conversations.value = [...conversations.value].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
    }
    if (payload.convId === activeId.value) {
      // 自己发的消息 HTTP 已回显，去重后再追加
      if (!messages.value.some((m) => m.id === payload.message.id)) {
        messages.value = [...messages.value, payload.message]
        void scrollBottom()
        void markConversationRead(payload.convId)
      }
    } else if (conv && !isMine(payload.message)) {
      conv.unread += 1
    }
  })

  offAnn = onRealtime<{ announcement: AnnouncementItem }>('announcement:new', (payload) => {
    const a = payload?.announcement
    if (!a) return
    if (!announcements.value.some((x) => x.id === a.id)) {
      announcements.value = [{ ...a, read: false, readCount: a.readCount ?? 0 }, ...announcements.value]
    }
    success(`收到新公告：${a.title}`)
  })
})

onBeforeUnmount(() => {
  offMsg?.()
  offAnn?.()
})

/** 手机端打开会话时隐藏列表（返回键回到列表） */
function backToList(): void {
  activeId.value = ''
  messages.value = []
}
</script>

<template>
  <div class="mc" :class="`mc--${mode}`">
    <!-- 顶部页签 -->
    <div class="mc__tabs" role="tablist">
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
      <button
        class="mc__tab"
        :class="{ 'mc__tab--on': tab === 'notice' }"
        role="tab"
        :aria-selected="tab === 'notice'"
        @click="switchTab('notice')"
      >
        公告
        <span v-if="noticeUnread" class="mc__badge">{{ noticeUnread > 99 ? '99+' : noticeUnread }}</span>
      </button>
    </div>

    <!-- ══ 会话 ══ -->
    <div v-if="tab === 'chat'" class="mc__body">
      <!-- 会话列表（桌面常显；手机仅未选中会话时显示） -->
      <aside class="mc__list" :class="{ 'mc__list--hidden': mode === 'mobile' && activeId }">
        <p v-if="loading" class="mc__hint">加载中…</p>
        <EmptyState
          v-else-if="!conversations.length"
          icon="message"
          title="暂无会话"
          desc="暂时没有新消息，去看看公告里有没有新安排"
          action-text="查看公告"
          @action="tab = 'notice'"
        />
        <button
          v-for="c in conversations"
          v-else
          :key="c.id"
          class="mc__conv"
          :class="{ 'mc__conv--on': c.id === activeId }"
          @click="openConv(c.id)"
        >
          <span class="mc__conv-avatar">
            <AppIcon :name="c.kind === 'store' ? 'store' : c.kind === 'org' ? 'bell' : 'user'" :size="17" />
          </span>
          <span class="mc__conv-main">
            <span class="mc__conv-title">{{ c.title }}</span>
            <span class="mc__conv-last">
              {{ c.lastMessage ? `${c.lastMessage.senderName}：${c.lastMessage.content}` : '暂无消息' }}
            </span>
          </span>
          <span class="mc__conv-side">
            <span class="mc__conv-time">{{ c.lastAt ? fmtTime(c.lastAt) : '' }}</span>
            <span v-if="c.unread" class="mc__badge">{{ c.unread > 99 ? '99+' : c.unread }}</span>
          </span>
        </button>
      </aside>

      <!-- 消息流（桌面常显；手机仅选中会话时显示） -->
      <section class="mc__thread" :class="{ 'mc__thread--hidden': mode === 'mobile' && !activeId }">
        <template v-if="activeConv">
          <header class="mc__thread-head">
            <button
              v-if="mode === 'mobile'"
              class="mc__back"
              type="button"
              aria-label="返回会话列表"
              @click="backToList"
            >
              ‹
            </button>
            <div class="mc__thread-title">
              <b>{{ activeConv.title }}</b>
              <small>{{ activeConv.members.map((r) => ROLE_LABEL[r] ?? r).join(' · ') }}</small>
            </div>
          </header>

          <div ref="listRef" class="mc__msgs u-scroll-y">
            <button v-if="hasMore" class="mc__more" @click="loadMore">查看更早消息</button>
            <p v-if="threadLoading" class="mc__hint">消息加载中…</p>
            <div
              v-for="m in messages"
              :key="m.id"
              class="mc__row"
              :class="{ 'mc__row--mine': isMine(m) }"
            >
              <div class="mc__bubble">
                <p v-if="!isMine(m)" class="mc__sender">
                  {{ m.senderName }}
                  <small>{{ ROLE_LABEL[m.senderRole] ?? m.senderRole }}</small>
                </p>
                <p class="mc__text">{{ m.content }}</p>
                <p class="mc__time">{{ fmtTime(m.createdAt) }}</p>
              </div>
            </div>
          </div>

          <div class="mc__compose">
            <textarea
              v-model="draft"
              class="mc__input"
              rows="1"
              maxlength="2000"
              placeholder="输入消息，回车发送"
              aria-label="消息输入框"
              @keydown.enter.exact.prevent="send"
            />
            <button class="mc__send u-tap" :disabled="!draft.trim() || sending" aria-label="发送" @click="send">
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

    <!-- ══ 公告 ══ -->
    <div v-else class="mc__notices u-scroll-y">
      <EmptyState v-if="!announcements.length" icon="bell" title="暂无公告" desc="管理员发布后将在此实时送达" />
      <article
        v-for="a in announcements"
        v-else
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
          {{ fmtTime(a.createdAt) }} · 面向 {{ a.audience === 'all' ? '全部角色' : ROLE_LABEL[a.audience] ?? a.audience }} ·
          已读 {{ a.readCount }} 人
        </p>
        <p class="mc__notice-body" :class="{ 'mc__notice-body--clamp': expandedId !== a.id }">{{ a.content }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.mc {
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
  overflow-y: auto;
  background: var(--bg-card);
}

.mc--desktop .mc__list {
  width: 264px;
  border-right: 1px solid var(--border-color);
}

.mc__list--hidden,
.mc__thread--hidden {
  display: none;
}

.mc__conv {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-bottom: 1px solid var(--border-color);
  background: none;
  text-align: left;
}

.mc__conv--on {
  background: var(--mn-green-light);
}

.mc__conv-avatar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background: var(--grad-brand);
  color: #fff;
}

.mc__conv-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.mc__conv-title {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-1);
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
  display: block;
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

.mc__notices {
  flex: 1;
  min-height: 0;
  padding: 12px;
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
</style>
