<script setup lang="ts">
/**
 * 懂行知识库（店主端 /owner/knowledge）。
 *
 * 数据：
 *  - GET /knowledge/categories  分类去重列表 → 顶部 chips；
 *  - GET /knowledge/list        active 条目分页（?category=）→ 口语化问答折叠列表；
 *  - POST /knowledge/ask        SSE 真流式问答（role=owner），逐字渲染。
 * 来源如实标注：source==='llm' 才写「AI 生成」，否则「标准答案库」。
 * 全部失败走 try/catch + Toast / 空态，绝不白屏。绝不自造条目。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import MobileLayout from '@/components/layout/MobileLayout.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MilkDropLoader from '@/components/common/MilkDropLoader.vue'
import { useToast } from '@/composables/useToast'
import {
  listKnowledge,
  getKnowledgeCategories,
  streamKnowledgeAsk,
  type KnowledgeItem,
} from '@/api/owner'
import type { SseResult } from '@/api/owner'

const router = useRouter()
const toast = useToast()

const PAGE_SIZE = 10

/* ═══════════════ ① 分类 + 列表 ═══════════════ */

const categories = ref<string[]>([])
const activeCategory = ref<string>('')

const items = ref<KnowledgeItem[]>([])
const total = ref<number>(0)
const page = ref<number>(1)
const loading = ref<boolean>(true)
const loadingMore = ref<boolean>(false)
const loadError = ref<string>('')

const expanded = ref<Record<string, boolean>>({})

const hasMore = computed<boolean>(() => items.value.length < total.value)

function toggle(id: string): void {
  expanded.value[id] = !expanded.value[id]
}

/** 拉分类（失败静默：不影响列表主流程） */
async function loadCategories(): Promise<void> {
  try {
    categories.value = await getKnowledgeCategories()
  } catch {
    categories.value = []
  }
}

/** 拉第一页（切换分类时调用） */
async function reload(): Promise<void> {
  loading.value = true
  loadError.value = ''
  page.value = 1
  try {
    const res = await listKnowledge({
      page: 1,
      pageSize: PAGE_SIZE,
      category: activeCategory.value || undefined,
    })
    items.value = res.items ?? []
    total.value = res.total ?? 0
  } catch (e) {
    loadError.value = (e as Error)?.message || '知识条目没拉到，请稍后重试'
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

/** 加载更多 */
async function loadMore(): Promise<void> {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    const next = page.value + 1
    const res = await listKnowledge({
      page: next,
      pageSize: PAGE_SIZE,
      category: activeCategory.value || undefined,
    })
    items.value = items.value.concat(res.items ?? [])
    total.value = res.total ?? total.value
    page.value = next
  } catch (e) {
    toast.error((e as Error)?.message || '加载更多失败，请稍后重试')
  } finally {
    loadingMore.value = false
  }
}

function pickCategory(cat: string): void {
  if (activeCategory.value === cat) return
  activeCategory.value = cat
  void reload()
}

/* ═══════════════ ② 问一问（SSE 流式） ═══════════════ */

/** 店主高频问题（点了直接问） */
const PRESETS: string[] = [
  '冰柜温度多少算达标',
  '临期产品怎么处理',
  '牛奶怎么陈列更好卖',
  '缺货了怎么补最快',
]

const askQuestion = ref<string>('')
const askText = ref<string>('')
const asking = ref<boolean>(false)
const askSource = ref<SseResult['source']>(null)
let askCtrl: AbortController | null = null

/** 完成后的来源标注：只有真大模型才写「AI 生成」 */
const askBadge = computed<string>(() => (askSource.value === 'llm' ? 'AI 生成' : '标准答案库'))
const showAnswer = computed<boolean>(() => asking.value || askText.value.length > 0)

async function ask(preset?: string): Promise<void> {
  if (asking.value) return
  const q = (preset ?? askQuestion.value).trim()
  if (!q) {
    toast.info('先写下你的问题，再点发送')
    return
  }
  askQuestion.value = q
  askText.value = ''
  askSource.value = null
  asking.value = true
  askCtrl = new AbortController()
  try {
    const res = await streamKnowledgeAsk(
      q,
      (delta) => {
        askText.value += delta
      },
      { role: 'owner', signal: askCtrl.signal },
    )
    if (!res.ok) {
      toast.error('回答没生成出来，请稍后再试')
      return
    }
    askSource.value = res.source
  } catch (e) {
    toast.error((e as Error)?.message || '回答问题出了点问题，请稍后再试')
  } finally {
    asking.value = false
    askCtrl = null
  }
}

function clearAnswer(): void {
  if (askCtrl) askCtrl.abort()
  askText.value = ''
  askSource.value = null
}

onMounted(() => {
  void loadCategories()
  void reload()
})

onBeforeUnmount(() => {
  askCtrl?.abort()
})
</script>

<template>
  <MobileLayout
    title="懂行知识库"
    :back="true"
    :show-tab-bar="false"
    :content-padding-bottom="16"
    @back="router.push('/owner')"
  >
    <div class="kb mot-rise">
      <!-- 分类 chips -->
      <div class="kb__cats u-scroll-x mot-stagger">
        <button
          type="button"
          class="kb__cat u-tap mot-tap"
          :class="{ 'kb__cat--on': activeCategory === '' }"
          @click="pickCategory('')"
        >
          全部
        </button>
        <button
          v-for="c in categories"
          :key="c"
          type="button"
          class="kb__cat u-tap mot-tap"
          :class="{ 'kb__cat--on': activeCategory === c }"
          @click="pickCategory(c)"
        >
          {{ c }}
        </button>
      </div>

      <!-- 回答卡（流式中 / 已生成） -->
      <section v-if="showAnswer" class="u-card kb__ans u-animate-in">
        <div class="kb__ans-head">
          <span class="kb__ans-title">
            <AppIcon name="sparkles" :size="15" color="var(--ai-purple)" />
            {{ asking ? '正在回答' : askBadge }}
          </span>
          <button type="button" class="kb__ans-close u-tap mot-tap" aria-label="关闭回答" @click="clearAnswer">
            <AppIcon name="close" :size="15" />
          </button>
        </div>
        <div v-if="asking && !askText" class="kb__ans-loading">
          <MilkDropLoader size="card" label="" />
        </div>
        <p v-else class="kb__ans-body">
          {{ askText }}<span v-if="asking" class="kb__caret">▌</span>
        </p>
        <p v-if="askText && !asking" class="kb__ans-src">来源：{{ askBadge }}</p>
      </section>

      <!-- 列表 -->
      <div v-if="loading" class="kb__loading">
        <MilkDropLoader size="card" label="正在加载知识库" />
      </div>

      <EmptyState
        v-else-if="loadError"
        icon="warning"
        title="知识库没拉到"
        :desc="loadError"
        action-text="重新加载"
        @action="reload"
      />

      <EmptyState
        v-else-if="!items.length"
        icon="clipboard"
        title="这里还没有内容"
        desc="换个分类看看，或直接在下方向「店小C」提问。"
      />

      <template v-else>
        <section
          v-for="(it, i) in items"
          :key="it.id"
          class="u-card kb__item mot-fade-up"
          :style="{ animationDelay: `${Math.min(i, 6) * 60}ms` }"
        >
          <button type="button" class="kb__q u-tap mot-tap" @click="toggle(it.id)">
            <span class="kb__q-main">
              <span v-if="it.category" class="kb__q-cat">{{ it.category }}</span>
              <span class="kb__q-text">{{ it.question }}</span>
            </span>
            <span class="kb__q-arrow">{{ expanded[it.id] ? '▴' : '▾' }}</span>
          </button>
          <p v-if="expanded[it.id]" class="kb__a u-animate-in">{{ it.answer }}</p>
        </section>

        <div v-if="hasMore" class="kb__more">
          <button
            type="button"
            class="u-btn u-btn--ghost kb__more-btn"
            :class="{ 'mot-press-loading': loadingMore }"
            :disabled="loadingMore"
            @click="loadMore"
          >
            {{ loadingMore ? '加载中…' : `加载更多（还有 ${total - items.length} 条）` }}
          </button>
        </div>
      </template>
    </div>

    <!-- 底部固定「问一问」 -->
    <template #footer>
      <div class="kb-ask">
        <div class="kb-ask__presets u-scroll-x mot-stagger">
          <button
            v-for="p in PRESETS"
            :key="p"
            type="button"
            class="kb-ask__preset u-tap mot-tap"
            :disabled="asking"
            @click="ask(p)"
          >
            {{ p }}
          </button>
        </div>
        <div class="kb-ask__bar">
          <input
            v-model="askQuestion"
            class="kb-ask__input"
            type="text"
            placeholder="问点什么，比如「冰柜温度多少算达标」"
            :disabled="asking"
            @keyup.enter="ask()"
          />
          <button
            type="button"
            class="u-btn u-btn--ai kb-ask__send"
            :disabled="asking || !askQuestion.trim()"
            @click="ask()"
          >
            <AppIcon name="send" :size="15" color="var(--milk)" />
          </button>
        </div>
      </div>
    </template>
  </MobileLayout>
</template>

<style scoped>
.kb {
  padding: 12px 16px 20px;
}

/* ── 分类 chips ── */
.u-scroll-x {
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}

.u-scroll-x::-webkit-scrollbar {
  height: 0;
}

.kb__cats {
  display: flex;
  gap: 8px;
  padding-bottom: 10px;
  margin: 0 -16px 4px;
  padding-left: 16px;
  padding-right: 16px;
}

.kb__cat {
  flex: none;
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}

.kb__cat--on {
  border-color: transparent;
  background: var(--brand-deep);
  color: var(--milk);
}

/* ── 回答卡 ── */
.kb__ans {
  padding: 12px 14px;
  margin-bottom: 12px;
  border: 1px solid var(--border-color);
}

.kb__ans-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.kb__ans-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-1);
}

.kb__ans-close {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  color: var(--text-3);
}

.kb__ans-loading {
  padding: 14px 0 4px;
}

.kb__ans-body {
  margin-top: 8px;
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--text-1);
  white-space: pre-wrap;
  word-break: break-word;
}

.kb__caret {
  color: var(--ai-purple);
}

.kb__ans-src {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--text-3);
}

/* ── 列表 ── */
.kb__loading {
  padding: 50px 0;
}

.kb__item {
  padding: 12px 14px;
  margin-bottom: 10px;
}

.kb__q {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
}

.kb__q-main {
  min-width: 0;
}

.kb__q-cat {
  display: inline-block;
  margin-bottom: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-size: 10.5px;
  font-weight: 600;
}

.kb__q-text {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
  line-height: 1.5;
}

.kb__q-arrow {
  flex: none;
  color: var(--text-3);
  font-size: 13px;
  padding-top: 2px;
}

.kb__a {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-color);
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-2);
  white-space: pre-wrap;
  word-break: break-word;
}

.kb__more {
  margin: 4px 0 8px;
}

.kb__more-btn {
  width: 100%;
}

/* ── 底部问一问 ── */
.kb-ask {
  padding: 8px 16px calc(10px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border-color);
  background: var(--bg-card);
}

.kb-ask__presets {
  display: flex;
  gap: 8px;
  padding-bottom: 8px;
}

.kb-ask__preset {
  flex: none;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-page);
  color: var(--text-2);
  font-size: 12px;
  white-space: nowrap;
}

.kb-ask__preset:disabled {
  opacity: 0.5;
}

.kb-ask__bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kb-ask__input {
  flex: 1;
  height: 42px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 21px;
  background: var(--bg-page);
  color: var(--text-1);
  font-size: 13.5px;
  outline: none;
}

.kb-ask__input::placeholder {
  color: var(--text-4);
}

.kb-ask__input:focus {
  border-color: var(--brand);
}

.kb-ask__send {
  flex: none;
  width: 42px;
  height: 42px;
  padding: 0;
  border-radius: 50%;
}
</style>
