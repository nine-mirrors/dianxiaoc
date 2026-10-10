<script setup lang="ts">
/**
 * P1 登录页（唯一入口）。
 *
 * ★ 2026-10-09 重做：只保留**账号密码登录**。
 *   - 身份由账号决定：登录成功后跳到哪里、能看到哪些页面，全部由后端裁定，
 *     前端不提供「选择角色」入口；
 *   - 演示账号清单由 `GET /api/v1/auth/demo-accounts` 从后端拉取（含密码，便于评委
 *     自己登录不同身份查看），前端不硬编码任何凭证；
 *   - 不再提供手机号验证码、跳过登录等旁路 —— 演示必须走真鉴权。
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { fetchDemoAccounts, type DemoAccount } from '@/api'
import { useToast } from '@/composables/useToast'
import AppIcon from '@/components/common/AppIcon.vue'

const router = useRouter()
const session = useSessionStore()
const toast = useToast()

const username = ref<string>('')
const password = ref<string>('')
const submitting = ref<boolean>(false)
const accounts = ref<DemoAccount[]>([])
const listLoading = ref<boolean>(true)
const listError = ref<string>('')

/** 从后端拉演示账号清单（凭证来源 = 后端） */
async function loadAccounts(): Promise<void> {
  listLoading.value = true
  listError.value = ''
  try {
    accounts.value = await fetchDemoAccounts()
    // 默认填第一个账号，现场可直接点登录
    if (accounts.value.length && !username.value) {
      username.value = accounts.value[0].username
      password.value = accounts.value[0].password
    }
  } catch {
    listError.value = '无法连接后端服务，请先启动后端（cd server && npm start）'
    accounts.value = []
  } finally {
    listLoading.value = false
  }
}

onMounted(() => {
  void loadAccounts()
  // 已登录（刷新恢复会话）时直接进工作台
  if (session.logged) router.replace(session.home)
})

/** 一键填入某个演示账号 */
function fill(a: DemoAccount): void {
  username.value = a.username
  password.value = a.password
}

/** 提交登录：成功后由后端裁定落地页 */
async function submit(): Promise<void> {
  if (submitting.value) return
  const u = username.value.trim()
  const p = password.value
  if (!u || !p) {
    toast.info('请输入账号与密码')
    return
  }
  submitting.value = true
  try {
    const s = await session.login(u, p)
    toast.success(`欢迎回来，${s.user.name}（${s.user.role === 'rep' ? '业代' : s.user.role === 'manager' ? '区域经理' : '店员/店主'}）`)
    router.replace(s.home)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '登录失败'
    session.authError = msg
    toast.error(msg.includes('连接') ? '后端未连接：请先启动服务' : msg)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <!-- 品牌区 -->
    <header class="lg-brand">
      <div class="lg-logo">
        <svg viewBox="0 0 24 24" class="lg-logo__svg" aria-hidden="true">
          <path d="M12 3C8.5 7 6 10.4 6 14a6 6 0 0 0 12 0c0-3.6-2.5-7-6-11z" fill="#fff" />
        </svg>
        <span class="lg-logo__spark"><AppIcon name="sparkles" :size="9" color="#fff" /></span>
      </div>
      <h1 class="lg-title">店小C</h1>
      <p class="lg-subtitle">蒙牛 AI 巡店助手</p>
      <p class="lg-slogan">拍一张货架照，AI 告诉你该怎么卖</p>
    </header>

    <!-- 登录卡 -->
    <section class="lg-card">
      <h2 class="lg-card__title">账号登录</h2>
      <p class="lg-card__desc">身份由账号决定，登录后自动进入对应工作台</p>

      <div class="lg-row">
        <label class="lg-label" for="lg-user">账号</label>
        <input
          id="lg-user"
          v-model="username"
          class="lg-input"
          type="text"
          autocomplete="off"
          placeholder="请输入账号"
          @keyup.enter="submit"
        />
      </div>

      <div class="lg-row">
        <label class="lg-label" for="lg-pwd">密码</label>
        <input
          id="lg-pwd"
          v-model="password"
          class="lg-input"
          type="password"
          autocomplete="off"
          placeholder="请输入密码"
          @keyup.enter="submit"
        />
      </div>

      <p v-if="listError" class="lg-error">{{ listError }}</p>

      <button class="lg-submit" :disabled="submitting" @click="submit">
        {{ submitting ? '登录中…' : '登录' }}
      </button>

      <!-- 演示账号：清单来自后端，点击即可填入 -->
      <div class="lg-accounts">
        <p class="lg-accounts__title">演示账号（点击填入；统一密码见 README）</p>
        <p v-if="listLoading" class="lg-accounts__loading">正在从后端获取账号清单…</p>
        <div v-else class="lg-accounts__grid">
          <button v-for="a in accounts" :key="a.username" class="lg-account" type="button" @click="fill(a)">
            <b>{{ a.roleLabel }} · {{ a.person }}</b>
            <span class="lg-account__user">{{ a.username }}</span>
            <span class="lg-account__scope">{{ a.scope.join(' · ') }}</span>
          </button>
        </div>
      </div>

      <!-- 数据说明：主动交代演示数据的性质（评委第一眼就能看到，不等被问） -->
      <details class="lg-note">
        <summary>关于演示数据（请先看这里）</summary>
        <ul>
          <li><b>门店为样本</b>：5 家门店名称为演示设定，<b>坐标取自成都犀浦片区真实街区</b>，以保证地图底图与点位自洽；区域口径为「预置样本 S1–S5，非全量 128 家」。</li>
          <li><b>健康分不是黑箱</b>：由六维度加权算出（排面 30% / 缺货 25% / 价签 15% / 竞品 15% / 陈列 10% / 期效 5%），每一项可展开查看构成。</li>
          <li><b>补货量可溯源</b>：按 Holt 平滑 → 单列日均 → 动态安全库存 z·σ·√L（90% 服务水平）逐项计算，页面可展开完整算式。</li>
          <li><b>AI 只负责讲人话</b>：打分与补货量由规则/算法给出，AI 负责把依据讲成店主听得懂的话；效期与价签数据通过 MCP 协议取自进销存，不靠看图猜。</li>
        </ul>
      </details>

      <p class="lg-foot">店小C · 蒙牛 AI 巡店助手 · 演示环境</p>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 32px 16px;
  background: linear-gradient(180deg, #f2f7f4 0%, #e9f2ec 100%);
}

.lg-brand {
  text-align: center;
}

.lg-logo {
  position: relative;
  width: 56px;
  height: 56px;
  margin: 0 auto 10px;
  border-radius: 16px;
  background: var(--mn-green, #009639);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 18px rgba(0, 150, 57, 0.25);
}

.lg-logo__svg {
  width: 30px;
  height: 30px;
}

.lg-logo__spark {
  position: absolute;
  right: 6px;
  bottom: 6px;
}

.lg-title {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: var(--text-1, #1f2937);
}

.lg-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--mn-green-dark, #0a7d43);
  font-weight: 600;
}

.lg-slogan {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-3, #6b7280);
}

.lg-card {
  width: 100%;
  max-width: 340px;
  padding: 20px 18px 16px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 8px 28px rgba(15, 39, 27, 0.1);
}

.lg-card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-1, #1f2937);
}

.lg-card__desc {
  margin: 4px 0 16px;
  font-size: 11.5px;
  color: var(--text-3, #6b7280);
}

.lg-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.lg-label {
  width: 34px;
  flex: none;
  font-size: 13px;
  color: var(--text-2, #4b5563);
}

.lg-input {
  flex: 1;
  height: 42px;
  padding: 0 12px;
  border: 1px solid #e3e8e5;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.18s ease;
}

.lg-input:focus {
  border-color: var(--mn-green, #009639);
}

.lg-error {
  margin: 0 0 10px;
  font-size: 12px;
  color: #e02020;
}

.lg-submit {
  width: 100%;
  height: 44px;
  border: none;
  border-radius: 10px;
  background: var(--mn-green, #009639);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.18s ease;
}

.lg-submit:disabled {
  opacity: 0.6;
  cursor: wait;
}

.lg-submit:active {
  transform: scale(0.99);
}

.lg-accounts {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px dashed #e3e8e5;
}

.lg-accounts__title {
  margin: 0 0 8px;
  font-size: 11.5px;
  color: var(--text-3, #6b7280);
}

.lg-accounts__loading {
  margin: 0;
  font-size: 12px;
  color: var(--text-3, #6b7280);
}

.lg-accounts__grid {
  display: grid;
  gap: 6px;
}

.lg-account {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid #e3e8e5;
  border-radius: 10px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: all 0.18s ease;
}

.lg-account b {
  font-size: 13px;
  color: var(--mn-green-dark, #0a7d43);
}

.lg-account__user {
  font-size: 11px;
  color: var(--text-2, #4b5563);
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

.lg-account__scope {
  font-size: 10.5px;
  color: var(--text-3, #6b7280);
}

.lg-account:hover {
  border-color: var(--mn-green, #009639);
  background: #f4faf6;
}

.lg-account:active {
  transform: scale(0.98);
}

.lg-note {
  margin: 12px 0 0;
  padding: 9px 11px;
  border-radius: 10px;
  background: #f7faf8;
  border: 1px solid #e6efe9;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--text-2, #4b5563);
}

.lg-note summary {
  cursor: pointer;
  font-weight: 700;
  color: var(--mn-green-dark, #0a7d43);
  outline: none;
  list-style: none;
}

.lg-note summary::-webkit-details-marker {
  display: none;
}

.lg-note summary::before {
  content: '▸ ';
  display: inline-block;
  transition: transform 0.18s ease;
}

.lg-note[open] summary::before {
  content: '▾ ';
}

.lg-note ul {
  margin: 8px 0 0;
  padding-left: 16px;
}

.lg-note li {
  margin-bottom: 5px;
}

.lg-note b {
  color: var(--text-1, #1f2937);
}

.lg-foot {
  margin: 14px 0 0;
  text-align: center;
  font-size: 11px;
  color: var(--text-3, #6b7280);
}
</style>
