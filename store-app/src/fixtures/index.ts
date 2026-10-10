/**
 * Fixture 汇总导出（ARCHITECTURE §8.5 / T02.2）。
 *
 * ⚠ 只有 api/mock/db.ts 允许 import 本模块。
 *   页面与组件一律通过 src/api/index.ts 取数（分层铁律 1）。
 */
import { SCHEMA_VERSION, checkFixture } from './schema'
import usersJson from './users.json'
import storesJson from './stores.json'
import skusJson from './skus.json'
import visitsJson from './visits.json'
import diagnosesJson from './diagnoses.json'
import dashboardJson from './dashboard.json'
import chatQaJson from './chat-qa.json'

import type { Store, SKU, Visit, User } from '@/types'

/** 用户原始数据 */
export interface UserRaw extends User {}

export const users = usersJson.items as UserRaw[]
export const stores = storesJson.items as Store[]
export const skus = skusJson.items as SKU[]
export const visits = visitsJson.items as Visit[]

/** 预置诊断原始数据（内含解析所需的扁平字段） */
export interface DiagnosisRaw {
  key: string
  storeId: string
  storeName: string
  visitId: string | null
  createdAt: string
  visitNo: number
  photoUrl: string
  shootTypes: string[]
  /** 六维度原始分，顺序固定 D1–D6 */
  dimensions: number[]
  /** 权威总分兜底（S2 整改前 48 分与公式 45.5 不符，以 fixture 为准） */
  scoreOverride: number | null
  prevScore: number
  expectedScore: number
  summary: {
    total: number
    skuCount: number
    emptyCount: number
    competitorCount: number
    priceTagCount: number
    stackCount: number
    text: string
  }
  annotations: {
    id: string
    layer: string
    x: number
    y: number
    w: number
    h: number
    label: string
    skuId?: string
  }[]
  issues: {
    id: string
    severity: string
    title: string
    location: string
    impact?: string
    actions?: string[]
    relatedAnnotationIds: string[]
  }[]
  risk: {
    weeklyBottles: number
    weeklyAmount: number
    monthlyBottles: number
    monthlyAmount: number
    items: {
      skuId: string
      skuName: string
      dailyAvgSales: number
      stdFacings: number
      actualFacings: number
      gapRatio: number
      elasticity: number
      dailyLossBottles: number
      unitPrice: number
    }[]
    derivation: string
  }
  plan: {
    storeTypeLabel: string
    restock: { skuId: string; skuName: string; bottles: number; amount: number }[]
    placement: { text: string }[]
    totalBottles: number
    totalAmount: number
    coverDays: number
  }
}

export const diagnoses = diagnosesJson.items as DiagnosisRaw[]
export const defaultSteps = diagnosesJson.defaultSteps as { text: string; delayMs: number }[]

/** P1 角色卡数据（GET /meta/roles） */
export const roleOptions = [
  { id: 'rep', name: '业代 · 李强', desc: '拍货架 · AI诊断 · 拿方案', sub: '辖区 128 家 | 今日待巡 5 家', recommended: true },
  { id: 'manager', name: '区域经理 · 王敏', desc: '看板 · 派任务', sub: '城东片区 | 128 家门店', recommended: false },
  { id: 'owner', name: '店员/店主 · 张大姐', desc: '自助诊断 · 订货', sub: '好邻居 · 地铁口店', recommended: false },
]

/** 对话预设问答库（含兜底话术与快捷问题 chips） */
export const chatQa = {
  suggestions: chatQaJson.suggestions as string[],
  fallback: chatQaJson.fallback as { miss: string; empty: string; recommend: string[] },
  items: chatQaJson.items as {
    id: string
    question: string
    keywords: string[]
    reply: string
    highlightSection: 'plan' | 'risk' | null
  }[],
}

/** 看板原始数据 */
export const dashboard = dashboardJson.items

/**
 * 启动时逐个校验 schemaVersion。
 * 不匹配只 warn，不抛错，避免演示翻车。
 */
export function validateFixtures(): boolean {
  const all = [
    checkFixture('users', usersJson),
    checkFixture('stores', storesJson),
    checkFixture('skus', skusJson),
    checkFixture('visits', visitsJson),
    checkFixture('diagnoses', diagnosesJson),
    checkFixture('dashboard', dashboardJson),
    checkFixture('chat-qa', chatQaJson),
  ]
  return all.every(Boolean)
}

export { SCHEMA_VERSION }
