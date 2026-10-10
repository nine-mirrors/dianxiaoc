/**
 * `.env` 加载（唯一实现）。
 *
 * 【为什么需要这个文件】
 * 后端有**三个模块在模块顶层就要读环境变量**：
 *   - `auth.js`   → AUTH_SECRET（会话 token 签名）
 *   - `vision.js` → LLM_VL_*（视觉模型）
 *   - `index.js`  → LLM_*、VITE_ORIGIN 等
 *
 * ESM 的 `import` 会**先于模块体执行**，所以「在 index.js 里加载 .env」救不了
 * `auth.js`/`vision.js` 的顶层求值 —— 它们会读到 `undefined`。
 * （这个坑踩过：.env 里配了 AUTH_SECRET，启动仍打印「未配置」警告，
 *   因为 auth.js 先于 index.js 的模块体完成求值。）
 *
 * 因此凡是需要环境变量的模块，都必须**自己**在 import 之后立刻调用 `loadEnv()`，
 * 且必须早于任何 `process.env` 的读取。
 *
 * 【解析规则】
 * - 只识别 `KEY=VALUE` 形式的行（KEY 为大写字母/下划线）
 * - 忽略 `#` 开头的注释行与空行
 * - 去掉值两端的成对引号
 * - **不覆盖已存在的环境变量**（`process.env[k] === undefined` 才写），
 *   这样 `PORT=3100 node src/index.js` 这类命令行传参能生效
 *
 * 【为什么不用 dotenv】
 * 演示项目不引新依赖（硬约束：不引入新 UI 库/新包）。这 7 行足够，
 * 且行为完全可控 —— 换机克隆时少一个「装了没装」的失败点。
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** `server/.env` 路径（本文件在 server/src/ 下，故取 `../.env`） */
export const ENV_PATH = join(__dirname, '../.env')

/**
 * 把 `server/.env` 里的键值对写入 `process.env`（不覆盖已存在的值）。
 *
 * 幂等：可重复调用。文件不存在时静默跳过（首次运行尚无 .env 属正常）。
 *
 * @param {string} [envPath] 可选：自定义 .env 路径（测试用）
 * @returns {boolean} 是否实际读到并写入了变量
 */
export function loadEnv(envPath = ENV_PATH) {
  if (!existsSync(envPath)) return false
  let count = 0
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    // 注释行与空行直接跳过；只认 KEY=VALUE
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const [, key, rawVal] = m
    // 不覆盖已存在的环境变量（命令行传参优先）
    if (process.env[key] === undefined) {
      process.env[key] = rawVal.replace(/^["']|["']$/g, '')
      count += 1
    }
  }
  return count > 0
}
