<script setup lang="ts">
/**
 * AdminAuditView —— 审计日志（/admin/audit）。
 *
 * 顶部一条「审计链说明」小字：所有写操作留痕、仅追加不可篡改。
 * 筛选：操作者（actor，后端按姓名 / 账号模糊匹配）、动作（action）、目标（target）
 *       三条件可叠加，输入防抖后服务端过滤；分页。
 * 表格：时间 / 操作者（姓名 + 角色）/ 动作（中文可读标签）/ 目标 / 详情（JSON 折行，可展开）。
 *
 * 后端 AuditItem 不含 actorRole 字段，故按 actorId（= 登录账号）从账号列表本地推断角色，
 * 推断不到时显示「—」，绝不臆造。
 */
import { computed, onMounted, ref, watch } from 'vue'
import AdminShell from './AdminShell.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import { useToast } from '@/composables/useToast'
import { getAdminAccounts, getAdminAudit, type AuditItem, type AdminRole } from '@/api/admin'

const toast = useToast()

const pageSize = 12
const loading = ref(true)
const items = ref<AuditItem[]>([])
const total = ref(0)
const page = ref(1)

const filterActor = ref('')
const filterAction = ref('')
const filterTarget = ref('')

/** 动作名 → 中文可读标签（覆盖后端全部埋点动作；未命中显示原文） */
const ACTION_LABEL: Record<string, string> = {
  'admin.account.create': '派发账号',
  'admin.account.update': '编辑账号',
  'admin.account.reset_password': '重置密码',
  'admin.blacklist.create': '新增黑名单',
  'admin.blacklist.update': '编辑黑名单',
  'admin.blacklist.toggle': '启停黑名单',
  'admin.sku_rule.create': '新增 SKU 规则',
  'admin.sku_rule.update': '编辑 SKU 规则',
  'admin.knowledge.create': '新增知识条目',
  'admin.knowledge.update': '编辑知识条目',
  'admin.knowledge.delete': '下架知识条目',
  'admin.announcement.create': '发布公告',
  checkin: '盘点签到',
  inventory: '库存上报',
  ai_weekly_report: 'AI 周报生成',
  'message.send': '发送消息',
}

/** 动作标签：命中映射表用中文，否则回落原文（如第三方写入的未知动作） */
function actionLabel(action: string): string {
  return ACTION_LABEL[action] || action || '—'
}

const ROLE_LABEL: Record<AdminRole, string> = {
  rep: '业代',
  manager: '区域经理',
  owner: '店主',
  admin: '管理员',
}

/** actorId（= 登录账号）→ 角色 的本地映射，用于补出「姓名 + 角色」 */
const roleById = ref<Record<string, AdminRole>>({})

function roleLabelOf(actorId: string): string {
  const role = roleById.value[actorId]
  return role ? ROLE_LABEL[role] : ''
}

const totalPages = computed<number>(() => Math.max(1, Math.ceil(total.value / pageSize)))

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await getAdminAudit({
      page: page.value,
      pageSize,
      actor: filterActor.value.trim() || undefined,
      action: filterAction.value.trim() || undefined,
      target: filterTarget.value.trim() || undefined,
    })
    items.value = res.items
    total.value = res.total
  } catch {
    toast.error('审计日志加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

/** 角色映射（一次拉全量账号，失败静默退化为不显示角色，不影响日志本身） */
async function loadRoles(): Promise<void> {
  try {
    const res = await getAdminAccounts()
    const map: Record<string, AdminRole> = {}
    for (const a of res.items) {
      if (a.username) map[a.username] = a.role
    }
    roleById.value = map
  } catch {
    /* 角色标注为增强信息，拉取失败不阻断日志展示 */
  }
}

onMounted(() => {
  void load()
  void loadRoles()
})

/* 三条件防抖筛选：任一变化即回第 1 页重新请求 */
let filterTimer: number | undefined
watch([filterActor, filterAction, filterTarget], () => {
  if (filterTimer) window.clearTimeout(filterTimer)
  filterTimer = window.setTimeout(() => {
    page.value = 1
    void load()
  }, 320)
})

function resetFilters(): void {
  if (filterTimer) window.clearTimeout(filterTimer)
  filterActor.value = ''
  filterAction.value = ''
  filterTarget.value = ''
  page.value = 1
  void load()
}

function goPage(p: number): void {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  void load()
}

/* ═══════════════ 详情展示（JSON 折行 + 展开） ═══════════════ */

const expanded = ref<Record<string, boolean>>({})

/** detail 可能是 JSON 串或普通文本；JSON 则格式化缩进，便于折行阅读 */
function prettyDetail(detail: string): string {
  const s = (detail || '').trim()
  if (!s) return ''
  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      return JSON.stringify(JSON.parse(s), null, 2)
    } catch {
      return s
    }
  }
  return s
}

/** 详情过长 / 多行时提供展开开关 */
function canExpand(text: string): boolean {
  return text.length > 48 || text.includes('\n')
}

function toggleDetail(id: string): void {
  expanded.value = { ...expanded.value, [id]: !expanded.value[id] }
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
</script>

<template>
  <AdminShell title="审计日志">
    <template #actions>
      <button type="button" class="u-btn u-btn--ghost" :disabled="loading" @click="load">
        <AppIcon name="refresh" :size="15" /> 刷新
      </button>
    </template>

    <!-- ══ 审计链说明 ══ -->
    <p class="au__note">
      <AppIcon name="shield" :size="14" />
      审计链说明：账号、黑名单、SKU 规则、知识库、公告、签到、库存、AI 周报、消息等全部写操作均在本表留痕，仅追加、不可篡改。
    </p>

    <!-- ══ 筛选 ══ -->
    <section class="au__filters u-card">
      <label class="au__field">
        <span>操作者</span>
        <input v-model="filterActor" type="search" placeholder="姓名或账号，如 王敏 / wangmin" aria-label="按操作者筛选" />
      </label>
      <label class="au__field">
        <span>动作</span>
        <input v-model="filterAction" list="au-actions" placeholder="如 admin.account.create" aria-label="按动作筛选" />
        <datalist id="au-actions">
          <option v-for="(label, key) in ACTION_LABEL" :key="key" :value="key">{{ label }}</option>
        </datalist>
      </label>
      <label class="au__field">
        <span>目标</span>
        <input v-model="filterTarget" type="search" placeholder="目标 ID / 名称" aria-label="按目标筛选" />
      </label>
      <div class="au__filter-foot">
        <span class="au__count">共 {{ total }} 条记录</span>
        <button type="button" class="u-btn u-btn--ghost" @click="resetFilters">重置</button>
      </div>
    </section>

    <!-- ══ 日志表 ══ -->
    <section class="au__body u-card">
      <div v-if="loading" class="au__loading">
        <SkeletonBlock v-for="i in 6" :key="i" height="54px" radius="10px" />
      </div>

      <template v-else>
        <div v-if="items.length" class="au__table-wrap u-scroll-y">
          <table class="au__table">
            <thead>
              <tr>
                <th class="au__col-time">时间</th>
                <th class="au__col-actor">操作者</th>
                <th class="au__col-action">动作</th>
                <th class="au__col-target">目标</th>
                <th class="au__col-detail">详情</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="it in items" :key="it.id">
                <td class="au__col-time">
                  <time :datetime="it.createdAt">{{ fmtTime(it.createdAt) }}</time>
                </td>
                <td class="au__col-actor">
                  <span class="au__actor-name">{{ it.actorName || '—' }}</span>
                  <span v-if="roleLabelOf(it.actorId)" class="au__role">{{ roleLabelOf(it.actorId) }}</span>
                </td>
                <td class="au__col-action">
                  <span class="au__action-label">{{ actionLabel(it.action) }}</span>
                  <code v-if="ACTION_LABEL[it.action]" class="au__action-code">{{ it.action }}</code>
                </td>
                <td class="au__col-target">
                  <span class="u-ellipsis" :title="it.target">{{ it.target || '—' }}</span>
                </td>
                <td class="au__col-detail">
                  <template v-if="prettyDetail(it.detail)">
                    <pre class="au__detail" :class="{ 'is-open': expanded[it.id] }">{{ prettyDetail(it.detail) }}</pre>
                    <button
                      v-if="canExpand(prettyDetail(it.detail))"
                      type="button"
                      class="au__toggle"
                      @click="toggleDetail(it.id)"
                    >
                      {{ expanded[it.id] ? '收起' : '展开' }}
                    </button>
                  </template>
                  <span v-else class="au__detail-empty">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <EmptyState
          v-else
          icon="clipboard"
          title="暂无审计记录"
          desc="当有账号派发、黑名单、知识库、公告等写操作发生时，这里会实时留痕"
        />

        <nav class="au__pager" aria-label="审计日志分页">
          <span class="au__page-info">第 {{ page }} / {{ totalPages }} 页 · 每页 {{ pageSize }} 条</span>
          <div class="au__page-btns">
            <button type="button" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
            <button type="button" :disabled="page >= totalPages" @click="goPage(page + 1)">下一页</button>
          </div>
        </nav>
      </template>
    </section>
  </AdminShell>
</template>

<style scoped>
/* ── 审计链说明 ── */
.au__note {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 12px;
  padding: 9px 13px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--info-bg);
  color: var(--info-fg);
  font-size: 12px;
  line-height: 1.5;
}

/* ── 筛选 ── */
.au__filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  align-items: end;
  padding: 16px 18px;
  margin-bottom: 14px;
}

.au__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.au__field span {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.au__field input {
  height: 36px;
  padding: 0 11px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--text-1);
  font-size: 13px;
  outline: none;
}

.au__field input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--mn-green-light);
}

.au__filter-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  grid-column: 1 / -1;
}

.au__count {
  font-size: 12px;
  color: var(--text-3);
}

/* ── 表格 ── */
.au__body {
  padding: 8px 4px 14px;
}

.au__loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
}

.au__table-wrap {
  max-height: 62vh;
}

.au__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.au__table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 10px 12px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  color: var(--text-3);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-align: left;
}

.au__table td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-2);
  vertical-align: top;
}

.au__table tbody tr:hover td {
  background: var(--bg-page);
}

.au__col-time {
  width: 148px;
  white-space: nowrap;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.au__col-actor {
  width: 150px;
}

.au__actor-name {
  font-weight: 700;
  color: var(--text-1);
}

.au__role {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-size: 10.5px;
  font-weight: 700;
  vertical-align: middle;
}

.au__col-action {
  width: 190px;
}

.au__action-label {
  display: block;
  font-weight: 700;
  color: var(--text-1);
}

.au__action-code {
  display: block;
  margin-top: 2px;
  color: var(--text-4);
  font-family: var(--font-sans);
  font-size: 10.5px;
}

.au__col-target {
  width: 160px;
}

.au__col-detail {
  min-width: 220px;
}

.au__detail {
  margin: 0;
  padding: 7px 9px;
  border-radius: 8px;
  background: var(--bg-page);
  color: var(--text-2);
  font-family: var(--font-sans);
  font-size: 11.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 折叠态：截到约两行高度并柔化下沿，展开后完整显示 */
.au__detail:not(.is-open) {
  max-height: 3.4em;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(180deg, #000 58%, transparent);
  mask-image: linear-gradient(180deg, #000 58%, transparent);
}

.au__detail-empty {
  color: var(--text-4);
}

.au__toggle {
  margin-top: 3px;
  padding: 2px 6px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--brand-deep);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.au__toggle:hover {
  background: var(--mn-green-light);
}

/* ── 分页 ── */
.au__pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px 2px;
}

.au__page-info {
  font-size: 12px;
  color: var(--text-3);
}

.au__page-btns {
  display: flex;
  gap: 8px;
}

.au__page-btns button {
  min-height: 30px;
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
}

.au__page-btns button:hover:not(:disabled) {
  border-color: var(--brand);
  color: var(--brand-deep);
}

.au__page-btns button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 1024px) {
  .au__filters {
    grid-template-columns: 1fr;
  }
}
</style>
