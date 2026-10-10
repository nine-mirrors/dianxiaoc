/** 校验 AppIcon 图标名：所有使用到的 name 都必须在图标表里有定义。 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'C:/Users/21820/Desktop/蒙牛/03_产品Demo/store-app/src'
const src = fs.readFileSync(path.join(ROOT, 'components/common/AppIcon.vue'), 'utf8')
const block = src.slice(src.indexOf('ICONS'))
const defined = new Set([...block.matchAll(/^\s{2}'?([a-z0-9-]+)'?:\s*\[/gm)].map((m) => m[1]))

const files = []
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(vue|ts)$/.test(e.name)) files.push(p)
  }
})(ROOT)

const used = new Map()
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8')
  for (const m of t.matchAll(/<AppIcon[^>]*?name="([a-z0-9-]+)"/gs)) {
    if (!used.has(m[1])) used.set(m[1], f)
  }
  for (const m of t.matchAll(/icon:\s*'([a-z0-9-]+)'/g)) {
    if (!used.has(m[1])) used.set(m[1], f)
  }
}

const missing = [...used.keys()].filter((k) => !defined.has(k))
console.log(`图标定义数=${defined.size}  使用数=${used.size}`)
console.log(`缺失=${missing.length ? missing.map((m) => `${m} @ ${used.get(m)}`).join(', ') : '无'}`)
console.log(`已定义=${[...defined].join(', ')}`)
