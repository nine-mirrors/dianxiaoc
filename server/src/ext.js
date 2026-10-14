/**
 * W2+ 扩展数据层（ext.js）—— 新增业务集合的存储与种子，集中一处。
 *
 * 为什么单独一个文件：db.js 是稳定核心（任务/单据/巡店/诊断），不动它，
 *   避免多个并行 Agent 改同一文件冲突。扩展功能（账号派发/黑名单/知识库/
 *   公告/消息/盘点/排行榜/价值看板/单店画像）全部在本文件建表 + 读写，
 *   用 node:sqlite 同步 API（与 db.js 一致）。
 *
 * 存储位置仍在 server/data/store.db（同一库，新表名带 ext_ 前缀避免碰撞）；
 * data/ 已在 .gitignore，演示数据每日由 reset-data.mjs 重置（本文件提供 resetExtData）。
 */
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '../data')
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

/**
 * 扩展层独立 ID 生成器（不反向依赖 db.js，避免核心↔扩展循环依赖）。
 * 形如 BL_ + 8 位时间基36 + 4 位随机，可读且碰撞概率可忽略。
 */
function uid(prefix) {
  const ts = Date.now().toString(36)
  const rnd = randomUUID().replace(/-/g, '').slice(0, 6)
  return `${prefix}_${ts}${rnd}`
}

const ext = new DatabaseSync(join(DATA_DIR, 'ext.db'))

/** 幂等建表：全部 IF NOT EXISTS，老库升级安全 */
ext.exec(`
CREATE TABLE IF NOT EXISTS ext_accounts (
  id TEXT PRIMARY KEY, username TEXT UNIQUE, password TEXT, name TEXT,
  role TEXT, region TEXT, store_id TEXT, status TEXT DEFAULT 'active',
  created_at TEXT, created_by TEXT
);
CREATE TABLE IF NOT EXISTS ext_blacklist (
  id TEXT PRIMARY KEY, type TEXT, target_id TEXT, target_name TEXT,
  reason TEXT, level TEXT, status TEXT DEFAULT 'active',
  created_at TEXT, created_by TEXT
);
CREATE TABLE IF NOT EXISTS ext_sku_rules (
  id TEXT PRIMARY KEY, sku_code TEXT, sku_name TEXT, rule_type TEXT,
  note TEXT, status TEXT DEFAULT 'active', created_at TEXT, created_by TEXT
);
CREATE TABLE IF NOT EXISTS ext_knowledge (
  id TEXT PRIMARY KEY, category TEXT, question TEXT, answer TEXT,
  tags TEXT, status TEXT DEFAULT 'active', created_at TEXT, updated_at TEXT, created_by TEXT
);
CREATE TABLE IF NOT EXISTS ext_announcements (
  id TEXT PRIMARY KEY, title TEXT, content TEXT, audience TEXT,
  pinned INTEGER DEFAULT 0, status TEXT DEFAULT 'published',
  created_at TEXT, created_by TEXT
);
CREATE TABLE IF NOT EXISTS ext_announce_reads (
  ann_id TEXT, user_id TEXT, read_at TEXT, PRIMARY KEY (ann_id, user_id)
);
CREATE TABLE IF NOT EXISTS ext_conversations (
  id TEXT PRIMARY KEY, kind TEXT, title TEXT, region TEXT, store_id TEXT,
  members TEXT, created_at TEXT, last_at TEXT
);
CREATE TABLE IF NOT EXISTS ext_messages (
  id TEXT PRIMARY KEY, conv_id TEXT, sender_id TEXT, sender_name TEXT,
  sender_role TEXT, kind TEXT DEFAULT 'text', content TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_msg_conv ON ext_messages(conv_id, created_at);
CREATE TABLE IF NOT EXISTS ext_inventory (
  id TEXT PRIMARY KEY, store_id TEXT, sku_code TEXT, sku_name TEXT,
  qty INTEGER, shelf_qty INTEGER, expire_at TEXT, note TEXT,
  created_at TEXT, rep_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_inv_store ON ext_inventory(store_id, created_at);
CREATE TABLE IF NOT EXISTS ext_checkins (
  id TEXT PRIMARY KEY, store_id TEXT, store_name TEXT, rep_id TEXT,
  lat REAL, lng REAL, addr TEXT, photo_id TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS ext_audit (
  id TEXT PRIMARY KEY, actor_id TEXT, actor_name TEXT, action TEXT,
  target TEXT, detail TEXT, created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_audit_time ON ext_audit(created_at);
`)

/* ───────────────────────────── 通用助手 ───────────────────────────── */

export function nowIso() {
  return new Date().toISOString()
}

export function newId(prefix) {
  return uid(prefix)
}

/** 通用插入助手：obj 键 → 列名；node:sqlite 不接受 undefined，统一转 null */
function insert(table, obj) {
  const cols = Object.keys(obj)
  const placeholders = cols.map(() => '?').join(',')
  const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`
  const vals = cols.map((c) => (obj[c] === undefined ? null : obj[c]))
  ext.prepare(sql).run(...vals)
  return obj.id
}

function rowToCamel(r) {
  if (!r) return r
  const out = {}
  for (const [k, v] of Object.entries(r)) {
    out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v
  }
  return out
}

export const extDb = ext
export { insert, rowToCamel }

/* ───────────────────────────── 审计 ───────────────────────────── */
export function writeAudit(actor, action, target, detail = '') {
  insert('ext_audit', {
    id: uid('AUD'),
    actor_id: actor?.id || actor?.username || '',
    actor_name: actor?.name || actor?.username || '',
    action,
    target: target || '',
    detail: typeof detail === 'string' ? detail : JSON.stringify(detail),
    created_at: nowIso(),
  })
}

/* ───────────────────────────── 种子（仅在表空时） ───────────────────────────── */

const SEED_KNOWLEDGE = [
  { category: '陈列标准', question: '蒙牛产品黄金陈列位有什么要求？', answer: '核心单品（特仑苏、纯牛奶、优益C）应占据货架视平线至腰位（约 70–140cm）黄金层，排面不少于同品类 30%，价签与商品一一对齐，堆头与端架优先陈列主推品与促销品。', tags: '陈列,黄金位,排面' },
  { category: '常见问题', question: '门店冷柜里蒙牛产品被竞品挤占到角落怎么办？', answer: '先拍照取证（带门店与价签），当场与店主沟通冰柜协议约定，把核心 SKU 复位到视平线层位；对拒不配合的门店登记到冰柜纯净度问题并上报经理，系统会跟进整改任务。', tags: '冰柜,竞品,陈列,沟通' },
  { category: '促销执行', question: '促销物料（爆炸贴/跳跳卡）应该怎么摆放？', answer: '物料应贴近对应促销商品、不遮挡价签与品牌主视觉；爆炸贴贴在主推品排面左侧，跳跳卡置于货架前沿居中，单组排面不超过 2 张以免喧宾夺主，活动结束后 3 日内撤换。', tags: '促销,物料,堆头' },
  { category: '库存订货', question: '怎么判断一家店该补多少货？', answer: '参考近 4 周日均动销与覆盖天数：建议补货量 = 日均销量 × 目标覆盖天数 − 当前库存 + 安全库存（按服务水平 90% 的波动缓冲）。店小C 会在诊断后自动给出可溯源的建议量，临期品优先消化不新订。', tags: '库存,订货,安全库存' },
  { category: '价签规范', question: '价签常见违规有哪些？', answer: '常见违规：价签缺失、价签与商品错位、促销价与系统价不一致、价签过期、竞品价签占用本品位。巡检时逐位核对，发现违规拍照标注并要求门店当日整改。', tags: '价签,违规,巡检' },
]

const SEED_BLACKLIST = [
  { type: 'store', target_id: 'S99', target_name: '盛源批发部（示例）', reason: '多次窜货、长期低价扰乱区域价盘', level: 'high' },
  { type: 'store', target_id: 'S98', target_name: '鑫源便利店（示例）', reason: '账期逾期、临期品处理记录异常', level: 'mid' },
]

const SEED_SKU_RULES = [
  { sku_code: 'YYC-450', sku_name: '优益C 原味 450ml', rule_type: 'ban_sale_below_cost', note: '不得低于进货价倾销，异常低价需上报' },
  { sku_code: 'TLS-250', sku_name: '特仑苏纯牛奶 250ml', rule_type: 'key_shelf', note: '核心 SKU，须保证黄金层不断货' },
]

let seeded = false
export function seedExtData({ operatorId = 'system', operatorName = '系统' } = {}) {
  if (seeded) return
  const t = nowIso()

  const kCount = ext.prepare('SELECT COUNT(*) c FROM ext_knowledge').get().c
  if (!kCount) {
    for (const k of SEED_KNOWLEDGE) {
      insert('ext_knowledge', { id: uid('KB'), category: k.category, question: k.question, answer: k.answer, tags: k.tags, status: 'active', created_at: t, updated_at: t, created_by: operatorId })
    }
  }
  const bCount = ext.prepare('SELECT COUNT(*) c FROM ext_blacklist').get().c
  if (!bCount) {
    for (const b of SEED_BLACKLIST) {
      insert('ext_blacklist', { id: uid('BL'), type: b.type, target_id: b.targetId, target_name: b.targetName, reason: b.reason, level: b.level, status: 'active', created_at: t, created_by: operatorId })
    }
  }
  const sCount = ext.prepare('SELECT COUNT(*) c FROM ext_sku_rules').get().c
  if (!sCount) {
    for (const s of SEED_SKU_RULES) {
      insert('ext_sku_rules', { id: uid('SKR'), sku_code: s.skuCode, sku_name: s.skuName, rule_type: s.ruleType, note: s.note, status: 'active', created_at: t, created_by: operatorId })
    }
  }
  seeded = true
}

/** 演示重置：清空所有扩展表（由 reset-data.mjs 调用后再 seed） */
export function resetExtData() {
  ext.exec(`
    DELETE FROM ext_accounts; DELETE FROM ext_blacklist; DELETE FROM ext_sku_rules;
    DELETE FROM ext_knowledge; DELETE FROM ext_announcements; DELETE FROM ext_announce_reads;
    DELETE FROM ext_conversations; DELETE FROM ext_messages; DELETE FROM ext_inventory;
    DELETE FROM ext_checkins; DELETE FROM ext_audit;
  `)
  seeded = false
  seedExtData()
}

seedExtData()
