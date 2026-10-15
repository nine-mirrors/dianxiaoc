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
CREATE TABLE IF NOT EXISTS ext_conv_reads (
  conv_id TEXT, user_id TEXT, read_at TEXT, PRIMARY KEY (conv_id, user_id)
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

// 公告种子（管理员端列表与三端「消息中心」共用同一批数据）
const SEED_ANNOUNCEMENTS = [
  { title: '双十一主推期冰柜纯净度专项抽查', content: '即日起至本月底，各片区对冰柜纯净度开展专项抽查：竞品占比过高的门店需当场沟通复位并拍照上报，连续两次不配合的门店将进入区域黑名单。', audience: 'rep', pinned: 1 },
  { title: '促销物料使用规范更新', content: '爆炸贴/跳跳卡单组排面不超过 2 张，不得遮挡价签与品牌主视觉；活动结束后 3 日内撤换完毕。请各位店长配合。', audience: 'all', pinned: 0 },
  { title: '临期品优先消化通知', content: '库存中距保质期不足 30 天的产品优先纳入当次补货扣减，不得新订同批次；盘点时请在备注中标注临期数量。', audience: 'owner', pinned: 0 },
]

/* 消息中心种子：一个组织公告频道 + 一个片区群 + 一个门店群。
   成员按**角色**登记（members=JSON 数组）——即该角色的登录账号都能看到并发言，
   这样三位演示账号（liqiang=rep / wangmin=manager / zhangdajie=owner）可直接对话。 */
const SEED_CONVERSATIONS = [
  { id: 'CNV_ORG', kind: 'org', title: '总部 · 公告频道', region: null, store_id: null, members: ['rep', 'manager', 'owner', 'admin'] },
  { id: 'CNV_REGION_EAST', kind: 'region', title: '城东片区 · 区域群', region: 'R_EAST', store_id: null, members: ['rep', 'manager', 'admin'] },
  { id: 'CNV_STORE_S3', kind: 'store', title: '好邻居 · 地铁口店', region: null, store_id: 'S3', members: ['rep', 'owner'] },
]

/** 种子消息行：[会话, 发送人账号, 姓名, 角色, 内容, 距今分钟数] */
const SEED_MESSAGE_ROWS = [
  ['CNV_ORG', 'wangmin', '王敏', 'manager', '本周重点：主推特仑苏·纯牛奶，冰柜纯净度专项抽查同步启动，请业代到店拍照上报。', 180],
  ['CNV_ORG', 'wangmin', '王敏', 'manager', '提醒：促销物料（爆炸贴/跳跳卡）单组排面不超过 2 张，活动结束后 3 日内撤换。', 96],
  ['CNV_REGION_EAST', 'wangmin', '王敏', 'manager', '城东片区今日红灯门店 3 家，李强你负责的跑一趟，重点看货架排面与冰柜纯净度。', 52],
  ['CNV_REGION_EAST', 'liqiang', '李强', 'rep', '收到，上午先去好邻居地铁口店，下午回鑫源便利店。', 41],
  ['CNV_STORE_S3', 'zhangdajie', '张大姐', 'owner', '小李，特仑苏 250 快卖完了，这次能多补两箱吗？', 26],
  ['CNV_STORE_S3', 'liqiang', '李强', 'rep', '好的张姐，这次盘点完就帮你把订货单提上去，按近 4 周动销大概多补 1 箱。', 18],
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
      // ⚠ 字段名必须用下划线版本（对象里就是 target_id/target_name）；
      //   曾误写成 camelCase（b.targetId）→ 取值恒为 undefined → 种子落库为 null。
      insert('ext_blacklist', { id: uid('BL'), type: b.type, target_id: b.target_id, target_name: b.target_name, reason: b.reason, level: b.level, status: 'active', created_at: t, created_by: operatorId })
    }
  }
  const sCount = ext.prepare('SELECT COUNT(*) c FROM ext_sku_rules').get().c
  if (!sCount) {
    for (const s of SEED_SKU_RULES) {
      // 同上：种子对象用下划线字段名，取值也须用下划线名
      insert('ext_sku_rules', { id: uid('SKR'), sku_code: s.sku_code, sku_name: s.sku_name, rule_type: s.rule_type, note: s.note, status: 'active', created_at: t, created_by: operatorId })
    }
  }

  // 公告
  const aCount = ext.prepare('SELECT COUNT(*) c FROM ext_announcements').get().c
  if (!aCount) {
    for (const a of SEED_ANNOUNCEMENTS) {
      insert('ext_announcements', { id: uid('ANN'), title: a.title, content: a.content, audience: a.audience, pinned: a.pinned, status: 'published', created_at: t, created_by: operatorId })
    }
  }

  // 消息中心：会话 + 首屏消息
  const cCount = ext.prepare('SELECT COUNT(*) c FROM ext_conversations').get().c
  if (!cCount) {
    for (const c of SEED_CONVERSATIONS) {
      insert('ext_conversations', {
        id: c.id, kind: c.kind, title: c.title, region: c.region, store_id: c.store_id,
        members: JSON.stringify(c.members), created_at: t, last_at: t,
      })
    }
    for (const [convId, senderId, senderName, senderRole, content, minsAgo] of SEED_MESSAGE_ROWS) {
      const createdAt = new Date(Date.now() - minsAgo * 60 * 1000).toISOString()
      insert('ext_messages', {
        id: uid('MSG'), conv_id: convId, sender_id: senderId, sender_name: senderName,
        sender_role: senderRole, kind: 'text', content, created_at: createdAt,
      })
      ext.prepare('UPDATE ext_conversations SET last_at=? WHERE id=?').run(createdAt, convId)
    }
  }

  seeded = true
}

/** 演示重置：清空所有扩展表（由 reset-data.mjs 调用后再 seed） */
export function resetExtData() {
  ext.exec(`
    DELETE FROM ext_accounts; DELETE FROM ext_blacklist; DELETE FROM ext_sku_rules;
    DELETE FROM ext_knowledge; DELETE FROM ext_announcements; DELETE FROM ext_announce_reads;
    DELETE FROM ext_conv_reads;
    DELETE FROM ext_conversations; DELETE FROM ext_messages; DELETE FROM ext_inventory;
    DELETE FROM ext_checkins; DELETE FROM ext_audit;
  `)
  seeded = false
  seedExtData()
}

seedExtData()
