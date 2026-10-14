/**
 * PM2 进程配置（店小C 后端）。
 *
 * 在服务器上用法（位于 server/ 目录）：
 *   pm2 start ../deploy/ecosystem.config.cjs
 *   pm2 save && pm2 startup      # 开机自启
 *
 * 环境变量以同目录 server/.env 为准（env.js 自行加载）；这里只显式设置
 * NODE_ENV=production（.env 里写也行，二者保持一致即可）。
 */
module.exports = {
  apps: [
    {
      name: 'dianxiaoc-server',
      script: 'src/index.js',
      cwd: '../server',
      node_args: [],
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
      error_file: '../deploy/logs/error.log',
      out_file: '../deploy/logs/out.log',
      time: true,
    },
  ],
}
