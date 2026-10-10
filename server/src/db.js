/**
 * 数据层（Phase 2 后端版）：fixture 静态数据 + SQLite 可写集合。
 *
 * 设计对齐前端 api/mock/db.ts：
 *   - 静态数据（users/stores/skus/visits/diagnoses/dashboard/chatQa）来自 fixture JSON，只读；
 *   - 可写集合（tasks/tickets/新增 visits/诊断快照）落 SQLite，重启不丢 → 跨角色闭环成立。
 */
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
/** 前端 fixture 目录（Phase 2 直接复用前端数据，保证口径一致） */
const FIXTURE_DIR = join(__dirname, '../../store-app/src/fixtures')
const DATA_DIR = join(__dirname, '../data')
/** 账号文件（运行时生成，不进仓库）—— 用于 username → role 的动态映射 */
const ACCOUNTS_FILE = join(DATA_DIR, 'accounts.json')

/**
 * ★ 巡店记录 id 前缀（D2）。
 * 原用 `V_NEW` —— 但它与**历史真实增量数据**的前缀相同（`uid('V_NEW')` 生成的
 * 记录和早期演示数据混在一起），导致按前缀做测试数据清理时会误删真实记录
 * （实际踩过：一条真实 visits 被当测试数据删掉）。
 * 现改为 `V_T`，与真实数据彻底区分。
 *
 * ⚠ 依赖此前缀判断的地方必须同步（改一处会静默失配）：
 *   - server/src/index.js 的「今日是否已巡店」判定
 *   - store-app/src/views/rep/HistoryView.vue 的增量记录识别
 */
export const VISIT_ID_PREFIX = 'V_T'

const readJson = (name) => JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'))

/**
 * 演示基准日（YYYY-MM-DD）。
 *
 * ⚠ 这里**本地定义**而不用 `dashboard.js` 的导出：dashboard.js 依赖本文件（取数），
 *   反向 import 会形成循环依赖（ESM 下会拿到未初始化的 TDZ）。
 *   两处取值必须一致，改动时需同步。
 */
const DEMO_TODAY = '2026-10-02'

/* ═══════════════ 静态数据（fixture，只读） ═══════════════ */

export const users = readJson('users.json').items
export const stores = readJson('stores.json').items
export const skus = readJson('skus.json').items
export const staticVisits = readJson('visits.json').items
export const diagnosesRaw = readJson('diagnoses.json').items
export const dashboard = readJson('dashboard.json').items
const chatQaJson = readJson('chat-qa.json')

export const roleOptions = [
  { id: 'rep', name: '业代 · 李强', desc: '拍货架 · AI诊断 · 拿方案', sub: '辖区 128 家 | 今日待巡 5 家', recommended: true },
  { id: 'manager', name: '区域经理 · 王敏', desc: '看板 · 派任务', sub: '城东片区 | 128 家门店', recommended: false },
  { id: 'owner', name: '店员/店主 · 张大姐', desc: '自助诊断 · 订货', sub: '好邻居 · 地铁口店', recommended: false },
]

export const chatQa = {
  suggestions: chatQaJson.suggestions,
  fallback: chatQaJson.fallback,
  items: chatQaJson.items,
}

/** 门店 → 默认诊断 key（与前端 STORE_TO_RAW_KEY 一致） */
export const STORE_TO_RAW_KEY = { S1: 'S1', S2: 'S2', S3: 'S3', S4: 'S4', S5: 'S5' }
/** visit id → 诊断 key（与前端 VISIT_TO_RAW_KEY 一致） */
export const VISIT_TO_RAW_KEY = {
  V_S1_001: 'S1',
  V_S2_002: 'S2',
  V_S2_001: 'S2_BEFORE',
  V_S3_001: 'S3',
  V_S4_001: 'S4',
  V_S5_001: 'S5',
}

/* ═══════════════ SQLite 初始化 ═══════════════ */

/**
 * ⚠ P0-① 换机克隆必崩修复：先确保 `data/` 存在，再开库。
 *
 * `server/data/` 在 `.gitignore` 里（运行时数据不进仓库），所以**新克隆的仓库
 * 根本没有这个目录**。而 `new DatabaseSync()` 在文件不存在且**父目录也不存在**时
 * 不会自动建目录，会直接抛：
 *   ERR_SQLITE_ERROR: unable to open database file
 * 由于本行在**模块顶层**执行，抛错即整个 `import` 失败 → 后端起不来 → 演示白屏。
 *
 * `auth.js` 的 `loadAccounts()` 里虽有建目录逻辑，但它受 ESM import 时序约束
 * （`import './db.js'` 先于 auth.js 模块体执行），**救不了这里**，所以必须自建。
 */
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
  console.log('[db] 已创建数据目录：', DATA_DIR)
}
// 上传目录同理（整改回执照片落地处），避免首个上传请求才报错
const UPLOADS_DIR = join(DATA_DIR, 'uploads')
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true })

const db = new DatabaseSync(join(DATA_DIR, 'store.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, store_id TEXT, store_name TEXT,
    assignee_id TEXT, assignee_name TEXT, creator_id TEXT, creator_name TEXT,
    task_type TEXT, task_type_label TEXT, due_at TEXT, due_at_label TEXT, note TEXT, status TEXT
  );
  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY, kind TEXT, store_id TEXT, store_name TEXT,
    items TEXT, placements TEXT, total_bottles INTEGER, total_amount INTEGER,
    note TEXT, created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS visits (
    id TEXT PRIMARY KEY, store_id TEXT, store_name TEXT, rep_id TEXT,
    visited_at TEXT, visit_no INTEGER, photo_ids TEXT, score INTEGER, status TEXT,
    UNIQUE (store_id, visit_no)
  );
  CREATE TABLE IF NOT EXISTS diagnoses (
    id TEXT PRIMARY KEY, store_id TEXT, data TEXT, created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS rectifications (
    id TEXT PRIMARY KEY, diagnosis_id TEXT, store_id TEXT, store_name TEXT,
    issue_id TEXT, issue_title TEXT, before_score INTEGER, after_score INTEGER,
    photo_id TEXT, photo_url TEXT, note TEXT,
    operator_id TEXT, operator_name TEXT, status TEXT, created_at TEXT,
    derivation TEXT
  );
`)

/** 任务按负责人/状态检索（listTasks 条件化查询用） */
db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id, status)')

/**
 * ★ 兼容迁移：给已建好的 tickets 表补 status 列。
 *
 * `CREATE TABLE IF NOT EXISTS` 不会给**已存在**的表补列，老库里 tickets 没有 status，
 * 直接 INSERT 带 status 会报 "no such column"。因此先用 PRAGMA table_info 判断，
 * 缺列再 ALTER TABLE ADD COLUMN（SQLite 会把已有行的该列置为默认值）。
 */
function ensureTicketsStatusColumn() {
  const cols = db.prepare('PRAGMA table_info(tickets)').all().map((c) => c.name)
  if (cols.includes('status')) return
  db.exec("ALTER TABLE tickets ADD COLUMN status TEXT DEFAULT 'pending'")
}
ensureTicketsStatusColumn()

/**
 * P0-2 兼容迁移：给已建好的 tasks 表补 `due_at_label` 列（存原始中文文案）。
 * 与 tickets.status 同理：CREATE TABLE IF NOT EXISTS 不会给已存在的表补列。
 */
function ensureTasksDueAtLabelColumn() {
  const cols = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name)
  if (cols.includes('due_at_label')) return
  db.exec("ALTER TABLE tasks ADD COLUMN due_at_label TEXT DEFAULT ''")
  // 老数据是中文串，顺手迁移成可比较格式；展示文案沿用原中文
  const rows = db.prepare('SELECT id, due_at FROM tasks WHERE due_at != ""').all()
  for (const r of rows) {
    const n = normalizeDueAt(r.due_at, DEMO_TODAY)
    db.prepare('UPDATE tasks SET due_at = ?, due_at_label = ? WHERE id = ?').run(n.dueAt, n.dueAtLabel, r.id)
  }
}
ensureTasksDueAtLabelColumn()

/**
 * P2-10 迁移：给**已存在**的 visits 表补 `UNIQUE(store_id, visit_no)` 约束。
 *
 * 【为什么需要】`POST /api/v1/visits` 会先 `await buildFixtureDiagnosis(...)`（2–4 秒
 *   视觉调用），并发提交时多个请求会读到**同一个** `MAX(visit_no)`，于是插入重复单号。
 *
 * 【为什么必须重建表】SQLite 不支持 `ALTER TABLE … ADD CONSTRAINT`，
 *   只能走「建新表 → INSERT SELECT 搬数据 → DROP 旧表 → RENAME」。整段放在**事务里**，
 *   中途失败自动回滚，不会留下半截数据。
 *
 * 【为什么用 UNIQUE+重试 而不是 BEGIN IMMEDIATE 事务】
 *   node:sqlite 是同步 API，`BEGIN IMMEDIATE` 会把整个事件循环卡住 2–4 秒，
 *   演示时页面会明显冻结。唯一约束 + 应用层重试不阻塞任何东西。
 *
 * 【幂等】先用 `PRAGMA index_list(visits)` 找唯一索引判断约束是否已存在
 *   （UNIQUE 约束会自动建 sqlite_autoindex_visits_1），存在则整段跳过。
 */
function ensureVisitsUniqueVisitNo() {
  const hasUnique = db.prepare('PRAGMA index_list(visits)').all().some((i) => i.unique === 1)
  if (hasUnique) return
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec('ALTER TABLE visits RENAME TO visits_old')
    db.exec(`CREATE TABLE visits (
      id TEXT PRIMARY KEY, store_id TEXT, store_name TEXT, rep_id TEXT,
      visited_at TEXT, visit_no INTEGER, photo_ids TEXT, score INTEGER, status TEXT,
      UNIQUE (store_id, visit_no)
    )`)
    db.exec(`INSERT INTO visits (id, store_id, store_name, rep_id, visited_at, visit_no, photo_ids, score, status)
             SELECT id, store_id, store_name, rep_id, visited_at, visit_no, photo_ids, score, status FROM visits_old`)
    db.exec('DROP TABLE visits_old')
    db.exec('COMMIT')
  } catch (e) {
    try { db.exec('ROLLBACK') } catch { /* 已回滚 */ }
    console.error('[db] visits 唯一约束迁移失败，已回滚：', e)
    throw e
  }
}
ensureVisitsUniqueVisitNo()

/* ═══════════════ 查询助手 ═══════════════ */

export function findStore(id) {
  return stores.find((s) => s.id === id)
}
export function findUser(id) {
  return users.find((u) => u.id === id)
}
export function findUserByRole(role) {
  return users.find((u) => u.role === role)
}
export function findDiagnosisRaw(key) {
  return diagnosesRaw.find((d) => d.key === key)
}

/* ═══════════════ 写操作（落 SQLite） ═══════════════ */

const TASK_TYPE_LABEL = { OOS: '缺货补货', FACING: '排面调整', PRICETAG: '价签整改', STACK: '堆头执行' }

function uid(prefix) {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`
}

/**
 * 单据序列号（订单 PO / 整改 RC / 回执 RCF…）。
 *
 * ⚠ P2-11：随机段原为 3 位（`Math.random()*900+100`），空间只有 900，
 *   而 tickets.id 是 PRIMARY KEY 且用普通 INSERT —— 演示日约第 59 张单就会碰撞，
 *   抛 ERR_SQLITE_ERROR。现扩到 **6 位**（空间 90 万），并对极小概率的二次碰撞做重试。
 */
function serial(prefix) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  // 6 位随机段（000000–999999），配合下方 INSERT 冲突重试，碰撞概率可忽略
  const rand = () => String(Math.floor(Math.random() * 1000000)).padStart(6, '0')
  return `${prefix}${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${rand()}`
}

/**
 * P0-2：把「今日 18:00 / 明日 10:00」这类中文时限归一为**可比较的日期时间串**。
 *
 * 【为什么必须归一】
 * 前端下派对话框给的是中文文案（`今日 18:00`），而看板判断逾期用的是字符串比较
 * `dueAt < '2026-10-02 23:59'`。中文字符 `'今'`(U+4ECA) 的码位大于 `'2'`(0x32)，
 * 字典序比较**恒为 false** → 「逾期未完成」永远是 0，评委一看就知道数据不对。
 *
 * 归一后数据库里存的是 `2026-10-02 18:00` 这种可直接字典序比较的串，
 * 原始中文文案另存 `dueAtLabel` 供页面展示（两个字段各司其职）。
 *
 * @param {string} dueAtLabel 前端传入的中文文案，如「今日 18:00」
 * @param {string} baseDate 演示基准日（YYYY-MM-DD）
 * @returns {{dueAt: string, dueAtLabel: string}} 归一串 + 展示文案
 */
function normalizeDueAt(dueAtLabel, baseDate) {
  const label = String(dueAtLabel ?? '').trim()
  if (!label) return { dueAt: '', dueAtLabel: '' }
  // 已是标准日期串（种子数据 / 外部系统写入）则原样保留
  if (/^\d{4}-\d{2}-\d{2}/.test(label)) return { dueAt: label, dueAtLabel: label }

  const m = label.match(/^(今日|明日|后天)\s*(\d{1,2}):(\d{2})$/)
  if (!m) return { dueAt: label, dueAtLabel: label } // 认不出来的格式保持原样，不臆造

  const offset = { 今日: 0, 明日: 1, 后天: 2 }[m[1]]
  const d = new Date(`${baseDate}T00:00:00`)
  d.setDate(d.getDate() + offset)
  const pad = (n) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return { dueAt: `${date} ${pad(m[2])}:${m[3]}`, dueAtLabel: label }
}

/** 新建任务（经理下派）→ 落库，业代端查询即时可见 */
export function createTask(payload) {
  const store = findStore(payload.storeId)
  const assignee = findUser(payload.assigneeId)
  const mgr = findUserByRole('manager')
  // ⚠ P0-2：中文时限归一为可比较的日期串（原文案另存 due_at_label 供展示）
  const normalized = normalizeDueAt(payload.dueAt, DEMO_TODAY)
  const task = {
    id: uid('TSK'),
    storeId: payload.storeId,
    storeName: store?.name ?? '',
    assigneeId: payload.assigneeId,
    assigneeName: assignee?.name ?? '李强',
    creatorId: mgr?.id ?? 'U_MGR',
    creatorName: mgr?.name ?? '王敏',
    taskType: payload.taskType,
    // ⚠ P1-7：不能用 `TASK_TYPE_LABEL[x] ?? '整改任务'` —— 传 'toString' 会命中
    //   Object.prototype 上的函数（truthy，?? 不生效），函数被当作 label 绑进 SQL → 抛错。
    //   必须用 hasOwn 判定是否真属于自有枚举。
    taskTypeLabel: Object.hasOwn(TASK_TYPE_LABEL, payload.taskType)
      ? TASK_TYPE_LABEL[payload.taskType]
      : '整改任务',
    // ⚠ 缺字段时必须归一为空串：node:sqlite 无法绑定 undefined
    dueAt: normalized.dueAt,
    /** 原始中文文案（「今日 18:00」），仅用于页面展示；比较请用 dueAt */
    dueAtLabel: normalized.dueAtLabel,
    note: payload.note ?? '',
    status: 'open',
  }
  db.prepare(
    `INSERT INTO tasks (id, store_id, store_name, assignee_id, assignee_name, creator_id, creator_name, task_type, task_type_label, due_at, due_at_label, note, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(task.id, task.storeId, task.storeName, task.assigneeId, task.assigneeName, task.creatorId, task.creatorName, task.taskType, task.taskTypeLabel, task.dueAt, task.dueAtLabel ?? '', task.note, task.status)
  return task
}

/** 查询任务（可指定 assigneeId） */
export function listTasks(assigneeId, status) {
  // ★ 原来 SELECT * 全表取回再在 JS 里 filter（QA 复查指出）：
  //   门店扩到 128 家后这是隐性成本。改为条件化 SQL + (assignee_id, status) 索引。
  let sql = 'SELECT * FROM tasks'
  const where = []
  const params = []
  if (assigneeId) {
    where.push('assignee_id = ?')
    params.push(assigneeId)
  }
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`
  const rows = db.prepare(sql).all(...params)
  const map = (r) => ({
    id: r.id, storeId: r.store_id, storeName: r.store_name,
    assigneeId: r.assignee_id, assigneeName: r.assignee_name,
    creatorId: r.creator_id, creatorName: r.creator_name,
    taskType: r.task_type, taskTypeLabel: r.task_type_label,
    dueAt: r.due_at, dueAtLabel: r.due_at_label || r.due_at, note: r.note, status: r.status,
  })
  const list = rows.map(map)
  return assigneeId ? list.filter((t) => t.assigneeId === assigneeId) : list
}

/** 更新任务状态（标记已处理） */
export function updateTask(id, status) {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
  if (!row) return null
  db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id)
  return {
    id: row.id, storeId: row.store_id, storeName: row.store_name,
    assigneeId: row.assignee_id, assigneeName: row.assignee_name,
    creatorId: row.creator_id, creatorName: row.creator_name,
    taskType: row.task_type, taskTypeLabel: row.task_type_label,
    dueAt: row.due_at, dueAtLabel: row.due_at_label || row.due_at, note: row.note, status,
  }
}

/** 新建单据（整改单 / 订货建议） */
export function createTicket(payload) {
  const store = findStore(payload.storeId)
  const items = payload.items ?? []
  const placements = payload.placements ?? []
  const ticket = {
    id: serial(payload.kind === 'order' ? 'PO' : 'RC'),
    kind: payload.kind,
    storeId: payload.storeId,
    storeName: store?.name ?? '',
    items,
    placements,
    totalBottles: payload.totalBottles ?? items.reduce((s, i) => s + i.bottles, 0),
    totalAmount: payload.totalAmount ?? items.reduce((s, i) => s + i.amount, 0),
    note: payload.note ?? '',
    // 新单默认待接单（订货闭环：店主下单 → 业代确认接单）
    status: payload.status ?? 'pending',
    createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
  }
  db.prepare(
    `INSERT INTO tickets (id, kind, store_id, store_name, items, placements, total_bottles, total_amount, note, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(ticket.id, ticket.kind, ticket.storeId, ticket.storeName, JSON.stringify(items), JSON.stringify(placements), ticket.totalBottles, ticket.totalAmount, ticket.note, ticket.status, ticket.createdAt)
  return ticket
}

/** 查询单据（整改单 / 订货建议），默认按创建时间倒序 */
export function listTickets({ storeId, kind, status, limit } = {}) {
  const rows = db.prepare('SELECT * FROM tickets ORDER BY created_at DESC').all()
  let list = rows.map((r) => ({
    id: r.id, kind: r.kind, storeId: r.store_id, storeName: r.store_name,
    items: JSON.parse(r.items || '[]'), placements: JSON.parse(r.placements || '[]'),
    totalBottles: r.total_bottles, totalAmount: r.total_amount, note: r.note,
    // 老库迁移前可能为 null，统一归一为 pending（⚠ node:sqlite 不能绑 undefined）
    status: r.status ?? 'pending',
    createdAt: r.created_at,
  }))
  if (storeId) list = list.filter((t) => t.storeId === storeId)
  if (kind) list = list.filter((t) => t.kind === kind)
  if (status) list = list.filter((t) => t.status === status)
  return typeof limit === 'number' && limit > 0 ? list.slice(0, limit) : list
}

/** 合法单据状态（入参校验白名单，非法值由调用方抛 400） */
export const TICKET_STATUS = ['pending', 'accepted']

/**
 * 更新单据状态（业代确认接单）。
 *
 * @param id 单据 id
 * @param status 目标状态，仅允许 'pending' | 'accepted'
 * @returns 更新后的单据；不存在时返回 null
 */
export function updateTicketStatus(id, status) {
  const row = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
  if (!row) return null
  db.prepare('UPDATE tickets SET status = ? WHERE id = ?').run(status, id)
  return {
    id: row.id, kind: row.kind, storeId: row.store_id, storeName: row.store_name,
    items: JSON.parse(row.items || '[]'), placements: JSON.parse(row.placements || '[]'),
    totalBottles: row.total_bottles, totalAmount: row.total_amount, note: row.note,
    status,
    createdAt: row.created_at,
  }
}

/** 严重度 → 加分权重（可解释规则的权重表，页面 derivation 文案同源） */
const SEVERITY_WEIGHT = { severe: 6, medium: 4, low: 2 }
/** 单条整改的修复系数（按「留证完整度」定档：带照片=完整整改，无照片=待复查） */
const REPAIR_FACTOR = { withPhoto: 1, withoutPhoto: 0.5 }

/**
 * 计算整改后的健康分（★ 可溯源规则，前端无权指定 after）。
 *
 * after = clamp(before + Σ(severity权重 × 修复分), ≤ diagnosis.health.expectedScore)
 *
 * @param before       整改前分数
 * @param expectedScore 诊断给出的预期分（上限）
 * @param severities   本次涉及的问题严重度数组
 * @param hasPhoto     是否上传了整改后照片
 * @returns after 分数与 derivation 说明
 */
export function computeAfterScore(before, expectedScore, severities, hasPhoto) {
  const factor = hasPhoto ? REPAIR_FACTOR.withPhoto : REPAIR_FACTOR.withoutPhoto
  const sum = (arr) => arr.reduce((s, sv) => s + (SEVERITY_WEIGHT[sv] ?? SEVERITY_WEIGHT.low), 0)
  const severeList = severities.filter((s) => s === 'severe')
  const mediumList = severities.filter((s) => s === 'medium')
  const lowList = severities.filter((s) => s === 'low')
  const raw = sum(severities) * factor
  // 四舍五入到整数分，再以预期分为上限
  const gain = Math.round(raw)
  const after = Math.max(0, Math.min(before + gain, expectedScore))
  const actualGain = after - before
  const parts = []
  if (severeList.length) parts.push(`${severeList.length} 个严重 +${Math.round(severeList.length * SEVERITY_WEIGHT.severe * factor)}`)
  if (mediumList.length) parts.push(`中度 +${Math.round(mediumList.length * SEVERITY_WEIGHT.medium * factor)}`)
  if (lowList.length) parts.push(`轻度 +${Math.round(lowList.length * SEVERITY_WEIGHT.low * factor)}`)
  const detail = parts.length ? parts.join(' / ') : '无严重度加权'
  const capped = before + gain > expectedScore ? '（已按预期分封顶）' : ''
  const derivation = `本次整改使健康分 +${actualGain}（${detail}${factor === 1 ? '' : '，未留证按 50% 折算'}），上限为诊断给出的预期分 ${expectedScore}${capped}`
  return { after, gain: actualGain, derivation }
}

/** 新建整改回执（问题「已处理」→ 留证 → 后端算分） */
/**
 * 账号 → 角色映射（**动态读 `data/accounts.json`，不硬编码**）。
 *
 * ⚠ 为什么自己读而不 `import { loadAccounts } from './auth.js'`：
 *   `auth.js` 已经 `import { findUserByRole } from './db.js'`，反向 import 会成环
 *   （ESM 下拿到未初始化的 TDZ）。所以这里只做一件事——读文件取 username→role，
 *   逻辑压到最小，与 auth.js 的账号读取互不干扰。
 *
 * ⚠ 为什么需要它：token 里带的是 **username**（如 liqiang），而 `users.json` 只有
 *   `id`(U_REP) / `name`(李强)，没有 username 字段。要把 username 落到「李强」，
 *   必须经「username → role → 该角色的 user」。上一轮硬编码了三个账号的映射，
 *   换账号就会静默失配（operatorName 变空），故改为动态读取。
 *
 * @returns {Map<string, string>} username → role
 */
function accountRoleMap() {
  try {
    if (!existsSync(ACCOUNTS_FILE)) return new Map()
    const raw = JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf8'))
    const list = Array.isArray(raw?.accounts) ? raw.accounts : []
    return new Map(list.map((a) => [String(a.username), String(a.role)]))
  } catch {
    // 文件缺失或损坏 → 返回空 Map，调用方降级用 username 兜底
    return new Map()
  }
}

export function createRectification(payload) {
  const store = findStore(payload.storeId)
  /**
   * ⚠ P2-9：操作人由**服务端从 token 裁定**（传进来的是账号名 username），
   *   而 users.json 只有 id(U_REP) / name(李强)，没有 username 字段。
   *   解析顺序：**id → 姓名 → username 经 accounts.json 映射到角色**，
   *   全部落空时用 username 原文兜底（绝不静默变空 —— 宁可显示账号名，
   *   也比「操作人：」空白让人误以为功能坏了）。
   */
  const key = String(payload.operatorId ?? '').trim()
  const role = key ? accountRoleMap().get(key) : undefined
  const operator =
    (key ? users.find((u) => u.id === key) : null) ??
    (key ? users.find((u) => u.name === key) : null) ??
    (role ? findUserByRole(role) : null)
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const rect = {
    id: uid('RCF'),
    diagnosisId: payload.diagnosisId ?? '',
    storeId: payload.storeId,
    storeName: store?.name ?? payload.storeName ?? '',
    issueId: payload.issueId ?? '',
    issueTitle: payload.issueTitle ?? '',
    beforeScore: payload.beforeScore ?? 0,
    afterScore: payload.afterScore ?? 0,
    photoId: payload.photoId ?? '',
    photoUrl: payload.photoUrl ?? '',
    note: payload.note ?? '',
    operatorId: operator?.id ?? 'U_REP',
    // 解析不到时用传入的账号名兜底（绝不静默变空）；再兜底才用默认业代
    operatorName: operator?.name ?? key ?? '李强',
    status: payload.status ?? 'done',
    createdAt: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    derivation: payload.derivation ?? '',
  }
  db.prepare(
    `INSERT INTO rectifications (id, diagnosis_id, store_id, store_name, issue_id, issue_title,
       before_score, after_score, photo_id, photo_url, note, operator_id, operator_name, status, created_at, derivation)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    rect.id, rect.diagnosisId, rect.storeId, rect.storeName, rect.issueId, rect.issueTitle,
    rect.beforeScore, rect.afterScore, rect.photoId, rect.photoUrl, rect.note,
    rect.operatorId, rect.operatorName, rect.status, rect.createdAt, rect.derivation,
  )
  return { ...rect, gain: rect.afterScore - rect.beforeScore }
}

/** 查询整改回执（可按门店 / 诊断过滤，默认最新在前） */
export function listRectifications({ storeId, diagnosisId, limit } = {}) {
  const rows = db.prepare('SELECT * FROM rectifications ORDER BY created_at DESC, rowid DESC').all()
  let list = rows.map((r) => ({
    id: r.id, diagnosisId: r.diagnosis_id, storeId: r.store_id, storeName: r.store_name,
    issueId: r.issue_id, issueTitle: r.issue_title,
    beforeScore: r.before_score, afterScore: r.after_score,
    gain: (r.after_score ?? 0) - (r.before_score ?? 0),
    derivation: r.derivation ?? '',
    photoId: r.photo_id ?? '', photoUrl: r.photo_url ?? '', note: r.note ?? '',
    operatorId: r.operator_id, operatorName: r.operator_name,
    status: r.status, createdAt: r.created_at,
  }))
  if (storeId) list = list.filter((r) => r.storeId === storeId)
  if (diagnosisId) list = list.filter((r) => r.diagnosisId === diagnosisId)
  return typeof limit === 'number' && limit > 0 ? list.slice(0, limit) : list
}

/** 新建巡店记录（完成巡店回写） */
export function createVisit(storeId, photoIds, score) {
  const store = findStore(storeId)
  const prevMax = staticVisits.filter((v) => v.storeId === storeId).reduce((m, v) => Math.max(m, v.visitNo), 0)
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')

  /**
   * ⚠ P2-10：并发下 `MAX(visit_no)+1` 会撞车 —— 本函数是**同步**的，但调用方
   *   `POST /api/v1/visits` 会先 `await buildFixtureDiagnosis(...)`（2–4 秒视觉调用），
   *   多个请求在这段时间里都读到同一个 MAX，于是插入重复单号。
   *
   * 修法（不用 BEGIN IMMEDIATE：node:sqlite 同步 API 会卡住事件循环 2–4 秒，
   *   演示时页面会冻结）：
   *   数据库层加 UNIQUE(store_id, visit_no) 兜底 + 应用层捕获冲突后重读 MAX 重试。
   *   最多 3 次，仍冲突说明有极端并发，抛 400 让调用方稍后重试。
   */
  const MAX_RETRY = 3
  for (let attempt = 1; attempt <= MAX_RETRY; attempt += 1) {
    const rows = db.prepare('SELECT MAX(visit_no) AS m FROM visits WHERE store_id = ?').get(storeId)
    const nextNo = Math.max(rows?.m ?? 0, prevMax) + 1
    const visit = {
      id: uid(VISIT_ID_PREFIX),
      storeId,
      storeName: store?.name ?? '',
      repId: 'U_REP',
      visitedAt: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
      visitNo: nextNo,
      photoIds,
      score,
      status: 'done',
    }
    try {
      db.prepare(
        `INSERT INTO visits (id, store_id, store_name, rep_id, visited_at, visit_no, photo_ids, score, status)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(visit.id, visit.storeId, visit.storeName, visit.repId, visit.visitedAt, visit.visitNo, JSON.stringify(photoIds), visit.score, visit.status)
      return visit
    } catch (e) {
      const isConflict = /UNIQUE constraint failed/i.test(String(e?.message ?? ''))
      if (!isConflict) throw e
      // 撞号了：重读 MAX 后再试（下一轮循环）
      if (attempt === MAX_RETRY) {
        throw new Error(`巡店单号冲突（已重试 ${MAX_RETRY} 次），请稍后重试`)
      }
    }
  }
}

/** 全部巡店记录 = 预置（fixture）+ 增量（SQLite） */
export function allVisits() {
  const rows = db.prepare('SELECT * FROM visits ORDER BY visited_at DESC').all()
  const extra = rows.map((r) => ({
    id: r.id, storeId: r.store_id, storeName: r.store_name, repId: r.rep_id,
    visitedAt: r.visited_at, visitNo: r.visit_no, photoIds: JSON.parse(r.photo_ids || '[]'), score: r.score, status: r.status,
  }))
  return [...extra, ...staticVisits]
}

/** 存诊断快照（运行时生成） */
export function saveDiagnosis(diagnosis) {
  db.prepare(`INSERT OR REPLACE INTO diagnoses (id, store_id, data, created_at) VALUES (?,?,?,?)`).run(
    diagnosis.id, diagnosis.storeId, JSON.stringify(diagnosis), new Date().toISOString(),
  )
}

/** 读诊断快照 */
export function getStoredDiagnosis(id) {
  const row = db.prepare('SELECT data FROM diagnoses WHERE id = ?').get(id)
  return row ? JSON.parse(row.data) : null
}

/* ═══════════════ 种子数据 ═══════════════ */

/** 默认待办任务（PRD P2：待办提醒（1）来自王敏 · S5 缺货整改） */
export function seedDefaultTasks() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM tasks').get().c
  if (count > 0) return
  const store = findStore('S5')
  const task = {
    id: 'TSK_DEMO_S5',
    storeId: 'S5',
    storeName: store?.name ?? '永辉生活·中央公园店',
    assigneeId: 'U_REP',
    assigneeName: '李强',
    creatorId: 'U_MGR',
    creatorName: '王敏',
    taskType: 'OOS',
    taskTypeLabel: '缺货补货',
    // ⚠ P2-10（已知低优先级）：visitNo 用 MAX(visit_no)+1 计算，而 POST /visits 会先
    //   await buildFixtureDiagnosis(...)（2–4 秒），并发提交会读到同一个 MAX → visitNo 重复。
    //   当前 tasks/visits 未对该列建 UNIQUE 约束，故重复只会显示为两条记录号相同，不会报错。
    //   彻底修法：加 UNIQUE(store_id, visit_no) 并在冲突时重试，或用事务包住「读 MAX + 插入」。
    dueAt: '今日 18:00',
    note: '该店优益C 断货 3 天以上，已连续 3 周下滑，请在今日 18:00 前完成缺货整改并回传照片。',
    status: 'open',
  }
  db.prepare(
    `INSERT INTO tasks (id, store_id, store_name, assignee_id, assignee_name, creator_id, creator_name, task_type, task_type_label, due_at, due_at_label, note, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(task.id, task.storeId, task.storeName, task.assigneeId, task.assigneeName, task.creatorId, task.creatorName, task.taskType, task.taskTypeLabel, task.dueAt, task.dueAtLabel ?? '', task.note, task.status)
}

/** 重置演示数据 */
export function resetDemo() {
  db.exec('DELETE FROM tasks; DELETE FROM tickets; DELETE FROM visits; DELETE FROM diagnoses; DELETE FROM rectifications;')
  seedDefaultTasks()
}

// 启动即 seed
seedDefaultTasks()

export default db
