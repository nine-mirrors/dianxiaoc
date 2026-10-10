# 店小C · 部署指南

> 前端：Vue3 + Vite（静态产物，`store-app/dist/`）
> 后端：Express + SQLite（Node ≥ 22，`server/`）
> 数据：SQLite 单文件 `server/data/store.db`，备份即拷贝

---

## 一、本机演示（评委会场，最简模式）

**要求**：一台 Windows 笔记本 + Node ≥ 22，**全程断网可演示**。

```
双击 03_产品Demo\start-all.bat
```

脚本会开两个命令行窗口（后端 3000 / 前端 5180），并自动打开浏览器进角色选择页。

- 后端接口自检：浏览器开 `http://127.0.0.1:3000/health`
- 前端 `.env` 保持 `VITE_API_MODE=mock` 可走纯离线；改 `http` 则走真后端（都在本机，无需外网）

**灾备**：`store-app` 下 `npm run build:single` 会产出内联单文件 `dist/index.html`（≈276KB），U 盘拷走双击即开，连前端服务器都不需要。

---

## 二、服务器部署（要演示"真上线"时）

### 1. 服务器准备

```bash
# Ubuntu 22.04 示例
sudo apt update && sudo apt install -y nodejs npm nginx
# 确认 Node ≥ 22（node:sqlite 需要内置 SQLite）
node -v
```

### 2. 上传代码

把整个 `03_产品Demo/` 目录上传（scp / git 均可），假定放在 `/opt/store-app/`：

```bash
scp -r 03_产品Demo user@server:/opt/store-app
```

### 3. 安装依赖 + 构建

```bash
cd /opt/store-app/server && npm install
cd /opt/store-app/store-app && npm install && npm run build
# 产物在 store-app/dist/，为纯静态文件
```

### 4. 后端用 PM2 守护

```bash
npm i -g pm2
cd /opt/store-app/server
PORT=3000 pm2 start src/index.js --name store-api
pm2 save && pm2 startup   # 开机自启
```

### 5. Nginx 反向代理（前端静态 + 后端 API 同域）

```nginx
server {
    listen 80;
    server_name your.domain.com;

    # 前端静态
    root /opt/store-app/store-app/dist;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }

    # API 转发给 Express
    location /api/ { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; }

    # 上传的照片
    location /uploads/ { proxy_pass http://127.0.0.1:3000; }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 6. 前端切真后端

`store-app/.env`（构建时生效，改完要重新 `npm run build`）：

```
VITE_API_MODE=http
VITE_API_BASE=            # 同域反代后留空即可
```

---

## 三、环境变量

### 后端 `server/.env`（从 `.env.example` 复制）

| 变量 | 说明 | 不配会怎样 |
|---|---|---|
| `LLM_API_KEY` | OpenAI 兼容大模型 key（DeepSeek/通义/月之暗面） | 多轮追问降级为关键词匹配 |
| `LLM_BASE_URL` | 默认 `https://api.deepseek.com` | — |
| `LLM_MODEL` | 默认 `deepseek-chat` | — |
| `LLM_VL_MODEL` | 视觉模型（qwen-vl-plus / gpt-4o） | 上传照片识别降级为 mock |
| `PORT` | 默认 3000 | — |

**降级保证**：任何 LLM 缺 key / 超时 / 报错，都静默降级到关键词匹配 + mock 识别，**演示永不中断**。

### 前端 `store-app/.env`

| 变量 | 说明 |
|---|---|
| `VITE_API_MODE` | `mock`（默认，全离线）/ `http`（走真后端） |
| `VITE_API_BASE` | 后端地址，如 `http://127.0.0.1:3000`；同域反代后留空 |
| `VITE_DEMO_SPEED` | 演示加载倍率，1 正常 / 2 慢一倍（录屏解说用） |

---

## 四、常见问题

| 问题 | 处理 |
|---|---|
| 后端起不来 `node:sqlite` 报错 | Node 版本 < 22，升级到 Node 22+ |
| 前端改了 `.env` 没生效 | Vite 环境变量是启动时读取的，**必须重启 dev server / 重新 build** |
| 经理下派任务业代看不到 | 确认前后端都连的同一个后端（`.env` 的 MODE 一致）；mock 模式数据在浏览器 localStorage |
| 数据库想清空重来 | `curl -X POST http://127.0.0.1:3000/api/v1/demo/reset`，或直接删 `server/data/store.db` |
