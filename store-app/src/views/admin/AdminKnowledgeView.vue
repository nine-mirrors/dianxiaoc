<script setup lang="ts">
/**
 * AdminKnowledgeView —— FAQ 知识库（/admin/knowledge）。
 *
 * 左：分类列表（/knowledge/categories）+ 状态筛选 + 关键词搜索。
 * 右：条目列表（问题 / 答案预览 / 标签 / 状态 / 更新时间）+ 分页。
 * 新增 / 编辑走右侧抽屉表单；删除为软删除（二次确认，文案说明保留审计链）。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AdminShell from './AdminShell.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import { useToast } from '@/composables/useToast'
import {
  createKnowledge,
  deleteKnowledge,
  getAdminKnowledge,
  getKnowledgeCategories,
  updateKnowledge,
  type KnowledgeItem,
  type KnowledgeStatus,
} from '@/api/admin'

const toast = useToast()

const pageSize = 8
const loading = ref(true)
const items = ref<KnowledgeItem[]>([])
const total = ref(0)
const page = ref(1)

const categories = ref<string[]>([])
const activeCategory = ref<string>('')
const statusFilter = ref<KnowledgeStatus | 'all'>('active')
const keyword = ref('')

const STATUS_LABEL: Record<string, string> = { active: '有效', revoked: '已下架' }

const totalPages = computed<number>(() => Math.max(1, Math.ceil(total.value / pageSize)))

/** tags 逗号串 → 数组 */
function tagList(tags: string | null): string[] {
  return tags ? String(tags).split(/[,，]/).map((s) => s.trim()).filter(Boolean) : []
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await getAdminKnowledge({
      page: page.value,
      pageSize,
      status: statusFilter.value,
      q: keyword.value.trim() || undefined,
      category: activeCategory.value || undefined,
    })
    items.value = res.items
    total.value = res.total
  } catch {
    toast.error('知识库加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

async function loadCategories(): Promise<void> {
  try {
    categories.value = await getKnowledgeCategories()
  } catch {
    /* 分类不可用时退化为「全部」，不影响列表 */
  }
}

onMounted(() => {
  void load()
  void loadCategories()
})

watch([statusFilter, activeCategory], () => {
  page.value = 1
  void load()
})

/* 关键词搜索：防抖后请求 */
let kwTimer: number | undefined
watch(keyword, () => {
  if (kwTimer) window.clearTimeout(kwTimer)
  kwTimer = window.setTimeout(() => {
    page.value = 1
    void load()
  }, 320)
})

function pickCategory(cat: string): void {
  activeCategory.value = cat
}

function goPage(p: number): void {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  void load()
}

/* ═══════════════ 新增 / 编辑 抽屉 ═══════════════ */

const showDrawer = ref(false)
const editTarget = ref<KnowledgeItem | null>(null)
const form = reactive({ category: '', question: '', answer: '', tags: '' })
const submitting = ref(false)

function openCreate(): void {
  editTarget.value = null
  Object.assign(form, { category: activeCategory.value || '', question: '', answer: '', tags: '' })
  showDrawer.value = true
}

function openEdit(item: KnowledgeItem): void {
  editTarget.value = item
  Object.assign(form, {
    category: item.category,
    question: item.question,
    answer: item.answer,
    tags: tagList(item.tags).join(','),
  })
  showDrawer.value = true
}

async function submitForm(): Promise<void> {
  if (submitting.value) return
  if (!form.category.trim() || !form.question.trim() || !form.answer.trim()) {
    toast.error('请完整填写分类、问题与答复')
    return
  }
  submitting.value = true
  try {
    const payload = {
      category: form.category.trim(),
      question: form.question.trim(),
      answer: form.answer.trim(),
      tags: form.tags.trim(),
    }
    if (editTarget.value) {
      await updateKnowledge(editTarget.value.id, payload)
      toast.success('知识条目已更新')
    } else {
      await createKnowledge(payload)
      toast.success('知识条目已新增')
    }
    showDrawer.value = false
    await loadCategories()
    await load()
  } catch {
    toast.error(editTarget.value ? '更新失败，请稍后重试' : '新增失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

/* ═══════════════ 软删除（二次确认） ═══════════════ */

const deleteTarget = ref<KnowledgeItem | null>(null)
const deleting = ref(false)

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value || deleting.value) return
  deleting.value = true
  try {
    await deleteKnowledge(deleteTarget.value.id)
    toast.success('已软删除（保留审计链）')
    deleteTarget.value = null
    await load()
  } catch {
    toast.error('删除失败，请稍后重试')
  } finally {
    deleting.value = false
  }
}

/** 已下架条目可重新上架（PUT status=active） */
async function restore(item: KnowledgeItem): Promise<void> {
  try {
    await updateKnowledge(item.id, { status: 'active' })
    toast.success('已重新上架')
    await load()
  } catch {
    toast.error('操作失败，请稍后重试')
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <AdminShell title="FAQ 知识库">
    <template #actions>
      <button type="button" class="u-btn u-btn--primary" @click="openCreate">
        <AppIcon name="plus" :size="16" /> 新增条目
      </button>
    </template>

    <div class="kb">
      <!-- ══ 左：分类 + 筛选 ══ -->
      <aside class="kb__side u-card">
        <h2 class="kb__side-title">知识分类</h2>
        <div class="kb__cats">
          <button type="button" class="kb__cat" :class="{ 'is-active': !activeCategory }" @click="pickCategory('')">
            全部条目
          </button>
          <button
            v-for="c in categories"
            :key="c"
            type="button"
            class="kb__cat"
            :class="{ 'is-active': activeCategory === c }"
            @click="pickCategory(c)"
          >
            {{ c }}
          </button>
        </div>

        <h2 class="kb__side-title kb__side-title--mt">状态</h2>
        <div class="kb__cats">
          <button type="button" class="kb__cat" :class="{ 'is-active': statusFilter === 'active' }" @click="statusFilter = 'active'">有效</button>
          <button type="button" class="kb__cat" :class="{ 'is-active': statusFilter === 'revoked' }" @click="statusFilter = 'revoked'">已下架</button>
          <button type="button" class="kb__cat" :class="{ 'is-active': statusFilter === 'all' }" @click="statusFilter = 'all'">全部</button>
        </div>
      </aside>

      <!-- ══ 右：条目列表 ══ -->
      <section class="kb__main u-card">
        <header class="kb__head">
          <label class="kb__search">
            <AppIcon name="filter" :size="15" />
            <input v-model="keyword" type="search" placeholder="搜索问题 / 答复 / 标签" aria-label="搜索知识条目" />
          </label>
          <span class="kb__count">共 {{ total }} 条</span>
        </header>

        <div v-if="loading" class="kb__loading">
          <SkeletonBlock v-for="i in 4" :key="i" height="78px" radius="12px" />
        </div>

        <template v-else>
          <ul class="kb__list">
            <li v-for="it in items" :key="it.id" class="kb__item" :class="{ 'kb__item--off': it.status === 'revoked' }">
              <div class="kb__item-head">
                <span class="kb__cat-tag">{{ it.category || '未分类' }}</span>
                <span class="kb__status" :class="{ 'kb__status--off': it.status === 'revoked' }">{{ STATUS_LABEL[it.status] }}</span>
                <span class="kb__time">{{ fmtTime(it.updatedAt) }}</span>
              </div>
              <p class="kb__q">{{ it.question }}</p>
              <p class="kb__a u-ellipsis-2">{{ it.answer }}</p>
              <div class="kb__foot">
                <div class="kb__tags">
                  <span v-for="t in tagList(it.tags)" :key="t" class="kb__tag">{{ t }}</span>
                </div>
                <div class="kb__ops">
                  <button type="button" class="kb__op" @click="openEdit(it)">编辑</button>
                  <button v-if="it.status === 'revoked'" type="button" class="kb__op kb__op--ok" @click="restore(it)">重新上架</button>
                  <button v-else type="button" class="kb__op kb__op--danger" @click="deleteTarget = it">软删除</button>
                </div>
              </div>
            </li>
          </ul>
          <EmptyState v-if="!items.length" icon="layers" title="暂无知识条目" desc="点击右上角「新增条目」录入标准答复" />

          <nav class="kb__pager" aria-label="知识条目分页">
            <span class="kb__page-info">第 {{ page }} / {{ totalPages }} 页</span>
            <div class="kb__page-btns">
              <button type="button" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
              <button type="button" :disabled="page >= totalPages" @click="goPage(page + 1)">下一页</button>
            </div>
          </nav>
        </template>
      </section>
    </div>

    <!-- ══ 编辑抽屉 ══ -->
    <div v-if="showDrawer" class="kb__mask" @click.self="showDrawer = false">
      <aside class="kb__drawer" role="dialog" aria-modal="true" :aria-label="editTarget ? '编辑知识条目' : '新增知识条目'">
        <header class="kb__drawer-head">
          <h3>{{ editTarget ? '编辑知识条目' : '新增知识条目' }}</h3>
          <button type="button" class="kb__close u-tap" aria-label="关闭" @click="showDrawer = false">
            <AppIcon name="close" :size="18" />
          </button>
        </header>

        <div class="kb__form">
          <label class="kb__field">
            <span>分类 *</span>
            <input v-model="form.category" list="kb-cats" placeholder="如 陈列标准" />
            <datalist id="kb-cats">
              <option v-for="c in categories" :key="c" :value="c" />
            </datalist>
          </label>
          <label class="kb__field">
            <span>问题 *</span>
            <textarea v-model="form.question" rows="2" placeholder="业务方会怎么提问" />
          </label>
          <label class="kb__field">
            <span>标准答复 *</span>
            <textarea v-model="form.answer" rows="6" placeholder="给出可执行、步骤化的标准答复" />
          </label>
          <label class="kb__field">
            <span>标签</span>
            <input v-model="form.tags" placeholder="逗号分隔，如 陈列,黄金位,排面" />
          </label>
        </div>

        <footer class="kb__drawer-foot">
          <button type="button" class="u-btn u-btn--ghost" @click="showDrawer = false">取消</button>
          <button type="button" class="u-btn u-btn--primary" :disabled="submitting" @click="submitForm">
            {{ submitting ? '提交中…' : editTarget ? '保存修改' : '确认新增' }}
          </button>
        </footer>
      </aside>
    </div>

    <!-- ══ 软删除 二次确认 ══ -->
    <div v-if="deleteTarget" class="kb__mask kb__mask--center" @click.self="deleteTarget = null">
      <div class="kb__confirm u-card" role="dialog" aria-modal="true" aria-label="确认软删除">
        <h3>确认软删除该条目？</h3>
        <p class="kb__confirm-q">{{ deleteTarget.question }}</p>
        <p class="kb__confirm-tip">
          <AppIcon name="info" :size="14" /> 软删除后条目状态置为「已下架」，不再对外命中，但数据保留、审计链完整可追溯，可随时重新上架。
        </p>
        <footer class="kb__confirm-foot">
          <button type="button" class="u-btn u-btn--ghost" @click="deleteTarget = null">取消</button>
          <button type="button" class="u-btn u-btn--primary" :disabled="deleting" @click="confirmDelete">
            {{ deleting ? '处理中…' : '确认软删除' }}
          </button>
        </footer>
      </div>
    </div>
  </AdminShell>
</template>

<style scoped>
.kb {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 14px;
  align-items: start;
}

/* ── 左栏 ── */
.kb__side {
  padding: 16px;
}

.kb__side-title {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-3);
  letter-spacing: 0.5px;
}

.kb__side-title--mt {
  margin-top: 18px;
}

.kb__cats {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 8px;
}

.kb__cat {
  padding: 8px 11px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) ease, color var(--dur-fast) ease;
}

.kb__cat:hover {
  background: var(--bg-page);
  color: var(--text-1);
}

.kb__cat.is-active {
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-weight: 700;
}

/* ── 右栏 ── */
.kb__main {
  padding: 16px 18px;
}

.kb__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.kb__search {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
  max-width: 380px;
  height: 36px;
  padding: 0 11px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--text-3);
}

.kb__search input {
  flex: 1;
  border: none;
  background: none;
  color: var(--text-1);
  font-size: 13.5px;
  outline: none;
}

.kb__count {
  font-size: 12px;
  color: var(--text-3);
}

.kb__loading {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.kb__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.kb__item {
  padding: 13px 15px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  background: var(--bg-card);
}

.kb__item--off {
  opacity: 0.75;
}

.kb__item-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kb__cat-tag {
  padding: 2px 9px;
  border-radius: 6px;
  background: var(--bg-page);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 600;
}

.kb__status {
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-size: 11px;
  font-weight: 700;
}

.kb__status--off {
  background: var(--bg-page);
  color: var(--text-3);
}

.kb__time {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-4);
}

.kb__q {
  margin-top: 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
  line-height: 1.5;
}

.kb__a {
  margin-top: 5px;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text-2);
}

.kb__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
}

.kb__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.kb__tag {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--ai-mist);
  color: var(--ai-purple);
  font-size: 10.5px;
}

.kb__ops {
  display: flex;
  gap: 4px;
  flex: none;
}

.kb__op {
  padding: 5px 10px;
  border: none;
  border-radius: 7px;
  background: none;
  color: var(--brand-deep);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.kb__op:hover {
  background: var(--mn-green-light);
}

.kb__op--ok {
  color: var(--mn-green-dark);
}

.kb__op--danger {
  color: var(--danger-fg);
}

.kb__op--danger:hover {
  background: var(--danger-bg);
}

.kb__pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
}

.kb__page-info {
  font-size: 12px;
  color: var(--text-3);
}

.kb__page-btns {
  display: flex;
  gap: 8px;
}

.kb__page-btns button {
  min-height: 30px;
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
}

.kb__page-btns button:hover:not(:disabled) {
  border-color: var(--brand);
  color: var(--brand-deep);
}

.kb__page-btns button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── 抽屉 ── */
.kb__mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-mask);
  display: flex;
  justify-content: flex-end;
  background: var(--bg-mask);
}

.kb__mask--center {
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.kb__drawer {
  display: flex;
  flex-direction: column;
  width: 480px;
  max-width: 100%;
  height: 100%;
  padding: 20px 22px;
  background: var(--bg-elevated);
  z-index: var(--z-modal);
  box-shadow: var(--sh-3);
  overflow-y: auto;
}

.kb__drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.kb__drawer-head h3 {
  font-size: 16px;
  font-weight: 800;
}

.kb__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: var(--bg-page);
  color: var(--text-2);
  cursor: pointer;
}

.kb__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
}

.kb__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kb__field span {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.kb__field input,
.kb__field textarea {
  padding: 9px 11px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--text-1);
  font-size: 13.5px;
  font-family: inherit;
}

.kb__field textarea {
  resize: vertical;
  line-height: 1.6;
}

.kb__field input:focus,
.kb__field textarea:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--mn-green-light);
}

.kb__drawer-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

/* ── 确认框 ── */
.kb__confirm {
  width: 440px;
  max-width: 100%;
  padding: 22px;
  background: var(--bg-elevated);
  z-index: var(--z-modal);
}

.kb__confirm h3 {
  font-size: 16px;
  font-weight: 800;
}

.kb__confirm-q {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--bg-page);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}

.kb__confirm-tip {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}

.kb__confirm-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

@media (max-width: 1024px) {
  .kb {
    grid-template-columns: 1fr;
  }

  .kb__cats {
    flex-direction: row;
    flex-wrap: wrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .kb__cat {
    transition: none;
  }
}
</style>
