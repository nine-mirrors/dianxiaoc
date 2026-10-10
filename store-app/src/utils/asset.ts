/**
 * 静态资源 URL 工具。
 *
 * 背景：构建配置为 base:'./' 且路由使用 hash 模式，
 * 因此 fixture 中的图片路径统一以 '/' 开头书写（便于将来换成 OSS/CDN 绝对路径），
 * 运行时由本模块转成「相对于当前页面」的 URL。
 *
 * 这样：
 *  - 开发态  http://127.0.0.1:5173/            → ./stores/S3/cold.jpg ✔
 *  - 构建态  任意子目录 / 双击 index.html        → ./stores/S3/cold.jpg ✔
 */
const BASE = import.meta.env?.BASE_URL ?? '/'

/**
 * 把 fixture 里的路径转成可直接用于 <img src> 的相对 URL。
 *
 * @param url fixture 中书写的路径（允许带前导 '/'）
 * @returns 相对 URL 字符串
 */
export function assetUrl(url: string): string {
  if (!url) return ''
  // 已经是外链 / data URI 的原样返回（理论上不存在，这里做防御）
  if (/^(https?:|data:|blob:)/i.test(url)) return url
  const cleaned = url.replace(/^\/+/, '')
  return `${BASE}${cleaned}`
}

/** 图片三级兜底链：门店图 → 通用货架图 → 空 */
export const FALLBACK_IMAGE = assetUrl('/stores/fallback/generic-shelf.jpg')
