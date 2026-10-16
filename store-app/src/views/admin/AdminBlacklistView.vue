<script setup lang="ts">
/**
 * AdminBlacklistView —— 黑名单管理（/admin/blacklist）。
 *
 * 页内两个板块（Tab 切换）：
 *  ① 黑名单：门店 / SKU 管控条目，支持类型/等级/状态筛选 + 关键词本地过滤 + 分页，
 *     新增 / 编辑 / 启用停用（toggle）。
 *  ② SKU 规则：SKU 执行规则（低于成本禁售 / 重点陈列 / 先进先出），可新增 / 停用。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AdminShell from './AdminShell.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import { useToast } from '@/composables/useToast'
import {
  createBlacklist,
  createSkuRule,
  getBlacklist,
  getSkuRules,
  toggleBlacklist,
  updateBlacklist,
  updateSkuRule,
  type BlacklistItem,
  type BlacklistLevel,
  type BlacklistStatus,
  type BlacklistType,
  type SkuRule,
  type SkuRuleType,
} from '@/api/admin'

const toast = useToast()

type TabKey = 'list' | 'sku'
const tab = ref<TabKey>('list')

const TYPE_LABEL: Record<BlacklistType, string> = { store: '门店', sku: 'SKU' }
const LEVEL_LABEL: Record<BlacklistLevel, string> = { high: '高', mid: '中', low: '低' }
const STATUS_LABEL: Record<BlacklistStatus, string> = { active: '生效中', revoked: '已停用' }
const SKU_RULE_LABEL: Record<SkuRuleType, string> = {
  ban_sale_below_cost: '低于成本禁售',
  key_shelf: '重点陈列',
  expire_first: '先进先出',
}
const SKU_RULE_OPTIONS: SkuRuleType[] = ['ban_sale_below_cost', 'key_shelf', 'expire_first']

/* ═══════════════ ① 黑名单 ═══════════════ */

const loading = ref(true)
const items = ref<BlacklistItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 10
const filters = reactive<{ type: BlacklistType | ''; level: BlacklistLevel | ''; status: BlacklistStatus | '' }>({
  type: '',
  level: '',
  status: '',
})
const keyword = ref('')

/** 后端未提供 q 参数，关键词在前端对当前页做本地过滤（如实标注） */
const visibleItems = computed<BlacklistItem[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return items.value
  return items.value.filter(
    (i) => i.targetName.toLowerCase().includes(kw) || i.targetId.toLowerCase().includes(kw) || i.reason.toLowerCase().includes(kw),
  )
})

const totalPages = computed<number>(() => Math.max(1, Math.ceil(total.value / pageSize)))

async function loadList(): Promise<void> {
  loading.value = true
  try {
    const res = await getBlacklist({
      page: page.value,
      pageSize,
      type: filters.type,
      level: filters.level,
      status: filters.status,
    })
    items.value = res.items
    total.value = res.total
  } catch {
    toast.error('黑名单加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

watch([() => filters.type, () => filters.level, () => filters.status], () => {
  page.value = 1
  void loadList()
})

function goPage(p: number): void {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  void loadList()
}

/* ── 新增 / 编辑 弹层 ── */

const showForm = ref(false)
const editTarget = ref<BlacklistItem | null>(null)
const form = reactive({ type: 'store' as BlacklistType, targetId: '', targetName: '', reason: '', level: 'mid' as BlacklistLevel })
const submitting = ref(false)
/** 表单校验失败时临时挂 .mot-shake（animationend 后由模板清空） */
const formShake = ref(false)

function openCreate(): void {
  editTarget.value = null
  Object.assign(form, { type: 'store', targetId: '', targetName: '', reason: '', level: 'mid' })
  showForm.value = true
}

function openEdit(item: BlacklistItem): void {
  editTarget.value = item
  Object.assign(form, { type: item.type, targetId: item.targetId, targetName: item.targetName, reason: item.reason, level: item.level })
  showForm.value = true
}

async function submitForm(): Promise<void> {
  if (submitting.value) return
  if (!form.targetId.trim() || !form.targetName.trim() || !form.reason.trim()) {
    formShake.value = true
    toast.error('请完整填写标识、名称与原因')
    return
  }
  submitting.value = true
  try {
    if (editTarget.value) {
      await updateBlacklist(editTarget.value.id, { ...form })
      toast.success('黑名单条目已更新')
    } else {
      await createBlacklist({ ...form })
      toast.success('已加入黑名单')
    }
    showForm.value = false
    await loadList()
  } catch {
    toast.error(editTarget.value ? '更新失败，请稍后重试' : '新增失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

async function toggle(item: BlacklistItem): Promise<void> {
  try {
    const res = await toggleBlacklist(item.id)
    item.status = res.status
    toast.success(res.status === 'active' ? '已恢复生效' : '已停用该条目')
  } catch {
    toast.error('操作失败，请稍后重试')
  }
}

/* ═══════════════ ② SKU 规则 ═══════════════ */

const skuLoading = ref(true)
const skuRules = ref<SkuRule[]>([])

async function loadSkuRules(): Promise<void> {
  skuLoading.value = true
  try {
    const res = await getSkuRules()
    skuRules.value = res.items
  } catch {
    toast.error('SKU 规则加载失败，请稍后重试')
  } finally {
    skuLoading.value = false
  }
}

const showSkuForm = ref(false)
const skuForm = reactive({ skuCode: '', skuName: '', ruleType: 'ban_sale_below_cost' as SkuRuleType, note: '' })
const skuSubmitting = ref(false)
/** SKU 表单校验失败时临时挂 .mot-shake */
const skuShake = ref(false)

function openSkuCreate(): void {
  Object.assign(skuForm, { skuCode: '', skuName: '', ruleType: 'ban_sale_below_cost', note: '' })
  showSkuForm.value = true
}

async function submitSku(): Promise<void> {
  if (skuSubmitting.value) return
  if (!skuForm.skuCode.trim() || !skuForm.skuName.trim()) {
    skuShake.value = true
    toast.error('请填写 SKU 编码与名称')
    return
  }
  skuSubmitting.value = true
  try {
    await createSkuRule({
      skuCode: skuForm.skuCode.trim(),
      skuName: skuForm.skuName.trim(),
      ruleType: skuForm.ruleType,
      note: skuForm.note.trim() || undefined,
    })
    toast.success('SKU 规则已新增')
    showSkuForm.value = false
    await loadSkuRules()
  } catch {
    toast.error('新增失败，请稍后重试')
  } finally {
    skuSubmitting.value = false
  }
}

async function toggleSku(rule: SkuRule): Promise<void> {
  const next: BlacklistStatus = rule.status === 'active' ? 'revoked' : 'active'
  try {
    await updateSkuRule(rule.id, { status: next })
    rule.status = next
    toast.success(next === 'active' ? '规则已启用' : '规则已停用')
  } catch {
    toast.error('操作失败，请稍后重试')
  }
}

onMounted(() => {
  void loadList()
  void loadSkuRules()
})

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}
</script>

<template>
  <AdminShell title="黑名单管理">
    <template #actions>
      <button v-if="tab === 'list'" type="button" class="u-btn u-btn--primary" @click="openCreate">
        <AppIcon name="plus" :size="16" /> 新增黑名单
      </button>
      <button v-else type="button" class="u-btn u-btn--primary" @click="openSkuCreate">
        <AppIcon name="plus" :size="16" /> 新增 SKU 规则
      </button>
    </template>

    <div class="bl">
      <nav class="bl__tabs" role="tablist" aria-label="黑名单板块">
        <button
          type="button"
          role="tab"
          class="bl__tab mot-tap"
          :class="{ 'is-active': tab === 'list' }"
          :aria-selected="tab === 'list'"
          @click="tab = 'list'"
        >
          <AppIcon name="shield" :size="15" /> 黑名单（{{ total }}）
        </button>
        <button
          type="button"
          role="tab"
          class="bl__tab mot-tap"
          :class="{ 'is-active': tab === 'sku' }"
          :aria-selected="tab === 'sku'"
          @click="tab = 'sku'"
        >
          <AppIcon name="package" :size="15" /> SKU 规则（{{ skuRules.length }}）
        </button>
      </nav>

      <!-- ══ 板块一：黑名单 ══ -->
      <section v-show="tab === 'list'" class="bl__card u-card">
        <header class="bl__filters">
          <select v-model="filters.type" aria-label="按类型筛选">
            <option value="">全部类型</option>
            <option value="store">门店</option>
            <option value="sku">SKU</option>
          </select>
          <select v-model="filters.level" aria-label="按等级筛选">
            <option value="">全部等级</option>
            <option value="high">高</option>
            <option value="mid">中</option>
            <option value="low">低</option>
          </select>
          <select v-model="filters.status" aria-label="按状态筛选">
            <option value="">全部状态</option>
            <option value="active">生效中</option>
            <option value="revoked">已停用</option>
          </select>
          <input v-model="keyword" type="search" class="bl__search" placeholder="关键词（本地过滤当前页）" aria-label="关键词过滤" />
        </header>

        <div v-if="loading" class="bl__loading">
          <SkeletonBlock v-for="i in 5" :key="i" height="40px" radius="8px" />
        </div>

        <template v-else>
          <div class="bl__table-wrap">
            <table class="bl__table">
              <thead>
                <tr>
                  <th>类型</th>
                  <th>目标</th>
                  <th>原因</th>
                  <th>等级</th>
                  <th>创建时间</th>
                  <th>状态</th>
                  <th class="bl__col-op">操作</th>
                </tr>
              </thead>
              <tbody class="mot-stagger">
                <tr v-for="it in visibleItems" :key="it.id">
                  <td><span class="bl__tag">{{ TYPE_LABEL[it.type] }}</span></td>
                  <td>
                    <b class="bl__name">{{ it.targetName }}</b>
                    <small class="bl__id">{{ it.targetId }}</small>
                  </td>
                  <td class="bl__reason" :title="it.reason">{{ it.reason }}</td>
                  <td><span class="bl__level" :class="`bl__level--${it.level}`">{{ LEVEL_LABEL[it.level] }}</span></td>
                  <td class="bl__time">{{ fmtTime(it.createdAt) }}</td>
                  <td>
                    <span class="bl__status" :class="{ 'bl__status--off': it.status === 'revoked' }">
                      {{ STATUS_LABEL[it.status] }}
                    </span>
                  </td>
                  <td class="bl__col-op">
                    <button type="button" class="bl__op mot-tap" @click="openEdit(it)">编辑</button>
                    <button type="button" class="bl__op mot-tap" :class="it.status === 'active' ? 'bl__op--warn' : 'bl__op--ok'" @click="toggle(it)">
                      {{ it.status === 'active' ? '停用' : '启用' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <EmptyState v-if="!visibleItems.length" icon="shield" title="暂无黑名单条目" desc="点击右上角「新增黑名单」录入管控对象" />

          <nav class="bl__pager" aria-label="黑名单分页">
            <span class="bl__page-info">共 {{ total }} 条 · 第 {{ page }} / {{ totalPages }} 页</span>
            <div class="bl__page-btns">
              <button type="button" class="mot-tap" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
              <button type="button" class="mot-tap" :disabled="page >= totalPages" @click="goPage(page + 1)">下一页</button>
            </div>
          </nav>
        </template>
      </section>

      <!-- ══ 板块二：SKU 规则 ══ -->
      <section v-show="tab === 'sku'" class="bl__card u-card">
        <header class="bl__card-head">
          <h2 class="bl__card-title"><AppIcon name="package" :size="15" /> SKU 执行规则</h2>
          <span>共 {{ skuRules.length }} 条</span>
        </header>

        <div v-if="skuLoading" class="bl__loading">
          <SkeletonBlock v-for="i in 4" :key="i" height="40px" radius="8px" />
        </div>

        <template v-else>
          <div class="bl__table-wrap">
            <table class="bl__table">
              <thead>
                <tr>
                  <th>SKU 编码</th>
                  <th>SKU 名称</th>
                  <th>规则类型</th>
                  <th>备注</th>
                  <th>状态</th>
                  <th class="bl__col-op">操作</th>
                </tr>
              </thead>
              <tbody class="mot-stagger">
                <tr v-for="r in skuRules" :key="r.id">
                  <td class="bl__mono">{{ r.skuCode }}</td>
                  <td><b class="bl__name">{{ r.skuName }}</b></td>
                  <td><span class="bl__rule">{{ SKU_RULE_LABEL[r.ruleType] }}</span></td>
                  <td class="bl__reason" :title="r.note || ''">{{ r.note || '—' }}</td>
                  <td>
                    <span class="bl__status" :class="{ 'bl__status--off': r.status === 'revoked' }">
                      {{ STATUS_LABEL[r.status] }}
                    </span>
                  </td>
                  <td class="bl__col-op">
                    <button type="button" class="bl__op mot-tap" :class="r.status === 'active' ? 'bl__op--warn' : 'bl__op--ok'" @click="toggleSku(r)">
                      {{ r.status === 'active' ? '停用' : '启用' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <EmptyState v-if="!skuRules.length" icon="package" title="暂无 SKU 规则" desc="点击右上角「新增 SKU 规则」配置执行口径" />
        </template>
      </section>
    </div>

    <!-- ══ 黑名单 新增/编辑 ══ -->
    <div v-if="showForm" class="bl__mask" @click.self="showForm = false">
      <div class="bl__modal u-card mot-rise" role="dialog" aria-modal="true" :aria-label="editTarget ? '编辑黑名单' : '新增黑名单'">
        <header class="bl__modal-head">
          <h3>{{ editTarget ? '编辑黑名单条目' : '新增黑名单条目' }}</h3>
          <button type="button" class="bl__close u-tap mot-tap" aria-label="关闭" @click="showForm = false">
            <AppIcon name="close" :size="18" />
          </button>
        </header>
        <div class="bl__form" :class="{ 'mot-shake': formShake }" @animationend="formShake = false">
          <label class="bl__field">
            <span>管控类型</span>
            <select v-model="form.type">
              <option value="store">门店</option>
              <option value="sku">SKU</option>
            </select>
          </label>
          <label class="bl__field">
            <span>等级</span>
            <select v-model="form.level">
              <option value="high">高</option>
              <option value="mid">中</option>
              <option value="low">低</option>
            </select>
          </label>
          <label class="bl__field">
            <span>{{ form.type === 'store' ? '门店编号' : 'SKU 编码' }} *</span>
            <input v-model="form.targetId" :placeholder="form.type === 'store' ? '如 S99' : '如 YYC-450'" />
          </label>
          <label class="bl__field">
            <span>{{ form.type === 'store' ? '门店名称' : 'SKU 名称' }} *</span>
            <input v-model="form.targetName" :placeholder="form.type === 'store' ? '如 盛源批发部' : '如 优益C 原味 450ml'" />
          </label>
          <label class="bl__field bl__field--full">
            <span>原因 *</span>
            <textarea v-model="form.reason" rows="3" placeholder="记录进入黑名单的具体原因（窜货 / 低价 / 账期等）" />
          </label>
        </div>
        <footer class="bl__modal-foot">
          <button type="button" class="u-btn u-btn--ghost" @click="showForm = false">取消</button>
          <button type="button" class="u-btn u-btn--primary" :class="{ 'mot-press-loading': submitting }" :disabled="submitting" @click="submitForm">
            {{ submitting ? '提交中…' : editTarget ? '保存修改' : '确认新增' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- ══ SKU 规则 新增 ══ -->
    <div v-if="showSkuForm" class="bl__mask" @click.self="showSkuForm = false">
      <div class="bl__modal u-card mot-rise" role="dialog" aria-modal="true" aria-label="新增 SKU 规则">
        <header class="bl__modal-head">
          <h3>新增 SKU 规则</h3>
          <button type="button" class="bl__close u-tap mot-tap" aria-label="关闭" @click="showSkuForm = false">
            <AppIcon name="close" :size="18" />
          </button>
        </header>
        <div class="bl__form" :class="{ 'mot-shake': skuShake }" @animationend="skuShake = false">
          <label class="bl__field">
            <span>SKU 编码 *</span>
            <input v-model="skuForm.skuCode" placeholder="如 TLS-250" />
          </label>
          <label class="bl__field">
            <span>SKU 名称 *</span>
            <input v-model="skuForm.skuName" placeholder="如 特仑苏纯牛奶 250ml" />
          </label>
          <label class="bl__field bl__field--full">
            <span>规则类型</span>
            <select v-model="skuForm.ruleType">
              <option v-for="t in SKU_RULE_OPTIONS" :key="t" :value="t">{{ SKU_RULE_LABEL[t] }}</option>
            </select>
          </label>
          <label class="bl__field bl__field--full">
            <span>备注</span>
            <textarea v-model="skuForm.note" rows="2" placeholder="执行口径补充说明（可选）" />
          </label>
        </div>
        <footer class="bl__modal-foot">
          <button type="button" class="u-btn u-btn--ghost" @click="showSkuForm = false">取消</button>
          <button type="button" class="u-btn u-btn--primary" :class="{ 'mot-press-loading': skuSubmitting }" :disabled="skuSubmitting" @click="submitSku">
            {{ skuSubmitting ? '提交中…' : '确认新增' }}
          </button>
        </footer>
      </div>
    </div>
  </AdminShell>
</template>

<style scoped>
.bl {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── Tab ── */
.bl__tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: var(--bg-subtle, var(--bg-page));
  align-self: flex-start;
}

.bl__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 16px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast) ease, color var(--dur-fast) ease;
}

.bl__tab.is-active {
  background: var(--bg-card);
  color: var(--text-1);
  box-shadow: var(--sh-1);
}

/* Tab 挂 .mot-tap 后，保留既有背景/文字过渡并补上按压的 transform 过渡 */
.bl__tab.mot-tap {
  transition:
    background var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard),
    transform var(--dur-instant) var(--ease-standard);
}

/* ── 卡片 ── */
.bl__card {
  padding: 16px 18px;
}

.bl__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.bl__card-head span {
  font-size: 11.5px;
  color: var(--text-3);
}

.bl__card-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 700;
}

.bl__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.bl__filters select,
.bl__search {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--bg-page);
  color: var(--text-1);
  font-size: 13px;
}

.bl__search {
  flex: 1;
  min-width: 200px;
  max-width: 320px;
}

.bl__filters select:focus,
.bl__search:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--mn-green-light);
}

.bl__loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bl__table-wrap {
  overflow-x: auto;
}

.bl__table {
  width: 100%;
  min-width: 820px;
  border-collapse: collapse;
  font-size: 12.5px;
}

.bl__table th {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-3);
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
}

.bl__table td {
  padding: 10px;
  border-bottom: 1px dashed var(--border-color);
  color: var(--text-1);
  vertical-align: top;
}

.bl__table tbody tr:hover td {
  background: var(--bg-page);
}

.bl__col-op {
  width: 140px;
  white-space: nowrap;
}

.bl__tag {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 6px;
  background: var(--bg-page);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 600;
}

.bl__name {
  display: block;
  font-size: 12.5px;
  color: var(--text-1);
}

.bl__id,
.bl__mono {
  display: block;
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.bl__reason {
  max-width: 280px;
  color: var(--text-2);
}

.bl__time {
  color: var(--text-3);
  white-space: nowrap;
}

.bl__level {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.bl__level--high {
  background: var(--danger-bg);
  color: var(--danger-fg);
}

.bl__level--mid {
  background: var(--amber-mist);
  color: var(--warning-fg);
}

.bl__level--low {
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
}

.bl__rule {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 6px;
  background: var(--ai-mist);
  color: var(--ai-purple);
  font-size: 11px;
  font-weight: 600;
}

.bl__status {
  color: var(--mn-green-dark);
  font-weight: 600;
}

.bl__status--off {
  color: var(--text-3);
}

.bl__op {
  padding: 5px 10px;
  margin-right: 4px;
  border: none;
  border-radius: 7px;
  background: none;
  color: var(--brand-deep);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.bl__op:hover {
  background: var(--mn-green-light);
}

.bl__op--warn {
  color: var(--warning-fg);
}

.bl__op--warn:hover {
  background: var(--amber-mist);
}

.bl__op--ok {
  color: var(--mn-green-dark);
}

.bl__pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.bl__page-info {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.bl__page-btns {
  display: flex;
  gap: 8px;
}

.bl__page-btns button {
  min-height: 30px;
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
}

.bl__page-btns button:hover:not(:disabled) {
  border-color: var(--brand);
  color: var(--brand-deep);
}

.bl__page-btns button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── 弹层 ── */
.bl__mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-mask);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg-mask);
}

.bl__modal {
  width: 520px;
  max-width: 100%;
  max-height: 88vh;
  overflow-y: auto;
  padding: 20px 22px;
  background: var(--bg-elevated);
  z-index: var(--z-modal);
}

.bl__modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.bl__modal-head h3 {
  font-size: 16px;
  font-weight: 800;
}

.bl__close {
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

.bl__form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 14px;
}

.bl__field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.bl__field--full {
  grid-column: 1 / -1;
}

.bl__field span {
  font-size: 12px;
  color: var(--text-2);
  font-weight: 600;
}

.bl__field input,
.bl__field select,
.bl__field textarea {
  padding: 8px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--text-1);
  font-size: 13.5px;
  font-family: inherit;
}

.bl__field input,
.bl__field select {
  height: 36px;
}

.bl__field textarea {
  resize: vertical;
}

.bl__field input:focus,
.bl__field select:focus,
.bl__field textarea:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--mn-green-light);
}

.bl__modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

@media (max-width: 720px) {
  .bl__form {
    grid-template-columns: 1fr;
  }
}
</style>
