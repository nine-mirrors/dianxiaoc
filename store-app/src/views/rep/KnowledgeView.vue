<script setup lang="ts">
/**
 * 业代端 · 知识库（/rep/knowledge）。
 *
 * 两块能力：
 *  ① AI 知识助手 —— streamKnowledgeAsk() 真流式问答；来源由后端 done 帧给出，
 *     如实标注「AI 生成」或「基于陈列标准库生成」，绝不谎称大模型。
 *  ② 标准知识条目 —— getKnowledgeList()（分类 / 关键词）+ getKnowledgeCategories()，
 *     点击展开标准答复，可一键复制。
 *
 * 数据只走 @/api/ops；HTTP 失败一律 try/catch + Toast，绝不白屏。
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import AiBadge from '@/components/common/AiBadge.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MilkDropLoader from '@/components/common/MilkDropLoader.vue'
import { useToast } from '@/composables/useToast'
import { useHaptics } from '@/composables/useHaptics'
import { useSessionStore } from '@/stores/session'
import { aiBadgeOf, type AiSource } from '@/domain/constants'
import { formatShortTime } from '@/utils/format'
import {
  getKnowledgeList,
  getKnowledgeCategories,
  streamKnowledgeAsk,
  type KnowledgeItem,
} from '@/api/ops'

const router = useRouter()
const toast = useToast()
const haptics = useHaptics()
const session = useSessionStore()

/** 返回上一页（本页由「我的」进入，回退栈存在则回退） */
function goBack(): void {
  if (window.history.length > 1) router.back()
  else router.push('/rep/me')
}

/* ═══════════════ ① AI 知识助手 ═══════════════ */

/** 快捷提问（终端执行高频问题，降低希克定律下的输入成本） */
const QUICK_QUESTIONS = [
  '黄金陈列位怎么摆？',
  '冰柜温度要求是多少？',
  '临期产品怎么处理？',
  '排面缺货怎么补？',
]

const question = ref<string>('')
const answer = ref<string>('')
const asking = ref<boolean>(false)
/** 后端 done 帧给出的来源；undefined=未生成 */
const askSource = ref<AiSource | null | undefined>(undefined)
/** AI 失败且无内容时的兜底提示 */
const askFailed = ref<boolean>(false)
/** 与本次提问命中的知识库标准条目 */
const related = ref<KnowledgeItem[]>([])
/** 用于组件卸载时中断流式读取 */
let askController: AbortController | null = null

/** AI 应答来源角标（仅生成完成后展示，流式中不显示，避免「未完成」误导） */
const askBadge = computed(() => aiBadgeOf(askSource.value))

/**
 * 提问 AI：真流式渲染 + 命中标准条目对照。
 * 失败时给可重试提示，不弹浏览器原生错误。
 */
async function askAi(): Promise<void> {
  const q = question.value.trim()
  if (!q || asking.value) return
  asking.value = true
  answer.value = ''
  askFailed.value = false
  askSource.value = undefined
  related.value = []
  haptics.select()

  // 并行拉取命中的标准条目（失败静默，不影响问答）
  void getKnowledgeList({ q, page: 1, pageSize: 3 })
    .then((res) => {
      related.value = res.items ?? []
    })
    .catch(() => {
      related.value = []
    })

  askController?.abort()
  askController = new AbortController()
  try {
    const res = await streamKnowledgeAsk(
      q,
      (delta) => {
        answer.value += delta
      },
      askController.signal,
      session.role,
    )
    askSource.value = res.source
    if (!res.ok && !answer.value) {
      askFailed.value = true
      toast.error('AI 应答暂时不可用，请稍后重试')
    }
  } catch {
    askFailed.value = true
    toast.error('AI 应答暂时不可用，请稍后重试')
  } finally {
    asking.value = false
  }
}

/** 快捷提问：填入并直接发起 */
function askQuick(q: string): void {
  question.value = q
  void askAi()
}

/** 中断当前生成并清空回答区 */
function resetAsk(): void {
  askController?.abort()
  asking.value = false
  answer.value = ''
  askSource.value = undefined
  askFailed.value = false
  related.value = []
}

/** 复制文本：优先剪贴板 API，失败降级长按复制 */
async function copyText(text: string, tip: string): Promise<void> {
  const value = text.trim()
  if (!value) return
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      toast.success(tip)
      haptics.success()
      return
    }
    throw new Error('clipboard-api-unavailable')
  } catch {
    window.prompt('自动复制未成功，请长按全选下方内容手动复制：', value)
    toast.info('请在弹窗中长按选择并复制')
  }
}

/* ═══════════════ ② 标准知识条目 ═══════════════ */

const keyword = ref<string>('')
const category = ref<string>('')
const categories = ref<string[]>([])

const items = ref<KnowledgeItem[]>([])
const total = ref<number>(0)
const loading = ref<boolean>(true)
/** 当前展开的条目 id */
const expandedId = ref<string>('')

/** 拉取分类（失败保留空列表，不打断主流程） */
async function loadCategories(): Promise<void> {
  try {
    const res = await getKnowledgeCategories()
    categories.value = res.categories ?? []
  } catch {
    categories.value = []
  }
}

/** 拉取知识条目（分类 + 关键词） */
async function loadList(): Promise<void> {
  loading.value = true
  expandedId.value = ''
  try {
    const res = await getKnowledgeList({
      page: 1,
      pageSize: 50,
      category: category.value || undefined,
      q: keyword.value.trim() || undefined,
    })
    items.value = res.items ?? []
    total.value = res.total ?? items.value.length
  } catch {
    items.value = []
    total.value = 0
    toast.error('知识条目加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

/** 切换分类 */
function pickCategory(c: string): void {
  if (category.value === c) return
  category.value = c
  haptics.select()
  void loadList()
}

/** 清除关键词并重查 */
function clearKeyword(): void {
  keyword.value = ''
  void loadList()
}

/** 空态：重置搜索与分类 */
function resetFilters(): void {
  keyword.value = ''
  category.value = ''
  void loadList()
}

/** 展开 / 收起条目 */
function toggleItem(id: string): void {
  expandedId.value = expandedId.value === id ? '' : id
  if (expandedId.value) haptics.select()
}

onMounted(async () => {
  await Promise.all([loadCategories(), loadList()])
})

onBeforeUnmount(() => askController?.abort())
</script>

<template>
  <MobileLayout title="知识库" :back="true" :content-padding-bottom="24" @back="goBack">
    <div class="kb">
      <!-- ══ AI 知识助手 ══ -->
      <div class="u-card kb-ask">
        <div class="kb-ask__head">
          <span class="kb-ask__title">
            <AppIcon name="sparkles" :size="15" color="var(--ai-purple)" />
            AI 知识助手
          </span>
          <span class="kb-ask__hint">陈列标准 · 终端执行</span>
        </div>

        <div class="kb-ask__inputrow">
          <input
            v-model="question"
            class="kb-ask__input"
            type="text"
            placeholder="输入问题，如：黄金陈列位怎么摆？"
            maxlength="200"
            @keyup.enter="askAi"
          />
          <button
            type="button"
            class="kb-ask__send u-tap"
            :disabled="asking || !question.trim()"
            aria-label="提问"
            @click="askAi"
          >
            <MilkDropLoader v-if="asking" size="button" />
            <AppIcon v-else name="send" :size="17" color="#fff" />
          </button>
        </div>

        <div class="kb-ask__quick">
          <button
            v-for="q in QUICK_QUESTIONS"
            :key="q"
            type="button"
            class="kb-quick u-tap"
            :disabled="asking"
            @click="askQuick(q)"
          >
            {{ q }}
          </button>
        </div>

        <!-- 应答区 -->
        <div v-if="asking || answer || askFailed" class="kb-ans">
          <div class="kb-ans__head">
            <AiBadge v-if="!asking && answer && askSource" :text="askBadge.text" :tone="askBadge.tone" />
            <span v-else-if="asking" class="kb-ans__status">正在检索知识库…</span>
            <button
              v-if="answer && !asking"
              type="button"
              class="kb-ans__copy u-tap"
              @click="copyText(answer, '答复已复制')"
            >
              <AppIcon name="clipboard" :size="13" />
              复制
            </button>
            <button v-if="!asking" type="button" class="kb-ans__copy u-tap" @click="resetAsk">
              <AppIcon name="close" :size="13" />
              清空
            </button>
          </div>

          <div v-if="asking && !answer" class="kb-ans__loading">
            <MilkDropLoader size="card" label="" />
          </div>
          <p v-else-if="answer" class="kb-ans__text">{{ answer }}</p>

          <div v-if="askFailed && !answer" class="kb-ans__fail">
            <AppIcon name="warning" :size="14" color="var(--warning-fg)" />
            <span>暂时没能生成答复，请换个说法再问一次</span>
          </div>

          <div v-if="related.length" class="kb-ans__rel">
            <p class="kb-ans__rel-cap">知识库相关标准</p>
            <p v-for="r in related" :key="r.id" class="kb-ans__rel-item">
              <span class="kb-ans__rel-cat">{{ r.category }}</span>
              {{ r.question }}
            </p>
          </div>
        </div>
      </div>

      <!-- ══ 搜索 + 分类 ══ -->
      <div class="kb-search">
        <span class="kb-search__box">
          <AppIcon name="filter" :size="15" color="var(--text-3)" />
          <input
            v-model="keyword"
            class="kb-search__input"
            type="search"
            placeholder="搜索知识条目"
            maxlength="50"
            @keyup.enter="loadList"
          />
          <button
            v-if="keyword"
            type="button"
            class="kb-search__clear u-tap"
            aria-label="清空关键词"
            @click="clearKeyword"
          >
            <AppIcon name="close" :size="14" />
          </button>
        </span>
        <button type="button" class="kb-search__btn u-tap" @click="loadList">搜索</button>
      </div>

      <div class="kb-chips">
        <button
          type="button"
          class="kb-chip u-tap"
          :class="{ 'kb-chip--on': !category }"
          @click="pickCategory('')"
        >
          全部
        </button>
        <button
          v-for="c in categories"
          :key="c"
          type="button"
          class="kb-chip u-tap"
          :class="{ 'kb-chip--on': category === c }"
          @click="pickCategory(c)"
        >
          {{ c }}
        </button>
      </div>

      <!-- ══ 知识条目列表 ══ -->
      <p v-if="!loading && items.length" class="kb-count">共 {{ total }} 条标准</p>

      <template v-if="loading">
        <SkeletonBlock v-for="i in 4" :key="i" height="72px" radius="12px" />
      </template>

      <EmptyState
        v-else-if="!items.length"
        icon="clipboard"
        title="没有匹配的知识条目"
        :desc="keyword ? '换个关键词，或直接问上方 AI 助手' : '换个分类看看'"
        :action-text="keyword || category ? '重置筛选' : ''"
        @action="resetFilters"
      />

      <div v-else class="kb-list">
        <div
          v-for="it in items"
          :key="it.id"
          class="u-card kb-item"
          :class="{ 'kb-item--open': expandedId === it.id }"
        >
          <button type="button" class="kb-item__head u-tap" @click="toggleItem(it.id)">
            <span class="kb-item__cat">{{ it.category }}</span>
            <span class="kb-item__q u-ellipsis-2">{{ it.question }}</span>
            <AppIcon
              name="chevron-down"
              :size="16"
              color="var(--text-3)"
              class="kb-item__arrow"
              :class="{ 'kb-item__arrow--on': expandedId === it.id }"
            />
          </button>

          <div v-if="expandedId === it.id" class="kb-item__body">
            <p class="kb-item__a">{{ it.answer }}</p>
            <div class="kb-item__foot">
              <span class="kb-item__tags">
                <span v-for="t in it.tags" :key="t" class="kb-item__tag">#{{ t }}</span>
              </span>
              <button
                type="button"
                class="kb-item__copy u-tap"
                @click="copyText(it.answer, '标准答复已复制')"
              >
                <AppIcon name="clipboard" :size="13" />
                复制
              </button>
            </div>
          </div>

          <p v-if="expandedId !== it.id" class="kb-item__time">
            <AppIcon name="clock" :size="12" color="var(--text-4)" />
            更新于 {{ formatShortTime(it.updatedAt) }}
          </p>
        </div>
      </div>
    </div>
  </MobileLayout>
</template>

<style scoped>
.kb {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

/* ══ AI 知识助手 ══ */
.kb-ask {
  padding: 12px;
}

.kb-ask__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.kb-ask__title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.kb-ask__hint {
  font-size: 11px;
  color: var(--text-3);
}

.kb-ask__inputrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.kb-ask__input {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-page);
  color: var(--text-1);
  font-family: inherit;
  font-size: 13px;
}

.kb-ask__input::placeholder {
  color: var(--text-4);
}

.kb-ask__send {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--ai-purple) 0%, var(--ai-purple-2) 100%);
  box-shadow: 0 4px 12px rgba(109, 59, 245, 0.24);
}

.kb-ask__send:disabled {
  background: var(--text-4);
  box-shadow: none;
  opacity: 0.85;
}

/* 按钮内奶滴缩到 44px 方钮里：MilkDropLoader button 规格是 58px 圆钮，此处按需缩容器 */
.kb-ask__send :deep(.mdl__btn) {
  width: 28px;
  height: 28px;
  box-shadow: none;
  background: transparent;
}

.kb-ask__send :deep(.mdl__mini) {
  width: 22px;
  height: 22px;
}

.kb-ask__quick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.kb-quick {
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-page);
  color: var(--text-2);
  font-size: 11.5px;
}

.kb-quick:disabled {
  opacity: 0.55;
}

/* 应答区 */
.kb-ans {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-color);
}

.kb-ans__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 22px;
}

.kb-ans__status {
  font-size: 12px;
  color: var(--text-3);
}

.kb-ans__copy {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 11px;
}

.kb-ans__copy + .kb-ans__copy {
  margin-left: 0;
}

.kb-ans__loading {
  padding: 6px 0;
}

.kb-ans__text {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-1);
  white-space: pre-wrap;
}

.kb-ans__fail {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--warning-fg);
}

.kb-ans__rel {
  margin-top: 12px;
  padding: 10px;
  border-radius: 10px;
  background: var(--bg-page);
}

.kb-ans__rel-cap {
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
}

.kb-ans__rel-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-1);
}

.kb-ans__rel-item + .kb-ans__rel-item {
  margin-top: 5px;
}

.kb-ans__rel-cat {
  flex: none;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-size: 10px;
  font-weight: 600;
}

/* ══ 搜索 + 分类 ══ */
.kb-search {
  display: flex;
  gap: 8px;
}

.kb-search__box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.kb-search__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--text-1);
  font-family: inherit;
  font-size: 13px;
  outline: none;
}

.kb-search__clear {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--bg-page);
  color: var(--text-3);
}

.kb-search__btn {
  flex: none;
  min-width: 64px;
  height: 42px;
  padding: 0 14px;
  border: none;
  border-radius: 12px;
  background: var(--mn-green);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.kb-chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  -webkit-overflow-scrolling: touch;
}

.kb-chip {
  flex: none;
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 12px;
  white-space: nowrap;
}

.kb-chip--on {
  border-color: var(--mn-green);
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-weight: 600;
}

.kb-count {
  font-size: 11.5px;
  color: var(--text-3);
}

/* ══ 知识条目 ══ */
.kb-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kb-item {
  padding: 10px 12px;
}

.kb-item--open {
  border-left: 3px solid var(--mn-green);
}

.kb-item__head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  font-family: inherit;
  color: inherit;
  text-align: left;
}

.kb-item__cat {
  flex: none;
  margin-top: 1px;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-size: 10.5px;
  font-weight: 600;
}

.kb-item__q {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--text-1);
}

.kb-item__arrow {
  flex: none;
  margin-top: 2px;
  transition: transform var(--dur-base) var(--ease-standard);
}

.kb-item__arrow--on {
  transform: rotate(180deg);
}

.kb-item__body {
  margin-top: 8px;
}

.kb-item__a {
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--text-2);
  white-space: pre-wrap;
}

.kb-item__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-color);
}

.kb-item__tags {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.kb-item__tag {
  font-size: 11px;
  color: var(--ai-purple);
}

.kb-item__copy {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 9px;
  border: 1px solid var(--mn-green);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--mn-green-dark);
  font-size: 11px;
  font-weight: 600;
}

.kb-item__time {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-3);
}
</style>
