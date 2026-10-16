<script setup lang="ts">
/**
 * 登录页（唯一入口）。
 *
 * 身份由账号决定：登录成功后跳到哪里、能看到哪些页面，全部由后端裁定，
 * 前端不提供任何角色选择入口；不提供手机号验证码、跳过登录等旁路。
 */
import { ref, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'
import { fetchDemoAccounts, type DemoAccount } from '@/api'
import AppIcon from '@/components/common/AppIcon.vue'

const router = useRouter()
const session = useSessionStore()
const toast = useToast()

const username = ref<string>('')
const password = ref<string>('')
const submitting = ref<boolean>(false)
const errorMsg = ref<string>('')

/** 校验 / 登录失败时给两个输入框一次横向轻抖（按 .mot-shake 约定：临时挂类，animationend 后移除） */
const shakeOn = ref<boolean>(false)
function triggerShake(): void {
  shakeOn.value = false
  void nextTick(() => {
    shakeOn.value = true
  })
}

/**
 * 【安全】演示账号一键填充只在开发构建出现：import.meta.env.DEV 为 false 时
 * 整个区块不渲染、也不发起请求；账号清单仍由后端 /auth/demo-accounts 下发，
 * 前端源码不硬编码任何明文口令（生产后端该端点同样 404）。
 */
const devMode = import.meta.env.DEV
const demoAccounts = ref<DemoAccount[]>([])

onMounted(() => {
  // 已登录（刷新恢复会话）时直接进工作台
  if (session.logged) void router.replace(session.home)
  // 仅开发环境拉取演示账号；失败（如后端没起）就不显示 chips，不影响登录
  if (devMode) {
    void fetchDemoAccounts()
      .then((accounts) => {
        demoAccounts.value = accounts
      })
      .catch(() => {
        /* 开发环境后端不可达时静默：登录框本身仍可正常使用 */
      })
  }
})

/** 点演示账号 chip：一键填好账号密码，仍需用户自己点登录 */
function fillDemo(a: DemoAccount): void {
  username.value = a.username
  password.value = a.password
  errorMsg.value = ''
}

/** 提交登录：成功后由后端裁定落地页 */
async function submit(): Promise<void> {
  if (submitting.value) return
  const u = username.value.trim()
  const p = password.value
  if (!u || !p) {
    toast.info('请输入账号与密码')
    triggerShake()
    return
  }
  submitting.value = true
  errorMsg.value = ''
  try {
    const s = await session.login(u, p)
    toast.success(`欢迎回来，${s.user.name}`)
    await router.replace(s.home)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '登录失败'
    errorMsg.value = msg.includes('连接') ? '服务暂不可用，请稍后重试或联系管理员' : msg
    toast.error(errorMsg.value)
    triggerShake()
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-inner">
      <!-- 品牌区 -->
      <header class="lg-brand mot-rise">
        <div class="lg-logo mot-pop" style="animation-delay: 60ms">
          <svg viewBox="0 0 24 24" class="lg-logo__svg" aria-hidden="true">
            <path d="M12 3C8.5 7 6 10.4 6 14a6 6 0 0 0 12 0c0-3.6-2.5-7-6-11z" fill="#fff" />
          </svg>
          <span class="lg-logo__spark"><AppIcon name="sparkles" :size="9" color="#fff" /></span>
        </div>
        <h1 class="lg-title">店小C</h1>
        <p class="lg-subtitle">蒙牛 AI 巡店助手</p>
        <p class="lg-slogan">拍一张货架照，AI 告诉你该怎么卖</p>
      </header>

      <!-- 登录卡（延迟 100ms 入场，与品牌区形成前后层次） -->
      <section class="lg-card mot-rise" style="animation-delay: 100ms">
        <h2 class="lg-card__title">账号登录</h2>
        <p class="lg-card__desc">身份由账号决定，登录后自动进入对应工作台</p>

        <!-- 演示账号：devMode 是编译期常量，生产构建恒为 false → 不渲染、不请求；
             口令来自后端运行时下发，源码与包内均无明文账号 -->
        <div v-if="devMode && demoAccounts.length" class="lg-demo">
          <p class="lg-demo__cap">演示账号 · 点击自动填入（仅开发环境）</p>
          <div class="lg-demo__chips mot-stagger-pop">
            <button
              v-for="a in demoAccounts"
              :key="a.username"
              type="button"
              class="lg-demo__chip u-tap mot-tap mot-hover-lift"
              @click="fillDemo(a)"
            >
              {{ a.person }} · {{ a.roleLabel }}
            </button>
          </div>
        </div>

        <div class="lg-row">
          <label class="lg-label" for="lg-user">账号</label>
          <input
            id="lg-user"
            v-model="username"
            class="lg-input"
            :class="{ 'mot-shake': shakeOn }"
            type="text"
            autocomplete="username"
            placeholder="请输入账号"
            @keyup.enter="submit"
            @animationend="shakeOn = false"
          />
        </div>

        <div class="lg-row">
          <label class="lg-label" for="lg-pwd">密码</label>
          <input
            id="lg-pwd"
            v-model="password"
            class="lg-input"
            :class="{ 'mot-shake': shakeOn }"
            type="password"
            autocomplete="current-password"
            placeholder="请输入密码"
            @keyup.enter="submit"
            @animationend="shakeOn = false"
          />
        </div>

        <p v-if="errorMsg" class="lg-error" role="alert">{{ errorMsg }}</p>

        <button type="button" class="lg-submit mot-tap" :class="{ 'mot-press-loading': submitting }" :disabled="submitting" @click="submit">
          {{ submitting ? '登录中…' : '登录' }}
        </button>
      </section>

      <p class="lg-foot mot-fade-up" style="animation-delay: 200ms">店小C · 蒙牛 AI 巡店助手</p>
    </div>
  </div>
</template>

<style scoped>
/*
 * ★ 布局：外层是固定高度的路由视口（移动形态由 .mot-route-host overflow:hidden 裁剪，
 *   桌面形态即浏览器视口），
 *   本页自身承担纵向滚动；内容不足一屏时居中，超高时从顶部开始且可完整滚到底部，
 *   不再出现底部元素被裁掉的问题。
 */
.login-page {
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: var(--bg-page);
}

.login-inner {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 24px 16px 20px;
  box-sizing: border-box;
}

.lg-brand {
  text-align: center;
  flex: none;
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
  background: var(--bg-card);
  box-shadow: 0 8px 28px rgba(15, 39, 27, 0.1);
  box-sizing: border-box;
  flex: none;
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

/* 列放宽：两字标签 + 间距不再挤字 */
.lg-label {
  width: 44px;
  flex: none;
  font-size: 13px;
  color: var(--text-2, #4b5563);
}

.lg-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  /* 显式卡片表面：部分浏览器 UA 给文本框默认白底，深色全屏下会出现亮白输入条 */
  background: var(--bg-card);
  color: var(--text-1);
  font-size: 14px;
  /* 不写 outline:none —— 键盘焦点环由全局 :focus-visible 统一提供 */
  transition: border-color 0.18s ease;
}

.lg-input:focus {
  border-color: var(--mn-green, #009639);
}

/* iOS Safari：输入框字号 <16px 聚焦会自动放大整页；只在小屏真机抬到 16px，
   桌面手机壳内仍保持 14px 的紧凑观感（640px = 令牌 --bp-sm 口径） */
@media (max-width: 640px) {
  .lg-input {
    font-size: 16px;
  }
}

.lg-error {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--color-danger, #e02020);
}

/* ── 开发环境演示账号 chips ── */
.lg-demo {
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--info-bg, #eaf3fe);
}

.lg-demo__cap {
  margin-bottom: 8px;
  font-size: 11px;
  color: var(--info-fg, #1d4ed8);
}

.lg-demo__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.lg-demo__chip {
  /* 视觉高度约 32px，命中盒由 .u-tap 外扩到 ≥44px */
  padding: 6px 12px;
  border: 1px solid var(--color-info, #3b82f6);
  border-radius: 999px;
  background: var(--bg-card, #fff);
  color: var(--info-fg, #1d4ed8);
  font-size: 12px;
}

.lg-demo__chip:hover {
  background: var(--info-bg, #eaf3fe);
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
  transition:
    opacity 0.18s ease,
    transform 0.12s ease;
}

.lg-submit:hover {
  opacity: 0.92;
}

.lg-submit:disabled {
  opacity: 0.6;
  cursor: wait;
}

.lg-submit:active {
  transform: scale(0.99);
}

.lg-foot {
  margin: 0;
  text-align: center;
  font-size: 11px;
  color: var(--text-3, #6b7280);
  flex: none;
}
</style>
