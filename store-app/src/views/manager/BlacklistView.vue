<script setup lang="ts">
/**
 * BlacklistView（/manager/blacklist）—— 门店 / SKU 黑名单管理。
 *
 * 数据：`/admin/blacklist`（挂在 /admin 前缀下，经理账号可访问；接口在 insights.ts 内命名以 admin 前缀区分）。
 * 功能：列表 + 类型/等级/状态三维筛选 + 分页；新增 / 编辑（表单复用同一实例）；
 *       行内启用/停用（toggle）。
 *
 * 数字与状态全部来自后端 ext_blacklist 表，不做本地假数据。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import DesktopHeader from '@/components/layout/DesktopHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import { useToast } from '@/composables/useToast'
import { useSessionStore } from '@/stores/session'
import {
  adminListBlacklist,
  adminCreateBlacklist,
  adminUpdateBlacklist,
  adminToggleBlacklist,
} from '@/api/insights'
import type { BlacklistItem, BlacklistPayload } from '@/api/insights'

const session = useSessionStore()
const { success, info, error: toastError } = useToast()

const PAGE_SIZE = 10

const items = ref<BlacklistItem[]>([])
const total = ref<number>(0)
const page = ref<number>(1)
const loading = ref<boolean>(true)
const loadError = ref<boolean>(false)

const fType = ref<string>('')
const fLevel = ref<string>('')
const fStatus = ref<string>('')

const TYPE_LABEL: Record<string, string> = { store: '门店', sku: 'SKU' }
const LEVEL_LABEL: Record<string, string> = { high: '高', mid: '中', low: '低' }
const STATUS_LABEL: Record<string, string> = { active: '启用中', revoked: '已停用' }

const totalPages = computed<number>(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

/* ── 表单（新增 / 编辑共用） ── */
const editingId = ref<string>('')
const formOpen = ref<boolean>(false)
const submitting = ref<boolean>(false)
const form = reactive<BlacklistPayload>({
  type: 'store',
  targetId: '',
  targetName: '',
  reason: '',
  level: 'mid',
})

function resetForm(): void {
  form.type = 'store'
  form.targetId = ''
  form.targetName = ''
  form.reason = ''
  form.level = 'mid'
}

function openCreate(): void {
  editingId.value = ''
  resetForm()
  formOpen.value = true
}

function openEdit(it: BlacklistItem): void {
  editingId.value = it.id
  form.type = it.type
  form.targetId = it.targetId
  form.targetName = it.targetName
  form.reason = it.reason
  form.level = it.level
  formOpen.value = true
}

function closeForm(): void {
  formOpen.value = false
  editingId.value = ''
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = false
  try {
    const res = await adminListBlacklist({
      page: page.value,
      pageSize: PAGE_SIZE,
      type: fType.value || undefined,
      level: fLevel.value || undefined,
      status: fStatus.value || undefined,
    })
    items.value = res.items ?? []
    total.value = res.total ?? 0
  } catch (e) {
    loadError.value = true
    toastError((e as Error)?.message || '黑名单加载失败')
  } finally {
    loading.value = false
  }
}

async function submit(): Promise<void> {
  if (submitting.value) return
  if (!form.targetId.trim() || !form.targetName.trim() || !form.reason.trim()) {
    toastError('请填写目标编号、目标名称与原因')
    return
  }
  submitting.value = true
  try {
    const payload: BlacklistPayload = {
      type: form.type,
      targetId: form.targetId.trim(),
      targetName: form.targetName.trim(),
      reason: form.reason.trim(),
      level: form.level,
      status: 'active',
    }
    if (editingId.value) {
      await adminUpdateBlacklist(editingId.value, payload)
      success('已更新黑名单条目')
    } else {
      await adminCreateBlacklist(payload)
      success('已新增黑名单条目')
    }
    closeForm()
    await load()
  } catch (e) {
    toastError((e as Error)?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

async function toggle(it: BlacklistItem): Promise<void> {
  try {
    const res = await adminToggleBlacklist(it.id)
    it.status = res.status
    success(res.status === 'active' ? '已启用该条目' : '已停用该条目')
  } catch (e) {
    toastError((e as Error)?.message || '操作失败')
  }
}

function goPage(p: number): void {
  page.value = Math.min(Math.max(1, p), totalPages.value)
}

/** 筛选变化回第 1 页并重新拉取 */
watch([fType, fLevel, fStatus], () => {
  page.value = 1
  void load()
})
watch(page, () => void load())

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="bl">
    <h1 class="u-sr-only">门店 / SKU 黑名单</h1>

    <DesktopHeader
      :region-ids="[]"
      region-id=""
      :user-name="session.user?.name ?? ''"
      :role-label="session.roleLabel"
      @switch-role="() => {}"
      @change-region="() => {}"
    />

    <div class="bl__body">
      <section class="u-card bl__bar">
        <div class="bl__bar-left">
          <AppIcon name="shield" :size="16" color="var(--mn-green)" />
          <h2 class="bl__bar-title">门店 / SKU 黑名单</h2>
          <span class="bl__bar-sub">共 {{ total }} 条 · 用于 AI 与巡检规则避开高风险对象</span>
        </div>
        <button type="button" class="u-btn u-btn--primary" @click="openCreate">
          <AppIcon name="plus" :size="15" /> 新增黑名单
        </button>
      </section>

      <!-- 新增 / 编辑表单 -->
      <section v-if="formOpen" class="u-card bl__form">
        <header class="bl__form-head">
          <h2>{{ editingId ? '编辑黑名单条目' : '新增黑名单条目' }}</h2>
          <button type="button" class="bl__form-close" aria-label="关闭表单" @click="closeForm">
            <AppIcon name="close" :size="16" />
          </button>
        </header>
        <div class="bl__form-grid">
          <label class="bl__field">
            <span>类型</span>
            <select v-model="form.type">
              <option value="store">门店</option>
              <option value="sku">SKU</option>
            </select>
          </label>
          <label class="bl__field">
            <span>{{ form.type === 'store' ? '门店编号' : 'SKU 编号' }}</span>
            <input v-model="form.targetId" type="text" :placeholder="form.type === 'store' ? '如 S12' : '如 SKU_MILK_250'" />
          </label>
          <label class="bl__field">
            <span>{{ form.type === 'store' ? '门店名称' : 'SKU 名称' }}</span>
            <input v-model="form.targetName" type="text" placeholder="用于页面展示的名称" />
          </label>
          <label class="bl__field">
            <span>风险等级</span>
            <select v-model="form.level">
              <option value="high">高</option>
              <option value="mid">中</option>
              <option value="low">低</option>
            </select>
          </label>
          <label class="bl__field bl__field--wide">
            <span>加入原因</span>
            <input v-model="form.reason" type="text" placeholder="如：多次串货、长期不配合陈列" />
          </label>
        </div>
        <footer class="bl__form-actions">
          <button type="button" class="u-btn u-btn--ghost" @click="closeForm">取消</button>
          <button type="button" class="u-btn u-btn--primary" :disabled="submitting" @click="submit">
            {{ submitting ? '保存中…' : '保存' }}
          </button>
        </footer>
      </section>

      <!-- 筛选 -->
      <section class="u-card bl__filters">
        <label class="bl__filter">
          类型：
          <select v-model="fType">
            <option value="">全部</option>
            <option value="store">门店</option>
            <option value="sku">SKU</option>
          </select>
        </label>
        <label class="bl__filter">
          等级：
          <select v-model="fLevel">
            <option value="">全部</option>
            <option value="high">高</option>
            <option value="mid">中</option>
            <option value="low">低</option>
          </select>
        </label>
        <label class="bl__filter">
          状态：
          <select v-model="fStatus">
            <option value="">全部</option>
            <option value="active">启用中</option>
            <option value="revoked">已停用</option>
          </select>
        </label>
        <span class="bl__filter-count">共 {{ total }} 条</span>
      </section>

      <div v-if="loading" class="bl__skeleton">
        <SkeletonBlock height="260px" radius="14px" />
      </div>

      <EmptyState
        v-else-if="loadError || !items.length"
        icon="shield"
        title="当前筛选下没有黑名单记录"
        desc="换个筛选条件看看，或点右上角手动新增管控对象"
        action-text="重新加载"
        @action="load"
      />

      <section v-else class="u-card bl__table-card">
        <div class="bl__table-wrap">
          <table class="bl__table">
            <thead>
              <tr>
                <th>类型</th>
                <th>目标编号</th>
                <th>名称</th>
                <th>等级</th>
                <th>状态</th>
                <th>原因</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="it in items" :key="it.id">
                <td>{{ TYPE_LABEL[it.type] ?? it.type }}</td>
                <td class="bl__mono">{{ it.targetId }}</td>
                <td class="bl__name">{{ it.targetName }}</td>
                <td><span class="bl__tag" :class="`bl__tag--${it.level}`">风险{{ LEVEL_LABEL[it.level] ?? it.level }}</span></td>
                <td>
                  <span class="bl__status" :class="it.status === 'active' ? 'is-on' : 'is-off'">
                    {{ STATUS_LABEL[it.status] ?? it.status }}
                  </span>
                </td>
                <td class="bl__reason" :title="it.reason">{{ it.reason }}</td>
                <td class="bl__time">{{ (it.createdAt || '').slice(0, 10) }}</td>
                <td class="bl__ops">
                  <button type="button" class="bl__op" @click="openEdit(it)">编辑</button>
                  <button type="button" class="bl__op" @click="toggle(it)">
                    {{ it.status === 'active' ? '停用' : '启用' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <nav class="bl__pager" aria-label="黑名单分页">
          <button type="button" class="bl__page-btn" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
          <span class="bl__page-info">第 {{ page }} / {{ totalPages }} 页 · 每页 {{ PAGE_SIZE }} 条</span>
          <button type="button" class="bl__page-btn" :disabled="page >= totalPages" @click="goPage(page + 1)">下一页</button>
        </nav>
      </section>
    </div>
  </div>
</template>

<style scoped>
.bl {
  min-height: 100vh;
  background: var(--bg-page);
}

.bl__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 1760px;
  margin: 0 auto;
  padding: 16px 24px 28px;
}

.bl__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px;
}

.bl__bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.bl__bar-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

.bl__bar-sub {
  font-size: 12px;
  color: var(--text-3);
}

/* 表单 */
.bl__form {
  padding: 14px 16px;
}

.bl__form-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.bl__form-head h2 {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.bl__form-close {
  display: inline-flex;
  padding: 4px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--text-3);
}

.bl__form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.bl__field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  color: var(--text-3);
}

.bl__field--wide {
  grid-column: 1 / -1;
}

.bl__field input,
.bl__field select {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-1);
  font-size: 13px;
}

.bl__field input:focus,
.bl__field select:focus {
  outline: none;
  border-color: var(--mn-green);
  box-shadow: 0 0 0 2px var(--mn-green-light);
}

.bl__form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

/* 筛选 */
.bl__filters {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 12px 16px;
}

.bl__filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-2);
}

.bl__filter select {
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-1);
  font-size: 13px;
}

.bl__filter-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-3);
}

/* 表格 */
.bl__table-card {
  padding: 14px 16px;
}

.bl__table-wrap {
  overflow-x: auto;
}

.bl__table {
  width: 100%;
  min-width: 880px;
  border-collapse: collapse;
  font-size: 12.5px;
}

.bl__table th {
  padding: 7px 8px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-3);
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
}

.bl__table td {
  padding: 9px 8px;
  border-bottom: 1px dashed var(--border-color);
  color: var(--text-2);
}

.bl__table tbody tr:hover td {
  background: var(--bg-subtle, var(--bg-page));
}

.bl__mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.bl__name {
  font-weight: 700;
  color: var(--text-1);
}

.bl__reason {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bl__time {
  white-space: nowrap;
  color: var(--text-3);
}

.bl__tag {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
}

.bl__tag--high { background: var(--danger-bg); color: var(--danger-fg); }
.bl__tag--mid { background: var(--warning-bg); color: var(--warning-fg); }
.bl__tag--low { background: var(--info-bg); color: var(--info-fg); }

.bl__status {
  font-size: 12px;
  font-weight: 600;
}

.bl__status.is-on { color: var(--mn-green-dark); }
.bl__status.is-off { color: var(--text-3); }

.bl__ops {
  display: flex;
  gap: 4px;
  white-space: nowrap;
}

.bl__op {
  padding: 5px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 12px;
  transition: border-color var(--dur-fast) ease, color var(--dur-fast) ease;
}

.bl__op:hover {
  border-color: var(--mn-green);
  color: var(--mn-green-dark);
}

.bl__pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}

.bl__page-info {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.bl__page-btn {
  min-height: 30px;
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 12px;
}

.bl__page-btn:hover:not(:disabled) {
  border-color: var(--mn-green);
  color: var(--mn-green-dark);
}

.bl__page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
