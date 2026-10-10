/**
 * 视觉标注生成（方案 B：主线 S1–S5 也走视觉模型生成标注框）。
 *
 * 为什么要安全网：
 *   视觉模型可能读错。若直接用它的框覆盖，演示现场会出现「框和画面明显对不上」的穿帮。
 *   规则：**按层判定**——视觉给出的框与该层 fixture 参照数量偏差 ≤ 阈值就采纳，
 *   偏差过大就回退该层 fixture 坐标，并在 sourceText 说明该层由陈列标准库定位。
 *   诚实，且现场不会翻车。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
/**
 * 图片候选目录（按序查找）：
 *  1. 本次上传的货架照片（data/uploads）—— 真实拍摄
 *  2. 前端 public/stores/**（fixture 预置图）—— 演示主线走这条
 * ⚠ 只读 uploads 会导致主线 fixture 图读不到、视觉直接返回 null（实测踩过）。
 */
const IMAGE_DIRS = [
  join(__dirname, '../data/uploads'),                  // server/data/uploads（本次上传）
  join(__dirname, '../../store-app/public'),           // store-app/public（fixture 图）
  join(__dirname, '../../store-app/public/stores'),    // 同上（相对 photoUrl 的另一种写法）
]


/* ═══════════════ .env 读取（必须在此之前加载：VL 常量在模块顶层求值） ═══════════════ */
const ENV_PATH = join(__dirname, '../.env')
if (existsSync(ENV_PATH)) {
  readFileSync(ENV_PATH, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  })
}

/**
 * 视觉模型配置。
 * ⚠ 变量名必须与 .env 保持一致：`.env` 里是 LLM_VL_API_KEY / LLM_VL_BASE_URL /
 *   LLM_VL_MODEL（与 index.js 的 VL 同源）。之前误读 VL_KEY，导致视觉永远
 *   取不到 key、静默返回 null（实测踩过：耗时 0.2s 就是没调）。
 */
const VL = {
  key: process.env.LLM_VL_API_KEY || process.env.VL_KEY || process.env.LLM_API_KEY || '',
  model: process.env.LLM_VL_MODEL || process.env.VL_MODEL || 'qwen-vl-ocr',
  baseUrl: (
    process.env.LLM_VL_BASE_URL || process.env.VL_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  ).replace(/\/$/, ''),
}

/**
 * 各层允许的最大相对偏差（超过则该层回退 fixture 坐标）
 *
 * ★ 阶段 B4：整体下调一档（0.5/1.0 → 0.35/0.70），让视觉框**更高概率被采信**。
 * 安全网本身保留不删 —— 它防的是「视觉模型跑飞把框画到天花板上」，
 *   不是为了压低视觉采纳率；下调后仍有兜底，但常态下六维能真正由视觉驱动。
 */
const TOLERANCE = {
  mengniu: 0.35,
  empty: 0.7,
  oos: 0.7,
  competitor: 0.7,
  pricetag: 0.7,
}

/**
 * 识别结果缓存（key = 图片名 + 门店名）。
 * ⚠ 视觉调用 2-9 秒，演示时反复进同一页会卡；缓存 5 分钟既快又不失「真识别」，
 *   且换图/换店会自然失效。演示前若改了 fixture 图请重启后端清缓存。
 */
const CACHE = new Map()
const CACHE_TTL = 5 * 60 * 1000

/**
 * 调视觉模型识别并返回带坐标的标注框。
 *
 * @param {string} photoUrl 上传后的照片 url（用于定位本地文件）
 * @param {string} storeName 门店名（写进 prompt 提升准确率）
 * @returns {Promise<null | {skuCount:number, emptyCount:number, competitorCount:number, priceTagMissing:number, boxes:Array}>} 失败返回 null
 */
export async function analyzeShelfWithBoxes(photoUrl, storeName) {
  if (!VL.key) return null

  const cacheKey = `${photoUrl}|${storeName}`
  const hit = CACHE.get(cacheKey)
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data
  try {
    const fileName = decodeURIComponent(photoUrl.split('/').pop() || '')
    // photoUrl 形如 /stores/S3/cold.jpg → 相对路径 stores/S3/cold.jpg
    const rel = photoUrl.replace(/^\//, '')
    let buf = null
    for (const dir of IMAGE_DIRS) {
      for (const relPath of [fileName, rel]) {
        const p = join(dir, relPath)
        if (existsSync(p)) {
          try {
            buf = readFileSync(p)
            break
          } catch {
            /* 继续找下一个候选 */
          }
        }
      }
      if (buf) break
    }
    if (!buf) return null
    const ext = fileName.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'
    const dataUrl = `data:image/${ext};base64,${buf.toString('base64')}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25000)

    const res = await fetch(`${VL.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VL.key}` },
      body: JSON.stringify({
        model: VL.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  `这是便利店「${storeName}」的货架照片。请观察后只返回一个 JSON 对象（不要任何其他文字）：\n` +
                  '{"skuCount":整数,"emptyCount":整数,"competitorCount":整数,"priceTagMissing":整数,' +
                  '"boxes":[{"layer":"mengniu","label":"简短中文说明","x":整数,"y":整数,"w":整数,"h":整数}]}\n' +
                  '规则：\n' +
                  '1) layer 只能取以下五个值之一，每个框只写一个值：mengniu、empty、competitor、oos、pricetag。\n' +
                  '2) x/y/w/h 都是 0-100 的整数百分比坐标，必须贴合图中真实商品所在区域。\n' +
                  '3) 最多输出 8 个框，优先标注最明显的问题位置。\n' +
                  '示例：{"layer":"mengniu","label":"优益C满排","x":8,"y":30,"w":40,"h":12}',
              },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 900,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null

    const j = await res.json()
    const raw = j.choices?.[0]?.message?.content ?? ''
    // ⚠ 千问常把 JSON 包在 ```json ... ``` 里，直接 match 最外层大括号会拿到
    //   尾随的 ``` 而解析失败（实测踩过：返回合法但结果为 null）。先剥围栏。
    const text = raw.replace(/```(?:json)?/gi, '').trim()
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    let v
    try {
      v = JSON.parse(text.slice(start, end + 1))
    } catch {
      return null
    }
    const n = (x) => Math.max(0, Number(x) || 0)
    const ALLOWED = ['mengniu', 'empty', 'competitor', 'oos', 'pricetag']
    /** layer 容错：模型可能返回 'mengniu|empty|...' 这类照抄选项的字符串，取首个合法值 */
    const normLayer = (raw) => {
      const s0 = String(raw ?? '').toLowerCase().trim()
      if (ALLOWED.includes(s0)) return s0
      const hit = ALLOWED.find((k) => s0.includes(k))
      return hit || null
    }
    const boxes = (Array.isArray(v.boxes) ? v.boxes : [])
      .map((b) => (b ? { ...b, layer: normLayer(b.layer) } : null))
      .filter((b) => b && b.layer)
      .map((b, i) => ({
        id: `V${String(i + 1).padStart(2, '0')}`,
        layer: b.layer,
        x: Math.min(97, Math.max(0, Number(b.x) || 0)),
        y: Math.min(97, Math.max(0, Number(b.y) || 0)),
        w: Math.min(100, Math.max(3, Number(b.w) || 10)),
        h: Math.min(35, Math.max(1.5, Number(b.h) || 5)),
        label: String(b.label || '').slice(0, 20),
      }))
    // ⚠ 不因boxes 为空就整体丢弃：模型输出不稳定（实测同一张图有时不给框），
    //   但**计数是真识别出来的**，照样采信；框交给安全网回退陈列标准库。
    //   这样 summary 里的 SKU/空位/竞品/价签 数字始终来自视觉模型。
    /**
     * 合理性校验（重要）。
     * 当前可用的视觉模型是 qwen-vl-ocr（账号未开通 qwen-vl-plus/max），
     * OCR 模型擅长文字识别但**不擅长计数**，实测会把 8~14 个SKU 读成 100。
     * 因此对计数做业务上限校验，明显离谱的判为不可信 → 返回 null → 回退陈列标准库，
     * **绝不让离谱数字进入健康分与页面**（否则答辩现场看到「蒙牛SKU 100 项」直接穿帮）。
     */
    const LIMITS = { skuCount: 40, emptyCount: 20, competitorCount: 20, priceTagMissing: 30 }
    const rawCounts = {
      // ⚠ P1-4：原为 Math.max(1, n(v.skuCount))，会把「模型漏字段」洗成「识别到 1 个 SKU」——
//   于是「四项计数全 0 → 回退 fixture」的守卫失效，健康分按伪造的 1 个 SKU 折算、六维被无意义扣分。
//   这里让它自然为 0，交给 domain.visionToDimensions 的「全 0 → null → 回退 fixture」处理。
skuCount: n(v.skuCount),
      emptyCount: n(v.emptyCount),
      competitorCount: n(v.competitorCount),
      priceTagMissing: n(v.priceTagMissing),
    }
    const overLimit = Object.entries(LIMITS).filter(([k, max]) => rawCounts[k] > max)
    if (overLimit.length) {
      // 计数不可信：仍返回 boxes（坐标可能有效），但计数交由调用方回退
      return {
        skuCount: null, emptyCount: null, competitorCount: null, priceTagMissing: null,
        countsUnreliable: true,
        unreliableReason: overLimit.map(([k, max]) => `${k}=${rawCounts[k]} 超出合理上限 ${max}`).join('，'),
        boxes,
      }
    }
    const data = {
      skuCount: rawCounts.skuCount,
      emptyCount: rawCounts.emptyCount,
      competitorCount: rawCounts.competitorCount,
      priceTagMissing: rawCounts.priceTagMissing,
      boxes,
    }
    CACHE.set(cacheKey, { at: Date.now(), data })
    return data
  } catch {
    return null
  }
}

/**
 * 偏差安全网：逐层判定视觉框能否采纳。
 *
 * @param {Array} visionBoxes 视觉返回的框
 * @param {Array} fixtureBoxes 该门店 fixture 权威框
 * @returns {{boxes: Array, adopted: string[], reverted: string[]}} adopted=采纳视觉的层；reverted=回退 fixture 的层
 */
export function patchVisionAnnotations(visionBoxes, fixtureBoxes) {
  const byLayer = (list) => {
    const m = new Map()
    for (const b of list) m.set(b.layer, (m.get(b.layer) || 0) + 1)
    return m
  }
  const vCount = byLayer(visionBoxes)
  const fCount = byLayer(fixtureBoxes)

  const adopted = []
  const reverted = []
  const kept = [...visionBoxes]

  for (const [layer, refN] of fCount) {
    // 该层 fixture 有参照：视觉没给 → 回退；给了但数量偏差过大 → 回退
    const vN = vCount.get(layer) || 0
    const tol = TOLERANCE[layer] ?? 0.8
    const dev = refN > 0 ? Math.abs(vN - refN) / refN : 1
    if (vN === 0 || dev > tol) {
      reverted.push(layer)
      // 移除该层视觉框，补上 fixture 框
      for (let i = kept.length - 1; i >= 0; i--) if (kept[i].layer === layer) kept.splice(i, 1)
      kept.push(...fixtureBoxes.filter((b) => b.layer === layer))
    } else {
      adopted.push(layer)
    }
  }

  return { boxes: kept, adopted, reverted }
}