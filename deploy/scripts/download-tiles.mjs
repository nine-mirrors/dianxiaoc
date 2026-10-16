/**
 * 下载演示区域（成都 S1–S5 门店周边）的高德瓦片到本地，
 * 使地图脱离外网依赖（PRD #45 零外网）。内部演示用途。
 *
 * 用法：node deploy/scripts/download-tiles.mjs [输出目录]
 * 输出目录默认 store-app/public/tiles（Vite 构建时拷贝进 dist）。
 */
import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = process.argv[2] ?? join(fileURLToPath(new URL('..', import.meta.url)), '../store-app/public/tiles')

// 演示门店包围盒（S1–S5），各向外扩 0.02° 留出地图上下文
const BBOX = { west: 103.9392, south: 30.7288, east: 104.0115, north: 30.7973 }
const ZOOMS = [11, 12, 13, 14, 15, 16] // 演示缩放范围（maxNativeZoom 16）
const SUBDOMAINS = ['01', '02', '03', '04']

function lonToTileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}
function latToTileY(lat, z) {
  const rad = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z)
}

function tileUrl(z, x, y) {
  const s = SUBDOMAINS[(x + y) % SUBDOMAINS.length]
  return `https://webrd${s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x=${x}&y=${y}&z=${z}`
}

async function fetchTile(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'dianxiaoc-demo/1.0' } })
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 0) return buf
      } else if (r.status !== 404) {
        await new Promise((res) => setTimeout(res, 200 * (i + 1)))
        continue
      }
    } catch {
      await new Promise((res) => setTimeout(res, 300 * (i + 1)))
    }
  }
  return null
}

async function main() {
  let total = 0
  let okCount = 0
  let bytes = 0

  for (const z of ZOOMS) {
    const xMin = lonToTileX(BBOX.west, z)
    const xMax = lonToTileX(BBOX.east, z)
    const yMin = latToTileY(BBOX.north, z)
    const yMax = latToTileY(BBOX.south, z)
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        total++
        const rel = join(String(z), String(x), `${y}.png`)
        const target = join(OUT_DIR, rel)
        if (existsSync(target)) continue
        const buf = await fetchTile(tileUrl(z, x, y))
        if (buf) {
          mkdirSync(join(OUT_DIR, String(z), String(x)), { recursive: true })
          writeFileSync(target, buf)
          okCount++
          bytes += buf.length
        }
      }
    }
    process.stdout.write(`z${z} 完成（累计 ${okCount}/${total}，${(bytes / 1024 / 1024).toFixed(1)}MB）...\n`)
  }

  process.stdout.write(
    `\n下载完成：${okCount}/${total} 张图，共 ${(bytes / 1024 / 1024).toFixed(2)}MB，输出 ${OUT_DIR}\n`,
  )
  const existing = total - okCount
  if (existing > 0) process.stdout.write(`（${existing} 张已存在 / 跳过）\n`)
}

main().catch((e) => {
  console.error('下载失败：', e)
  process.exit(1)
})