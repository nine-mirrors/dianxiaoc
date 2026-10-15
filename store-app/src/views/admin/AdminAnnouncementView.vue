<script setup lang="ts">
/**
 * AdminAnnouncementView —— 公告发布（/admin/announcements）。
 *
 * 左：发布表单（标题 / 正文 / 面向角色 / 是否置顶）。
 * 右：已发布公告列表（已读人数 + 置顶标记 + 已读率，分母取 /admin/overview 的 accountCount）。
 *
 * ★ 发布成功后后端会自动向对应角色实时广播 `announcement:new`，三端消息中心即时收到。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import AdminShell from './AdminShell.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import { useToast } from '@/composables/useToast'
import {
  createAnnouncement,
  getAdminAnnouncements,
  getAdminOverview,
  type AnnouncementAudience,
  type AnnouncementItem,
} from '@/api/admin'

const toast = useToast()

const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  all: '全部角色',
  rep: '业代',
  owner: '店主',
  manager: '区域经理',
}
const AUDIENCE_OPTIONS: AnnouncementAudience[] = ['all', 'rep', 'owner', 'manager']

const loading = ref(true)
const items = ref<AnnouncementItem[]>([])
const accountCount = ref(0)

const form = reactive<{ title: string; content: string; audience: AnnouncementAudience; pinned: boolean }>({
  title: '',
  content: '',
  audience: 'all',
  pinned: false,
})
const submitting = ref(false)

const expandedId = ref<string>('')

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await getAdminAnnouncements()
    items.value = res.items
  } catch {
    toast.error('公告列表加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await load()
  try {
    const ov = await getAdminOverview()
    accountCount.value = ov.accountCount
  } catch {
    /* 分母取不到时已读率显示为 — */
  }
})

async function submit(): Promise<void> {
  if (submitting.value) return
  if (!form.title.trim() || !form.content.trim()) {
    toast.error('请填写公告标题与正文')
    return
  }
  submitting.value = true
  try {
    await createAnnouncement({
      title: form.title.trim(),
      content: form.content.trim(),
      audience: form.audience,
      pinned: form.pinned,
    })
    if (form.audience === 'all') {
      toast.success('已发布并向全端广播，三端消息中心实时送达')
    } else {
      toast.success(`已发布并实时送达 ${AUDIENCE_LABEL[form.audience]}端`)
    }
    Object.assign(form, { title: '', content: '', audience: 'all', pinned: false })
    await load()
  } catch {
    toast.error('公告发布失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

/** 已读率 = readCount / 账号总量（分母缺失时返回 null） */
function readRate(a: AnnouncementItem): number | null {
  if (!accountCount.value) return null
  return Math.round((a.readCount / accountCount.value) * 100)
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <AdminShell title="公告发布">
    <div class="an">
      <!-- ══ 左：发布表单 ══ -->
      <section class="an__form u-card">
        <header class="an__form-head">
          <h2 class="an__form-title"><AppIcon name="bell" :size="15" /> 发布新公告</h2>
          <span>发布即实时送达</span>
        </header>

        <label class="an__field">
          <span>公告标题 *</span>
          <input v-model="form.title" placeholder="如 双十一主推期冰柜纯净度专项抽查" maxlength="60" />
        </label>

        <label class="an__field">
          <span>正文 *</span>
          <textarea
            v-model="form.content"
            :rows="9"
            placeholder="支持多行排版，写清楚执行要求、时间范围与责任角色"
          />
        </label>

        <label class="an__field">
          <span>面向角色</span>
          <select v-model="form.audience">
            <option v-for="a in AUDIENCE_OPTIONS" :key="a" :value="a">{{ AUDIENCE_LABEL[a] }}</option>
          </select>
        </label>

        <label class="an__switch">
          <input v-model="form.pinned" type="checkbox" />
          <span class="an__switch-track"><span class="an__switch-knob" /></span>
          <span class="an__switch-label">置顶（在消息中心公告页优先展示）</span>
        </label>

        <p class="an__hint">
          <AppIcon name="zap" :size="14" />
          发布后后端将向{{ form.audience === 'all' ? '全部角色' : AUDIENCE_LABEL[form.audience] }}实时广播，对应端开着页面即可收到。
        </p>

        <button type="button" class="u-btn u-btn--primary an__submit" :disabled="submitting" @click="submit">
          <AppIcon name="send" :size="16" /> {{ submitting ? '发布中…' : '立即发布' }}
        </button>
      </section>

      <!-- ══ 右：已发布列表 ══ -->
      <section class="an__list u-card">
        <header class="an__list-head">
          <h2 class="an__list-title">已发布公告</h2>
          <span>共 {{ items.length }} 条 · 账号基数 {{ accountCount || '—' }}</span>
        </header>

        <div v-if="loading" class="an__loading">
          <SkeletonBlock v-for="i in 4" :key="i" height="86px" radius="12px" />
        </div>

        <template v-else>
          <ul class="an__items">
            <li v-for="a in items" :key="a.id" class="an__item" @click="expandedId = expandedId === a.id ? '' : a.id">
              <div class="an__item-head">
                <span v-if="a.pinned" class="an__pin">置顶</span>
                <b class="an__item-title">{{ a.title }}</b>
                <span class="an__aud">{{
                  a.audience === 'all' ? '全端广播' : AUDIENCE_LABEL[a.audience] + '端'
                }}</span>
              </div>
              <p class="an__item-body" :class="{ 'u-ellipsis-2': expandedId !== a.id }">{{ a.content }}</p>
              <div class="an__item-foot">
                <span class="an__time">{{ fmtTime(a.createdAt) }}</span>
                <span class="an__read">
                  已读 <b>{{ a.readCount }}</b> 人
                  <template v-if="readRate(a) !== null"> · 已读率 {{ readRate(a) }}%</template>
                </span>
              </div>
            </li>
          </ul>
          <EmptyState v-if="!items.length" icon="bell" title="暂无公告" desc="在左侧发布第一条公告，三端消息中心将实时收到" />
        </template>
      </section>
    </div>
  </AdminShell>
</template>

<style scoped>
.an {
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 14px;
  align-items: start;
}

/* ── 表单 ── */
.an__form {
  padding: 18px;
  position: sticky;
  top: 0;
}

.an__form-head,
.an__list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 14px;
}

.an__form-head span,
.an__list-head span {
  font-size: 11.5px;
  color: var(--text-3);
}

.an__form-title,
.an__list-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14.5px;
  font-weight: 700;
}

.an__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.an__field span {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.an__field input,
.an__field select,
.an__field textarea {
  padding: 9px 11px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--text-1);
  font-size: 13.5px;
  font-family: inherit;
}

.an__field input,
.an__field select {
  height: 38px;
}

.an__field textarea {
  resize: vertical;
  line-height: 1.65;
}

.an__field input:focus,
.an__field select:focus,
.an__field textarea:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--mn-green-light);
}

/* 开关 */
.an__switch {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 14px;
  cursor: pointer;
}

.an__switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.an__switch-track {
  position: relative;
  width: 42px;
  height: 24px;
  flex: none;
  border-radius: 999px;
  background: var(--border-strong);
  transition: background var(--dur-fast) ease;
}

.an__switch-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--bg-card);
  box-shadow: var(--sh-1);
  transition: transform var(--dur-fast) ease;
}

.an__switch input:checked + .an__switch-track {
  background: var(--brand);
}

.an__switch input:checked + .an__switch-track .an__switch-knob {
  transform: translateX(18px);
}

.an__switch input:focus-visible + .an__switch-track {
  outline: var(--focus-ring);
  outline-offset: 2px;
}

.an__switch-label {
  font-size: 12.5px;
  color: var(--text-2);
}

.an__hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--ai-mist);
  color: var(--ai-purple);
  font-size: 11.5px;
  line-height: 1.6;
}

.an__submit {
  width: 100%;
}

/* ── 列表 ── */
.an__list {
  padding: 18px;
}

.an__loading {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.an__items {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.an__item {
  padding: 13px 15px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  background: var(--bg-card);
  cursor: pointer;
  transition: box-shadow var(--dur-fast) ease;
}

.an__item:hover {
  box-shadow: var(--sh-2);
}

.an__item-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.an__pin {
  flex: none;
  padding: 1px 7px;
  border-radius: 5px;
  background: var(--warning-bg);
  color: var(--warning-fg);
  font-size: 10px;
  font-weight: 700;
}

.an__item-title {
  flex: 1;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.an__aud {
  flex: none;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--mn-green-light);
  color: var(--mn-green-dark);
  font-size: 10.5px;
  font-weight: 700;
}

.an__item-body {
  margin-top: 7px;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text-2);
}

.an__item-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 9px;
}

.an__time {
  font-size: 11px;
  color: var(--text-4);
}

.an__read {
  font-size: 11.5px;
  color: var(--text-3);
}

.an__read b {
  color: var(--brand-deep);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1024px) {
  .an {
    grid-template-columns: 1fr;
  }

  .an__form {
    position: static;
  }
}

@media (prefers-reduced-motion: reduce) {
  .an__switch-track,
  .an__switch-knob,
  .an__item {
    transition: none;
  }
}
</style>
