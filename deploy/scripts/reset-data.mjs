/**
 * 每日重置演示数据（供服务器 cron 调用，不需要 HTTP/登录 token）。
 *
 * 作用：清空 tasks / tickets / visits / diagnoses / rectifications 与上传图片，
 *      并重新播种 1 条干净的经理待办——保证任何评委任何时间点进来都是干净初始态。
 *
 * 手动执行（在 server/ 目录）：
 *   node ../deploy/scripts/reset-data.mjs
 *
 * crontab（每天 03:30，路径按实际部署位置改）：
 *   30 3 * * * cd /opt/dianxiaoc/server && /usr/bin/node ../deploy/scripts/reset-data.mjs >> ../deploy/logs/reset.log 2>&1
 */
import { resetDemo } from '../../server/src/db.js'

try {
  resetDemo()
  console.log(`[${new Date().toISOString()}] 演示数据已重置（任务/单据/巡店/诊断/整改/上传图片已清空并重新播种）`)
} catch (e) {
  console.error(`[${new Date().toISOString()}] 重置失败：`, e)
  process.exitCode = 1
}
