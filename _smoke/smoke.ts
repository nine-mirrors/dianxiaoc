/**
 * 交付前冒烟测试（不属于交付物，仅用于验证数据管道）。
 *
 * 校验点：
 *  1. P2 今日巡店：5 家店 / 已完成 2 / 平均 85.5 / 待办 1 条
 *  2. P4 诊断：S3 = 72 分 / 良好 / 6 维度 / 14 标注框 / 4 问题 / 27 瓶 ¥108 / 36 瓶 ¥144
 *  3. AI 对话：6 个快捷问题全部命中对应答案；乱输入走兜底
 *  4. 陌生照片兜底：不白屏、返回合法分数
 *  5. 单据与任务：生成整改单 / 经理下派任务
 */

// ── Node 环境桩（localStorage / window）──
const memStore: Record<string, string> = {}
;(globalThis as any).localStorage = {
  getItem: (k: string) => (k in memStore ? memStore[k] : null),
  setItem: (k: string, v: string) => {
    memStore[k] = v
  },
  removeItem: (k: string) => {
    delete memStore[k]
  },
}
;(globalThis as any).window = {
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (id: any) => clearTimeout(id),
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
}

import {
  createDiagnosis,
  getDiagnosis,
  getTodayRoute,
  postChat,
  getChatSuggestions,
  createTicket,
  createTask,
  getTasks,
  getDashboardOverview,
  getVisits,
} from '@/api'

/** 断言工具 */
let pass = 0
let fail = 0
function ok(name: string, cond: boolean, extra = ''): void {
  if (cond) {
    pass += 1
    console.log(`  ✅ ${name}${extra ? ' — ' + extra : ''}`)
  } else {
    fail += 1
    console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`)
  }
}

async function main(): Promise<void> {
  console.log('\n【1】P2 今日巡店')
  const today = await getTodayRoute('U_REP')
  ok('门店数 5', today.routeStores.length === 5, `实际 ${today.routeStores.length}`)
  ok('已完成 2', today.summary.done === 2, `实际 ${today.summary.done}`)
  ok('平均健康分 85.5', today.summary.avgScore === 85.5, `实际 ${today.summary.avgScore}`)
  ok('待办 1 条（S5 来自王敏）', today.todoTasks.length === 1 && today.todoTasks[0].creatorName === '王敏')
  const s2 = today.routeStores.find((r) => r.store.id === 'S2')
  ok('S2 展示 48 → 80 (+32)', !!s2 && s2.store.prevScore === 48 && s2.store.lastScore === 80)

  console.log('\n【2】P4 诊断（S3 主线店）')
  const res = await createDiagnosis({ storeId: 'S3', photoIds: ['P_S3_COLD'], shootTypes: ['cold'] })
  const d = res.diagnosis
  ok('健康分 72', d.health.score === 72, `实际 ${d.health.score}`)
  ok('分档 良好', d.health.level === 'good', d.health.level)
  ok('分档色 #8BC34A', d.health.color === '#8BC34A', d.health.color)
  ok('预期分 89（+17）', d.health.expectedScore === 89 && d.health.expectedScore - d.health.score === 17)
  ok('6 维度', d.dimensions.length === 6, d.dimensions.map((x) => `${x.name}${x.score}`).join(' '))
  ok(
    '维度分 76/68/70/62/82/85',
    d.dimensions.map((x) => x.score).join(',') === '76,68,70,62,82,85',
    d.dimensions.map((x) => x.score).join(','),
  )
  ok('标注框 14 个', d.annotations.length === 14, `实际 ${d.annotations.length}`)
  ok(
    '标注坐标全为 0–100 百分比',
    d.annotations.every((a) => a.x >= 0 && a.x <= 100 && a.y >= 0 && a.w > 0 && a.h > 0),
  )
  ok('识别摘要 14 项', d.summary.total === 14 && d.summary.text.includes('蒙牛SKU 8 项'))
  ok('问题 4 条（2 严重 + 2 中度）', d.issues.length === 4 && d.issues.filter((i) => i.severity === 'severe').length === 2)
  ok('问题按严重度排序', d.issues[0].severity === 'severe' && d.issues[3].severity === 'medium')
  ok('风险 本周 27 瓶 / ¥108', d.risk.weeklyBottles === 27 && d.risk.weeklyAmount === 108)
  ok('风险 月度 117 瓶 / ¥468', d.risk.monthlyBottles === 117 && d.risk.monthlyAmount === 468)
  ok('推导依据含算式', d.risk.derivation.includes('37.5%') && d.risk.derivation.includes('3.9'))
  ok('行动方案 36 瓶 / ¥144 / 3 天', d.plan.totalBottles === 36 && d.plan.totalAmount === 144 && d.plan.coverDays === 3)
  ok('方案含 3 项补货 + 2 项陈列', d.plan.restock.length === 3 && d.plan.placement.length === 2)
  ok('分步加载 5 步', d.steps.length === 5)
  ok('GET /diagnoses/:id 可回读', (await getDiagnosis(d.id)).diagnosis.health.score === 72)

  console.log('\n【3】S2 整改前（48 分权威值兜底）')
  const before = (await getDiagnosis('D_S2_BEFORE')).diagnosis
  ok('S2 整改前展示 48 分（非公式 45.5）', before.health.score === 48, `实际 ${before.health.score}`)
  const after = (await getDiagnosis('D_S2')).diagnosis
  ok('S2 整改后 80 分 · 环比 +32', after.health.score === 80 && after.health.delta === 32)

  console.log('\n【4】AI 多轮追问')
  const chips = await getChatSuggestions(d.id)
  ok('快捷问题 6 个', chips.suggestions.length === 6)
  for (const q of chips.suggestions) {
    const r = await postChat({ diagnosisId: d.id, message: q, history: [] })
    ok(`命中「${q}」`, !!r.answerId && r.reply.length > 30, `answerId=${r.answerId}`)
  }
  const q2 = await postChat({ diagnosisId: d.id, message: '该补多少', history: [] })
  ok('Q2 引用 36 瓶 ¥144', q2.reply.includes('36 瓶') && q2.reply.includes('¥144'))
  ok('Q2 联动高亮行动方案', q2.highlightSection === 'plan')
  const q1 = await postChat({ diagnosisId: d.id, message: '为什么这个位置不好', history: [] })
  ok('Q1 引用 1.2–1.6m 黄金层', q1.reply.includes('1.2–1.6m'))
  const miss = await postChat({ diagnosisId: d.id, message: '今天天气怎么样啊', history: [] })
  ok('乱输入走兜底并给 3 个推荐', !miss.answerId && (miss.suggestions?.length ?? 0) === 3)
  const empty = await postChat({ diagnosisId: d.id, message: '', history: [] })
  ok('空输入走兜底', !empty.answerId && empty.reply.includes('可以试试问我'))

  console.log('\n【5】陌生照片兜底（不白屏不报错）')
  const fb = await createDiagnosis({ storeId: 'S3', photoIds: [], shootTypes: ['cold'], unknownPhoto: true })
  const f = fb.diagnosis
  ok('分数 0–100 合法', f.health.score >= 0 && f.health.score <= 100, `实际 ${f.health.score}`)
  ok('仍有标注框与问题', f.annotations.length > 0 && f.issues.length > 0)
  ok('来源标记为 computed', f.health.source === 'computed')

  console.log('\n【6】单据 / 任务 / 看板')
  const tk = await createTicket({
    kind: 'rectification',
    storeId: 'S3',
    items: d.plan.restock,
    placements: d.plan.placement,
    totalBottles: d.plan.totalBottles,
    totalAmount: d.plan.totalAmount,
    note: '测试',
  })
  ok(
    '生成整改单（合计沿用权威值 36 瓶 ¥144）',
    tk.ticket.id.startsWith('RC') && tk.ticket.totalBottles === 36 && tk.ticket.totalAmount === 144,
    `${tk.ticket.totalBottles} 瓶 ¥${tk.ticket.totalAmount}`,
  )

  const task = await createTask({
    storeId: 'S5',
    taskType: 'OOS',
    dueAt: '今日 18:00',
    note: '测试下派',
    assigneeId: 'U_REP',
  })
  const tasks = await getTasks('U_REP')
  ok('经理下派 → 业代待办可见', tasks.tasks.some((t) => t.id === task.task.id), `共 ${tasks.tasks.length} 条`)

  const ov = await getDashboardOverview('R_EAST')
  ok('看板 KPI 4 张', ov.overview.kpis.length === 4)
  ok('看板健康分 74.3', ov.overview.kpis[0].value === '74.3')
  ok('看板分档 42/53/21/12', ov.overview.distribution.map((b) => b.count).join(',') === '42,53,21,12')
  ok('看板趋势 3 指标 × 8 周', ov.overview.trend.length === 3 && ov.overview.trend[0].points.length === 8)

  const vs = await getVisits({ limit: 20 })
  ok('巡店记录可查', vs.visits.length >= 6, `实际 ${vs.visits.length}`)

  console.log(`\n══════ 结果：通过 ${pass} / 失败 ${fail} ══════\n`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('冒烟测试异常：', e)
  process.exit(1)
})
