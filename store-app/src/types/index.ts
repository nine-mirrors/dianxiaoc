/**
 * 全量实体与 DTO 类型 —— 单一出处（ARCHITECTURE §3.2）。
 *
 * ⚠ 本文件即「将来 Express 后端的数据契约」：字段名、枚举取值在 Phase 2 中一字不改。
 * 与 src/fixtures/*.json 的字段保持一致，由全局一致性审查保证。
 */

/* ════════════════════ 基础枚举 ════════════════════ */

/** 系统角色 */
export type Role = 'rep' | 'manager' | 'owner' | 'admin'

/** 门店类型：A连锁超市 / B大卖场·社区生鲜 / C便利店 */
export type StoreType = 'A' | 'B' | 'C'

/** 拍摄部位 */
export type ShootType = 'cold' | 'ambient' | 'stack'

/** 问题严重度：严重 / 中度 / 轻度 */
export type Severity = 'severe' | 'medium' | 'low'

/** 健康分档位 */
export type HealthLevelKey = 'excellent' | 'good' | 'warning' | 'risk'

/** 巡店状态 */
export type VisitStatus = 'done' | 'pending' | 'alert'

/** 任务类型 */
export type TaskType = 'OOS' | 'FACING' | 'PRICETAG' | 'STACK'

/** 任务状态 */
export type TaskStatus = 'open' | 'done'

/** 对话角色 */
export type ChatRole = 'user' | 'ai'

/** 标注框图层：决定框色与线型（见 ARCHITECTURE §8.4） */
export type AnnotationLayer = 'mengniu' | 'oos' | 'empty' | 'competitor' | 'pricetag' | 'stack'

/** 单据类型：整改单 / 订货建议 */
export type TicketKind = 'rectification' | 'order'

/** 健康分来源：fixture 权威值 / 公式计算（兜底路径） */
export type HealthSource = 'fixture' | 'computed'

/* ════════════════════ 主数据 ════════════════════ */

/** 用户（三角色固定演示账号） */
export interface User {
  id: string
  name: string
  role: Role
  avatarText: string
  /** 一句职责说明，P1 角色卡用 */
  duty: string
  /** 副信息，如「辖区 128 家 · 今日待巡 5 家」 */
  sub: string
  regionId?: string
}

/** P1 角色卡展示模型（GET /meta/roles） */
export interface RoleOption {
  id: Role
  name: string
  desc: string
  sub: string
  recommended: boolean
}

/** 门店陈列标准 */
export interface ShelfStandard {
  /** 冷柜标准列数 */
  coldCols: number
  /** 常温架标准列数 */
  ambientCols: number
  /** 堆头数量 */
  stacks: number
}

/** 门店照片 */
export interface Photo {
  id: string
  type: ShootType
  url: string
  caption?: string
}

/** 门店 */
export interface Store {
  id: string
  name: string
  /** 所属片区（P5 看板按区域过滤的依据） */
  regionId?: string
  type: StoreType
  /** 如「C类便利店」 */
  typeLabel: string
  address: string
  ownerName: string
  distanceKm: number
  standard: ShelfStandard
  /** ★ 换图只改这里的 url */
  photos: Photo[]
  lastScore: number
  /** 有值则显示 '48 → 80 (+32)' */
  prevScore?: number
  /** S5 红点告警 */
  alert?: boolean
  /** 门店坐标（P2 巡店地图用） */
  lat?: number
  lng?: number
}

/** SKU 主数据（含竞品） */
export interface SKU {
  id: string
  name: string
  /** 品牌：蒙牛 / 竞品品牌名 */
  brand: string
  spec: string
  guidePrice: number
}

/* ════════════════════ 巡店与诊断 ════════════════════ */

/** 巡店记录 */
export interface Visit {
  id: string
  storeId: string
  storeName: string
  repId: string
  visitedAt: string
  visitNo: number
  photoIds: string[]
  score: number
  status: VisitStatus
}

/** P2 线路上的门店（= Store + 当次状态） */
export interface RouteStore {
  store: Store
  /** 线路序号 ①–⑤ */
  order: number
  status: VisitStatus
  /** 已完成时的巡店 id，用于进入 P4 只读态 */
  visitId?: string
  /** 是否为整改复查店（S2） */
  isReview?: boolean
}

/** AI 识别摘要 */
export interface RecognitionSummary {
  /** 识别项总数 14 */
  total: number
  skuCount: number
  emptyCount: number
  competitorCount: number
  priceTagCount: number
  stackCount: number
  text: string
}

/**
 * 标注框。
 * x / y / w / h 均为 0–100 的相对百分比（相对图片自身宽高），原点左上角。
 * ★ 与像素尺寸完全解耦：换实拍图只调 fixture 坐标，不动任何组件代码。
 */
export interface Annotation {
  id: string
  layer: AnnotationLayer
  x: number
  y: number
  w: number
  h: number
  label: string
  skuId?: string
}

/** 六维度之一 */
export interface DimensionScore {
  key: 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6'
  name: string
  weight: number
  score: number
  level: HealthLevelKey
}

/** 健康分（含双轨来源标记） */
export interface HealthScore {
  score: number
  level: HealthLevelKey
  color: string
  /** 环比 ± */
  delta: number
  /** 执行建议后的预期分（PRD 21：预计提升 +17） */
  expectedScore: number
  source: HealthSource
}

/** 问题项 */
export interface Issue {
  id: string
  severity: Severity
  title: string
  location: string
  impact?: string
  actions?: string[]
  /** ★ 与标注框双向高亮联动 */
  relatedAnnotationIds: string[]
}

/** 风险预判明细项 */
export interface RiskItem {
  skuId: string
  skuName: string
  /** 近 4 周日均动销（瓶/天） */
  dailyAvgSales: number
  /** 标准排面列数 */
  stdFacings: number
  /** 实际有效列数 */
  actualFacings: number
  /** 排面缺口占比 */
  gapRatio: number
  /** 缺货严重度调整系数（缺口≤20%→0.7 / 20%–50%→0.95 / >50%→1.4） */
  elasticity: number
  /** 日均潜在损失（瓶） */
  dailyLossBottles: number
  /** 单瓶零售指导价 */
  unitPrice: number
}

/** 风险预判 */
export interface RiskPrediction {
  weeklyBottles: number
  weeklyAmount: number
  monthlyBottles: number
  monthlyAmount: number
  items: RiskItem[]
  /** ★「推导依据」展开区文本（含算式与假设） */
  derivation: string
}

/** 补货项 */
export interface RestockItem {
  skuId: string
  skuName: string
  bottles: number
  amount: number
}

/** 陈列调整项 */
export interface PlacementItem {
  text: string
}

/** 千店千面行动方案 */
export interface ActionPlan {
  storeTypeLabel: string
  restock: RestockItem[]
  placement: PlacementItem[]
  totalBottles: number
  totalAmount: number
  coverDays: number
}

/** AI 分步加载步骤 */
export interface Step {
  text: string
  delayMs: number
}

/** 诊断结果（P4 全量） */
export interface Diagnosis {
  id: string
  visitId?: string
  storeId: string
  storeName: string
  createdAt: string
  visitNo: number
  /** 本次用于识别的照片主图 */
  photoUrl: string
  shootTypes: ShootType[]
  steps: Step[]
  summary: RecognitionSummary
  annotations: Annotation[]
  dimensions: DimensionScore[]
  health: HealthScore
  issues: Issue[]
  risk: RiskPrediction
  plan: ActionPlan
  /**
   * 视觉识别置信度 = 采信视觉的层数 / fixture 层总数（阶段 B）。
   * 未走视觉识别时不返回此字段。
   */
  visionConfidence?: number
  /**
   * 阶段 C：算法复核与门店基线的差异说明。
   * 当算法结果与已定稿口径不一致时，此处写明「采用哪个、为什么」。
   */
  algoNote?: string
  /**
   * ★ Agent 工作链真实轨迹（P0-1）：本次诊断实际执行的步骤链
   * 视觉大模型 → MCP 进销存 → 六维引擎 → 预测补货 → LLM 表达。
   */
  agentTrace?: AgentTraceStep[]
}

/** Agent 工作链单步（内容全部来自后端真实执行，前端只负责展示） */
export interface AgentTraceStep {
  /** 步骤标识：vision / mcp / score / forecast / llm */
  key: 'vision' | 'mcp' | 'score' | 'forecast' | 'llm' | string
  /** 步骤标题 */
  title: string
  /** 能力类型：llm 大模型 / tool 外部工具(MCP) / algorithm 规则算法 */
  kind: 'llm' | 'tool' | 'algorithm' | string
  /** 真实来源（模型名 / 工具名 / 引擎名） */
  source: string
  /** done 完成 / fallback 降级 / ready 待触发（LLM 在追问时才跑） */
  status: 'done' | 'fallback' | 'ready' | string
  /** 一句话真实结论（取自该步真实输出） */
  detail: string
  /** 该步关键指标（结构随步骤不同，组件按已知 key 渲染） */
  meta?: Record<string, unknown>
  /** 耗时毫秒（0 表示本地同步计算或未计） */
  ms?: number
}

/* ════════════════════ 任务 / 单据 / 对话 ════════════════════ */

/** 待办任务（经理下派 → 业代可见） */
export interface Task {
  id: string
  storeId: string
  storeName: string
  assigneeId: string
  assigneeName: string
  creatorId: string
  creatorName: string
  taskType: TaskType
  taskTypeLabel: string
  dueAt: string
  /** 原始中文时限文案（「今日 18:00」），仅用于展示；比较用 dueAt */
  dueAtLabel?: string
  note: string
  status: TaskStatus
}

/** 单据状态：pending 待接单 / accepted 已确认接单 */
export type TicketStatus = 'pending' | 'accepted'

/** 整改单 / 订货建议 */
export interface Ticket {
  id: string
  kind: TicketKind
  storeId: string
  storeName: string
  items: RestockItem[]
  placements: PlacementItem[]
  totalBottles: number
  totalAmount: number
  note: string
  /** pending 待接单 / accepted 已接单（业代确认后回执） */
  status: TicketStatus
  createdAt: string
}

/** 整改回执（问题清单「已处理」→ 留证 → 后端算分，闭环可溯源） */
export interface Rectification {
  id: string
  diagnosisId: string
  storeId: string
  storeName: string
  issueId: string
  issueTitle: string
  /** 整改前健康分 */
  beforeScore: number
  /** 整改后健康分（后端按 severity 权重 × 修复分 计算，并以预期分为上限） */
  afterScore: number
  /** 提升分 = afterScore - beforeScore */
  gain: number
  /** 可溯源的加分说明（页面直接展示，回答「凭什么加分」） */
  derivation: string
  photoId: string
  photoUrl: string
  note: string
  operatorId: string
  operatorName: string
  status: RectifyStatus
  createdAt: string
}

/** 整改回执状态：done 已留证 / pending 待复查 */
export type RectifyStatus = 'done' | 'pending'

/** 创建整改回执的入参 */
export interface CreateRectificationPayload {
  diagnosisId: string
  issueId: string
  issueTitle: string
  severity: Severity
  /** 整改后照片（base64，含 data:image/... 前缀）；走统一上传通道落盘 */
  photo?: string
  filename?: string
  note?: string
}

/** 对话消息 */
export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  /**
   * 该条 AI 内容的真实来源（由后端 SSE done 帧给出）：
   * llm=大模型生成 / fallback=本地规则兜底 / null=未拿到（网络失败）。
   * undefined 表示流式输出进行中，前端按「AI 巡检助手」中性角标展示，结束后回填。
   */
  source?: 'llm' | 'fallback' | null
}

/** AI 回复 */
export interface ChatReply {
  reply: string
  answerId?: string
  /** 命中带有页面联动的问答时返回，前端滚动到对应区块 */
  highlightSection?: 'plan' | 'risk'
  suggestions?: string[]
}

/* ════════════════════ 看板（P5） ════════════════════ */

export interface Kpi {
  key: string
  label: string
  value: string
  delta: string
  trend: 'up' | 'down'
  target?: string
  /** 红灯门店卡用红色数字 + 脉冲点 */
  danger?: boolean
}

export interface LevelBucket {
  level: HealthLevelKey
  label: string
  count: number
  ratio: number
  color: string
}

export type TrendKey = 'score' | 'oosRate' | 'coverage'

export interface TrendSeries {
  key: TrendKey
  name: string
  points: number[]
  weeks: string[]
  unit: string
}

export interface RiskStore {
  storeId: string
  storeName: string
  score: number
  level: HealthLevelKey
  reason: string
}

export interface StoreRow {
  storeId: string
  storeName: string
  score: number
  level: HealthLevelKey
  mainIssue: string
  weekDelta: number
  visitId?: string
}

export interface DashboardOverview {
  regionId: string
  regionIds: { id: string; name: string }[]
  kpis: Kpi[]
  distribution: LevelBucket[]
  trend: TrendSeries[]
  riskTop5: RiskStore[]
  storeRows: StoreRow[]
  /** 整改闭环聚合（P5「整改闭环」卡片，一次请求拿全） */
  rectification: RectificationSummary
  /** 订货汇总聚合（P5「本周订货汇总」卡片，一次请求拿全） */
  orderSummary: OrderSummary
}

/** 整改闭环聚合：已整改条目 / 进行中任务 / 平均提升分 */
export interface RectificationSummary {
  /** 已留证条目数 */
  done: number
  /** 进行中任务数（open 待办） */
  open: number
  /** 平均提升分（保留 1 位小数） */
  avgGain: number
}

/** 订货汇总聚合（P5「本周订货汇总」卡片，随看板一次请求带回） */
export interface OrderSummary {
  /** 订货笔数 */
  count: number
  /** 订货瓶数 */
  bottles: number
  /** 订货金额 */
  amount: number
  /** 已确认接单笔数 */
  accepted: number
  /** 待接单笔数 */
  pending: number
}

/* ════════════════════ P2 首页 ════════════════════ */

export interface TodaySummary {
  total: number
  done: number
  avgScore: number
  avgDelta: number
}

export interface TodayRoute {
  date: string
  weather: string
  summary: TodaySummary
  todoTasks: Task[]
  routeStores: RouteStore[]
}

/* ════════════════════ 统一响应信封 ════════════════════ */

export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

/* ════════════════════ 接口入参 ════════════════════ */

export interface CreateVisitPayload {
  storeId: string
  photoIds: string[]
  shootTypes: ShootType[]
  checkin: { lat: number; lng: number; at: string }
}

export interface CreateDiagnosisPayload {
  storeId: string
  photoIds: string[]
  shootTypes: ShootType[]
  /** true = 陌生照片，走 domain 公式兜底路径 */
  unknownPhoto?: boolean
}

export interface ChatPayload {
  diagnosisId: string
  message: string
  history: ChatMessage[]
}

export interface CreateTicketPayload {
  kind: TicketKind
  storeId: string
  items: RestockItem[]
  note: string
  /** 陈列调整项（整改单附带） */
  placements?: PlacementItem[]
  /**
   * 权威合计（可选）。
   * 不传时由 items 求和；传了则以该值为准 —— 演示口径下行动方案的合计
   * 以 fixture 权威值为准（PRD 6.1/6.4：「合计 36 瓶 · ¥144」），
   * 保证 P4 页与整改单/订货建议上的数字一字不差。
   */
  totalBottles?: number
  totalAmount?: number
}

export interface CreateTaskPayload {
  storeId: string
  taskType: TaskType
  dueAt: string
  note: string
  assigneeId: string
}

/** 任务完成情况（经理看板：派了 → 做了没有） */
export interface TaskSummary {
  /** 任务总数 */
  total: number
  /** 已完成 */
  done: number
  /** 进行中 */
  open: number
  /** 逾期未完成 */
  overdue: number
  /** 完成率（0-100，null = 尚无任务） */
  completionRate: number | null
}
