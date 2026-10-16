/**
 * ★ 经理端 · 区域对比契约层（region-compare）。
 *
 * 数据源：`GET /api/v1/region-compare`（server/src/routes/region-compare.js）。
 * 该端点的每个区域指标都取自 dashboard.js 的 buildDashboardOverview(regionId)，
 * 与「区域经营看板」页同源 —— 对比页与看板页对同一区域不会出现两个数。
 *
 * 页面只允许从 @/api/* 取数（铁律 1），本文件是该页面的唯一后端入口。
 */
import { request } from './client'
import type { HealthLevelKey, TrendSeries } from '@/types'

/** 单个区域的关键指标行（字段与后端 buildRegionRow 一一对应） */
export interface RegionCompareRow {
  regionId: string
  /** 区域中文名（如「城东片区」） */
  regionName: string
  /** 区域门店数 */
  storeCount: number
  /** 平均健康分 */
  avgScore: number
  /** 周环比：该区域门店 weekDelta 均值（门店级真实字段） */
  weekDelta: number
  /** 巡店完成数：该区域门店真实巡店记录条数 */
  visitCount: number
  /** 已完成整改回执数 */
  rectificationDone: number
  /** 待复查（未留证）回执数 */
  rectificationOpen: number
  /** 整改闭环率（0–100）；无回执时为 null（不伪造） */
  rectificationRate: number | null
  /** 任务总数 */
  taskTotal: number
  taskDone: number
  taskOpen: number
  /** 逾期未完成 */
  taskOverdue: number
  /** 任务完成率（0–100）；无任务时为 null */
  taskRate: number | null
}

/** 区域内单家门店排行行 */
export interface RegionStoreRank {
  storeId: string
  storeName: string
  score: number
  level: HealthLevelKey
  /** 周环比（门店级真实字段） */
  weekDelta: number
  mainIssue: string
}

/** 聚焦区域详情：门店排行（按健康分降序）+ 8 周趋势 */
export interface RegionFocus {
  regionId: string
  regionName: string
  storeTotal: number
  stores: RegionStoreRank[]
  /** 8 周趋势（fixture 真实多周曲线，与看板页同源） */
  trend: TrendSeries[]
}

export interface RegionCompareData {
  /** 全部区域的关键指标对比行 */
  regions: RegionCompareRow[]
  /** 聚焦区域详情（缺省为第一个区域）；后端异常时可能为 null */
  focus: RegionFocus | null
  /** 演示基准日（与后端 DEMO_TODAY 同源） */
  demoToday: string
  /** 各指标口径说明 */
  method: string
}

/**
 * GET /region-compare —— 区域对比一次性取全（对比行 + 聚焦详情）。
 *
 * @param regionId 聚焦区域 id（如 R_EAST）；不传则后端返回第一个区域
 */
export async function getRegionCompare(regionId?: string): Promise<RegionCompareData> {
  return request<RegionCompareData>({
    path: '/api/v1/region-compare',
    method: 'GET',
    query: regionId ? { region: regionId } : {},
  })
}
