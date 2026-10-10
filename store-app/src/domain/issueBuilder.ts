/**
 * 问题清单构建模块（ARCHITECTURE §5.6 / T03.4）。
 *
 * 预置门店：直接读 fixture 的 issues 权威文案（保证与 PRD 4.4 D 模块一致）。
 * 陌生照片：由识别结果实时生成（severity: 严重 > 中度 > 轻度 排序）。
 */
import { SEVERITY_META } from './constants'
import type { Annotation, Issue, RecognitionSummary, Severity, SKU } from '@/types'

/** 严重度排序权重（越大越靠前） */
const SEVERITY_ORDER: Record<Severity, number> = { severe: 0, medium: 1, low: 2 }

/**
 * 按严重度排序（severe → medium → low，同级保持原顺序）。
 *
 * @param issues 问题列表
 */
export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

/**
 * 依据「识别识别统计 + 标注框」实时生成问题清单（兜底路径）。
 *
 * @param summary 识别摘要
 * @param annotations 标注框
 * @param skus SKU 主数据，用于补齐名称
 * @returns 排序后的问题清单
 */
export function buildIssues(summary: RecognitionSummary, annotations: Annotation[], skus: SKU[]): Issue[] {
  const list: Issue[] = []
  const skuNameOf = (id?: string): string => skus.find((s) => s.id === id)?.name ?? '蒙牛商品'
  const idsOf = (layer: string): string[] => annotations.filter((a) => a.layer === layer).map((a) => a.id)

  const emptyIds = idsOf('empty')
  if (emptyIds.length > 0) {
    list.push({
      id: 'GEN_OOS',
      severity: 'severe',
      title: `货架出现 ${emptyIds.length} 处整列空位`,
      location: `冷藏柜 · 应陈列 ${skuNameOf(annotations.find((a) => a.layer === 'empty')?.skuId)}`,
      impact: '影响：缺位期间该列动销直接归零',
      actions: ['立即补货', '标记已处理'],
      relatedAnnotationIds: emptyIds,
    })
  }

  const competitorIds = idsOf('competitor')
  if (competitorIds.length > 0) {
    list.push({
      id: 'GEN_COMPETITOR',
      severity: 'severe',
      title: `竞品占用 ${competitorIds.length} 个黄金列位`,
      location: '冷藏柜黄金视线层 · 蒙牛排面被挤压',
      impact: '影响：黄金层与底层单列动销相差约 2.1 倍',
      actions: ['查看竞争话术'],
      relatedAnnotationIds: competitorIds,
    })
  }

  const priceCount = (summary?.priceTagCount ?? 0) || idsOf('pricetag').length
  if (priceCount > 0) {
    list.push({
      id: 'GEN_PRICETAG',
      severity: 'medium',
      title: `价签问题 ${priceCount} 处`,
      location: '冷藏柜 · 价签缺失或价格不符',
      impact: '影响：顾客无法比价，转化率下降',
      actions: ['打印价签'],
      relatedAnnotationIds: idsOf('pricetag'),
    })
  }

  const oosIds = idsOf('oos')
  if (oosIds.length > 0) {
    list.push({
      id: 'GEN_LOWSTOCK',
      severity: 'medium',
      title: `${oosIds.length} 个 SKU 排面不足`,
      location: '冷藏柜 · 低于安全库存 50%',
      impact: '影响：高峰期存在断货风险',
      actions: ['补到满排'],
      relatedAnnotationIds: oosIds,
    })
  }

  const stackIds = idsOf('stack')
  if (stackIds.length > 0) {
    list.push({
      id: 'GEN_STACK',
      severity: 'medium',
      title: '本月联合堆头未执行',
      location: '门店入口区 · 活动物料未落地',
      impact: '影响：活动期损失增量销售',
      actions: ['申请物料'],
      relatedAnnotationIds: stackIds,
    })
  }

  return sortIssues(list)
}

/**
 * 取严重度元数据（色值/文案唯一出处）。
 *
 * @param severity 严重度
 */
export function severityMeta(severity: Severity) {
  return SEVERITY_META[severity] ?? SEVERITY_META.low
}

/**
 * 统计各严重度数量，供「问题清单（4）」标题用。
 *
 * @param issues 问题列表
 */
export function countBySeverity(issues: Issue[]): Record<Severity, number> {
  return issues.reduce(
    (acc, it) => {
      acc[it.severity] = (acc[it.severity] ?? 0) + 1
      return acc
    },
    { severe: 0, medium: 0, low: 0 } as Record<Severity, number>,
  )
}
