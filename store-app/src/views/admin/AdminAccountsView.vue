<script setup lang="ts">
/**
 * AdminAccountsView —— 账号派发（/admin/accounts）。
 *
 * 数据源：GET /admin/accounts（内置 seed 账号只读 + 派发 ext 账号可编辑）。
 * 能力：派发新账号（POST，重名 409）｜编辑（PUT）｜停用/启用（PUT status）｜重置密码
 * （POST /reset-password，返回的新密码必须显式展示且只显示一次）。
 *
 * ★ 后端约束如实反映：editable===false 的内置账号不提供编辑/停用入口。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import AdminShell from './AdminShell.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import { useToast } from '@/composables/useToast'
import { useCountUp } from '@/composables/useCountUp'
import { ApiError } from '@/api/client'
import { getStores } from '@/api'
import {
  createAdminAccount,
  getAdminAccounts,
  resetAdminPassword,
  updateAdminAccount,
  type AdminAccount,
  type AdminRole,
  type AccountStatus,
} from '@/api/admin'

const toast = useToast()

const loading = ref(true)
const accounts = ref<AdminAccount[]>([])
const stores = ref<{ id: string; name: string }[]>([])

/** 角色徽章文案与色系 */
const ROLE_LABEL: Record<AdminRole, string> = { rep: '业代', manager: '区域经理', owner: '店主', admin: '管理员' }
const ROLE_OPTIONS: AdminRole[] = ['rep', 'manager', 'owner', 'admin']

const stats = computed(() => {
  const seed = accounts.value.filter((a) => a.source === 'seed').length
  const ext = accounts.value.filter((a) => a.source === 'ext').length
  return { seed, ext, total: accounts.value.length }
})

/** 统计数字滚动入场（账号数） */
const statsCount = {
  seed: useCountUp(() => stats.value.seed),
  ext: useCountUp(() => stats.value.ext),
  total: useCountUp(() => stats.value.total),
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await getAdminAccounts()
    accounts.value = res.items
  } catch {
    toast.error('账号列表加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await load()
  try {
    const res = await getStores()
    stores.value = res.stores.map((s) => ({ id: s.id, name: s.name }))
  } catch {
    /* 门店下拉不可用时不影响主流程，仅绑定门店可选为空 */
  }
})

/* ═══════════════ 派发 / 编辑 弹层 ═══════════════ */

const showForm = ref(false)
/** 编辑目标（null = 新建） */
const editTarget = ref<AdminAccount | null>(null)

const form = reactive({
  username: '',
  password: '',
  name: '',
  role: 'rep' as AdminRole,
  region: '',
  storeId: '',
  status: 'active' as AccountStatus,
})

const submitting = ref(false)
/** 表单校验失败时临时挂 .mot-shake（animationend 后由模板清空） */
const formShake = ref(false)

function openCreate(): void {
  editTarget.value = null
  Object.assign(form, { username: '', password: '', name: '', role: 'rep', region: '', storeId: '', status: 'active' })
  showForm.value = true
}

function openEdit(acc: AdminAccount): void {
  editTarget.value = acc
  Object.assign(form, {
    username: acc.username,
    password: '',
    name: acc.name,
    role: acc.role,
    region: acc.region || '',
    storeId: acc.storeId || '',
    status: acc.status,
  })
  showForm.value = true
}

/** 新建/编辑提交 */
async function submitForm(): Promise<void> {
  if (submitting.value) return
  if (!form.name.trim()) {
    formShake.value = true
    toast.error('请填写使用者姓名')
    return
  }
  submitting.value = true
  try {
    if (editTarget.value) {
      await updateAdminAccount(editTarget.value.id, {
        name: form.name.trim(),
        role: form.role,
        region: form.region.trim(),
        storeId: form.storeId,
        status: form.status,
      })
      toast.success(`已更新账号「${form.name.trim()}」`)
    } else {
      if (!form.username.trim() || !form.password.trim()) {
        formShake.value = true
        toast.error('请填写登录账号与初始密码')
        submitting.value = false
        return
      }
      await createAdminAccount({
        username: form.username.trim(),
        password: form.password,
        name: form.name.trim(),
        role: form.role,
        region: form.region.trim() || undefined,
        storeId: form.storeId || undefined,
        status: form.status,
      })
      toast.success(`已派发账号「${form.username.trim()}」`)
    }
    showForm.value = false
    await load()
  } catch (e) {
    if (e instanceof ApiError && e.code === 409) {
      toast.error('登录账号已存在，请更换后重试')
    } else {
      toast.error(editTarget.value ? '账号更新失败，请稍后重试' : '账号派发失败，请稍后重试')
    }
  } finally {
    submitting.value = false
  }
}

/* ═══════════════ 停用 / 启用 ═══════════════ */

async function toggleStatus(acc: AdminAccount): Promise<void> {
  const next: AccountStatus = acc.status === 'active' ? 'disabled' : 'active'
  try {
    await updateAdminAccount(acc.id, { status: next })
    toast.success(next === 'disabled' ? `已停用「${acc.name}」` : `已启用「${acc.name}」`)
    await load()
  } catch {
    toast.error('状态更新失败，请稍后重试')
  }
}

/* ═══════════════ 重置密码 ═══════════════ */

const resetTarget = ref<AdminAccount | null>(null)
const resetResult = ref<{ id: string; password: string } | null>(null)
const resetting = ref(false)

function openReset(acc: AdminAccount): void {
  resetTarget.value = acc
  resetResult.value = null
}

async function confirmReset(): Promise<void> {
  if (!resetTarget.value || resetting.value) return
  resetting.value = true
  try {
    const res = await resetAdminPassword(resetTarget.value.id)
    resetResult.value = res
  } catch {
    toast.error('密码重置失败，请稍后重试')
  } finally {
    resetting.value = false
  }
}

const copied = ref(false)
async function copyPassword(): Promise<void> {
  const pwd = resetResult.value?.password
  if (!pwd) return
  try {
    await navigator.clipboard.writeText(pwd)
    copied.value = true
    toast.success('新密码已复制到剪贴板')
    window.setTimeout(() => (copied.value = false), 2200)
  } catch {
    toast.info('复制失败，请手动记录下方密码')
  }
}

function closeReset(): void {
  resetTarget.value = null
  resetResult.value = null
}

function fmtDate(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}
</script>

<template>
  <AdminShell title="账号派发">
    <template #actions>
      <button type="button" class="u-btn u-btn--primary" @click="openCreate">
        <AppIcon name="plus" :size="16" /> 派发新账号
      </button>
    </template>

    <div class="ac">
      <!-- ── 统计 ── -->
      <div class="ac__stats mot-stagger-pop">
        <div class="ac__stat u-card">
          <span class="ac__stat-label">内置账号</span>
          <p class="ac__stat-value">{{ statsCount.seed.text }}</p>
          <span class="ac__stat-note">演示账号 · 不可停用</span>
        </div>
        <div class="ac__stat u-card">
          <span class="ac__stat-label">派发账号</span>
          <p class="ac__stat-value">{{ statsCount.ext.text }}</p>
          <span class="ac__stat-note">管理端新建 · 可编辑</span>
        </div>
        <div class="ac__stat u-card ac__stat--brand">
          <span class="ac__stat-label">账号总量</span>
          <p class="ac__stat-value">{{ statsCount.total.text }}</p>
          <span class="ac__stat-note">内置 + 派发</span>
        </div>
      </div>

      <!-- ── 表格 ── -->
      <section class="ac__card u-card">
        <header class="ac__card-head">
          <h2 class="ac__card-title">账号清单</h2>
          <span>共 {{ stats.total }} 个账号</span>
        </header>

        <div v-if="loading" class="ac__loading">
          <SkeletonBlock v-for="i in 5" :key="i" height="42px" radius="8px" />
        </div>

        <template v-else>
          <div class="ac__table-wrap">
            <table class="ac__table">
              <thead>
                <tr>
                  <th>登录账号</th>
                  <th>姓名</th>
                  <th>角色</th>
                  <th>区域</th>
                  <th>绑定门店</th>
                  <th>来源</th>
                  <th>状态</th>
                  <th class="ac__col-op">操作</th>
                </tr>
              </thead>
              <tbody class="mot-stagger">
                <tr v-for="a in accounts" :key="a.id">
                  <td class="ac__mono">{{ a.username || '—' }}</td>
                  <td>{{ a.name }}</td>
                  <td><span class="ac__badge" :class="`ac__badge--${a.role}`">{{ ROLE_LABEL[a.role] }}</span></td>
                  <td>{{ a.region || '—' }}</td>
                  <td>{{ (a.storeId && (stores.find((s) => s.id === a.storeId)?.name || a.storeId)) || '—' }}</td>
                  <td>
                    <span class="ac__src" :class="{ 'ac__src--seed': a.source === 'seed' }">
                      {{ a.source === 'seed' ? '内置' : '派发' }}
                    </span>
                  </td>
                  <td>
                    <span class="ac__status" :class="{ 'ac__status--off': a.status === 'disabled' }">
                      {{ a.status === 'active' ? '启用' : '已停用' }}
                    </span>
                  </td>
                  <td class="ac__col-op">
                    <template v-if="a.editable">
                      <button type="button" class="ac__op mot-tap" @click="openEdit(a)">编辑</button>
                      <button type="button" class="ac__op mot-tap" @click="toggleStatus(a)">
                        {{ a.status === 'active' ? '停用' : '启用' }}
                      </button>
                      <button type="button" class="ac__op ac__op--warn mot-tap" @click="openReset(a)">重置密码</button>
                    </template>
                    <span v-else class="ac__op-disabled" title="内置演示账号受后端保护，不可编辑或停用">内置账号 · 不可停用</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <EmptyState v-if="!accounts.length" icon="user" title="暂无账号" desc="点击右上角「派发新账号」创建" />
        </template>
      </section>
    </div>

    <!-- ══ 派发 / 编辑 弹层 ══ -->
    <div v-if="showForm" class="ac__mask" @click.self="showForm = false">
      <div class="ac__modal u-card mot-rise" role="dialog" aria-modal="true" :aria-label="editTarget ? '编辑账号' : '派发新账号'">
        <header class="ac__modal-head">
          <h3>{{ editTarget ? '编辑账号' : '派发新账号' }}</h3>
          <button type="button" class="ac__close u-tap mot-tap" aria-label="关闭" @click="showForm = false">
            <AppIcon name="close" :size="18" />
          </button>
        </header>

        <div class="ac__form" :class="{ 'mot-shake': formShake }" @animationend="formShake = false">
          <label class="ac__field">
            <span>登录账号 <em v-if="!editTarget">*</em></span>
            <input v-model="form.username" :disabled="!!editTarget" placeholder="如 zhangsan" autocomplete="off" />
          </label>
          <label v-if="!editTarget" class="ac__field">
            <span>初始密码 <em>*</em></span>
            <input v-model="form.password" placeholder="建议 8 位以上" autocomplete="new-password" />
          </label>
          <label class="ac__field">
            <span>使用者姓名 <em>*</em></span>
            <input v-model="form.name" placeholder="如 张三" />
          </label>
          <label class="ac__field">
            <span>角色</span>
            <select v-model="form.role">
              <option v-for="r in ROLE_OPTIONS" :key="r" :value="r">{{ ROLE_LABEL[r] }}</option>
            </select>
          </label>
          <label class="ac__field">
            <span>负责区域</span>
            <input v-model="form.region" placeholder="如 R_EAST（可留空）" />
          </label>
          <label class="ac__field">
            <span>绑定门店</span>
            <select v-model="form.storeId">
              <option value="">不绑定</option>
              <option v-for="s in stores" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </label>
          <label class="ac__field">
            <span>状态</span>
            <select v-model="form.status">
              <option value="active">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>
        </div>

        <p v-if="!editTarget" class="ac__note">
          <AppIcon name="info" :size="14" /> 派发记录用于运营统计；当前演示版本登录能力仍由内置账号提供。
        </p>

        <footer class="ac__modal-foot">
          <button type="button" class="u-btn u-btn--ghost" @click="showForm = false">取消</button>
          <button type="button" class="u-btn u-btn--primary" :class="{ 'mot-press-loading': submitting }" :disabled="submitting" @click="submitForm">
            {{ submitting ? '提交中…' : editTarget ? '保存修改' : '确认派发' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- ══ 重置密码 弹层 ══ -->
    <div v-if="resetTarget" class="ac__mask" @click.self="closeReset">
      <div class="ac__modal ac__modal--sm u-card mot-rise" role="dialog" aria-modal="true" aria-label="重置密码">
        <header class="ac__modal-head">
          <h3>重置密码</h3>
          <button type="button" class="ac__close u-tap mot-tap" aria-label="关闭" @click="closeReset">
            <AppIcon name="close" :size="18" />
          </button>
        </header>

        <template v-if="!resetResult">
          <p class="ac__reset-ask">
            将为账号「<b>{{ resetTarget.name }}</b>（{{ resetTarget.username }}）」生成一个新的 8 位随机密码。
            旧密码立即失效，请确认操作。
          </p>
          <footer class="ac__modal-foot">
            <button type="button" class="u-btn u-btn--ghost" @click="closeReset">取消</button>
            <button type="button" class="u-btn u-btn--primary" :class="{ 'mot-press-loading': resetting }" :disabled="resetting" @click="confirmReset">
              {{ resetting ? '生成中…' : '确认重置' }}
            </button>
          </footer>
        </template>

        <template v-else>
          <div class="ac__pwd-box">
            <p class="ac__pwd-label">新密码（仅显示一次）</p>
            <div class="ac__pwd-row">
              <code class="ac__pwd">{{ resetResult.password }}</code>
              <button type="button" class="ac__copy mot-tap" @click="copyPassword">
                <AppIcon name="clipboard" :size="15" /> {{ copied ? '已复制' : '复制' }}
              </button>
            </div>
            <p class="ac__pwd-time">生成时间：{{ fmtDate() }}</p>
          </div>
          <p class="ac__warn">
            <AppIcon name="warning" :size="14" /> 请立即转告使用者，关闭本窗口后不再显示该密码。
          </p>
          <footer class="ac__modal-foot">
            <button type="button" class="u-btn u-btn--primary" @click="closeReset">我已记录，关闭</button>
          </footer>
        </template>
      </div>
    </div>
  </AdminShell>
</template>

<style scoped>
.ac {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── 统计卡 ── */
.ac__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.ac__stat {
  padding: 14px 18px;
}

.ac__stat--brand {
  background: var(--grad-brand);
  color: #fff;
  box-shadow: var(--sh-brand);
}

.ac__stat--brand .ac__stat-label,
.ac__stat--brand .ac__stat-note {
  color: rgba(255, 255, 255, 0.86);
}

.ac__stat--brand .ac__stat-value {
  color: #fff;
}

.ac__stat-label {
  font-size: 12.5px;
  color: var(--text-3);
}

.ac__stat-value {
  margin-top: 4px;
  font-size: 28px;
  font-weight: 800;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.ac__stat-note {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-4);
}

/* ── 表卡 ── */
.ac__card {
  padding: 16px 18px;
}

.ac__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.ac__card-head span {
  font-size: 11.5px;
  color: var(--text-3);
}

.ac__card-title {
  font-size: 14px;
  font-weight: 700;
}

.ac__loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ac__table-wrap {
  overflow-x: auto;
}

.ac__table {
  width: 100%;
  min-width: 940px;
  border-collapse: collapse;
  font-size: 12.5px;
}

.ac__table th {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-3);
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
}

.ac__table td {
  padding: 10px;
  border-bottom: 1px dashed var(--border-color);
  color: var(--text-1);
}

.ac__table tbody tr:hover td {
  background: var(--bg-page);
}

.ac__col-op {
  width: 230px;
  white-space: nowrap;
}

.ac__mono {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.ac__badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.ac__badge--rep {
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
}

.ac__badge--manager {
  background: var(--sky-mist);
  color: var(--info-fg);
}

.ac__badge--owner {
  background: var(--gold-mist);
  color: var(--gold);
}

.ac__badge--admin {
  background: var(--ai-mist);
  color: var(--ai-purple);
}

.ac__src {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 6px;
  background: var(--bg-page);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 600;
}

.ac__src--seed {
  background: var(--amber-mist);
  color: var(--warning-fg);
}

.ac__status {
  color: var(--mn-green-dark);
  font-weight: 600;
}

.ac__status--off {
  color: var(--text-3);
}

.ac__op {
  padding: 5px 9px;
  margin-right: 4px;
  border: none;
  border-radius: 7px;
  background: none;
  color: var(--brand-deep);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast) ease, transform var(--dur-instant) var(--ease-standard);
}

.ac__op:hover {
  background: var(--mn-green-light);
}

.ac__op--warn {
  color: var(--warning-fg);
}

.ac__op--warn:hover {
  background: var(--amber-mist);
}

.ac__op-disabled {
  color: var(--text-4);
  font-size: 11.5px;
}

/* ── 弹层 ── */
.ac__mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-mask);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg-mask);
}

.ac__modal {
  width: 560px;
  max-width: 100%;
  max-height: 88vh;
  overflow-y: auto;
  padding: 20px 22px;
  background: var(--bg-elevated);
  z-index: var(--z-modal);
}

.ac__modal--sm {
  width: 460px;
}

.ac__modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.ac__modal-head h3 {
  font-size: 16px;
  font-weight: 800;
}

.ac__close {
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

.ac__form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 14px;
}

.ac__field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ac__field span {
  font-size: 12px;
  color: var(--text-2);
  font-weight: 600;
}

.ac__field em {
  color: var(--danger-fg);
  font-style: normal;
}

.ac__field input,
.ac__field select {
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--text-1);
  font-size: 13.5px;
}

.ac__field input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ac__field input:focus,
.ac__field select:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--mn-green-light);
}

.ac__note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  padding: 9px 11px;
  border-radius: 9px;
  background: var(--info-bg);
  color: var(--info-fg);
  font-size: 11.5px;
}

.ac__modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

/* ── 重置密码结果 ── */
.ac__reset-ask {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-2);
}

.ac__pwd-box {
  padding: 14px 16px;
  border: 1px solid var(--brand);
  border-radius: var(--radius-card);
  background: var(--mn-green-light);
}

.ac__pwd-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--mn-green-dark);
}

.ac__pwd-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.ac__pwd {
  flex: 1;
  padding: 9px 12px;
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--text-1);
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 2px;
  text-align: center;
}

.ac__copy {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 38px;
  padding: 0 13px;
  border: 1px solid var(--brand);
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--brand-deep);
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.ac__pwd-time {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-3);
}

.ac__warn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 9px 11px;
  border-radius: 9px;
  background: var(--danger-bg);
  color: var(--danger-fg);
  font-size: 12px;
  font-weight: 600;
}

@media (max-width: 860px) {
  .ac__stats {
    grid-template-columns: 1fr;
  }

  .ac__form {
    grid-template-columns: 1fr;
  }
}
</style>
