/**
 * 展示层格式化纯函数（无 Vue 依赖，便于复用与单测）。
 */

/**
 * 数字保留 n 位小数（不做四舍五入以外的处理）。
 *
 * @param value 原值
 * @param digits 小数位数，默认 1
 */
export function round1(value: number, digits: number = 1): number {
  const p = Math.pow(10, digits)
  return Math.round(value * p) / p
}

/**
 * 金额格式化：始终保留 2 位小数并加 ¥ 前缀。
 *
 * @param value 金额数值
 */
export function formatMoney(value: number): string {
  const n = Number(value) || 0
  return `¥${n.toFixed(2).replace(/\.00$/, '')}`
}

/**
 * 整数金额格式化（演示口径金额多为整数）。
 *
 * @param value 金额数值
 */
export function formatMoneyInt(value: number): string {
  return `¥${Math.round(Number(value) || 0)}`
}

/**
 * 环比文案：+3 / -2 / 持平。
 *
 * @param delta 变化量
 */
export function formatDelta(delta: number): string {
  if (!delta) return '持平'
  return `${delta > 0 ? '+' : ''}${round1(delta, 1)}`
}

/**
 * ISO 或 'yyyy-MM-dd HH:mm' 字符串 → MM-DD HH:mm 短格式。
 *
 * @param input 时间字符串
 */
export function formatShortTime(input: string): string {
  if (!input) return ''
  const str = input.replace('T', ' ')
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (!m) return input
  const [, , mm, dd, hh, min] = m
  if (hh && min) return `${mm}-${dd} ${hh}:${min}`
  return `${mm}-${dd}`
}

/**
 * 生成简易唯一 id（演示环境足够，不引入 uuid 依赖）。
 *
 * @param prefix 前缀，如 'TSK'
 */
export function uid(prefix: string = 'ID'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
