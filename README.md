# 店小C · 蒙牛 AI 巡店助手

高保真**演示原型**（校园创新大赛作品）。拍一张货架照，AI 帮你诊断陈列问题、预估销量损失、并给出「千店千面」的补货与陈列方案；覆盖**业代 / 区域经理 / 店员店主**三种角色，**全站真实后端 + 真实大模型，无任何 mock 兜底**。

> 运行态：**唯一数据通路 = Express 真后端**（`server/`，含 SQLite、千问 LLM/CV、MCP 进销存、补货算法、Redis 缓存、WebSocket 推送）。AI 对话 / 巡店小结 / 订货理由 / 给店主话术均为真实大模型流式输出。后端不可用时**如实报错并提示**，不再偷偷降级为假数据。

---

## 目录结构

```
03_产品Demo/
├── store-app/          # 前端（Vue3 + Vite + TS + Pinia）
├── server/             # 真后端（Express + SQLite，提供 30 个 REST + SSE + WebSocket）
└── README.md
```

- `store-app/` 是演示主程序，**单独即可完整演示全部功能**。
- **`server/` 必须启动**（`cd server && npm start`，3000 端口）。本项目**无 mock 层**，后端未起时页面会显示「后端未连接」且没有数据。详见《启动说明.md》。

---

## 快速开始（store-app）

```bash
cd store-app
npm install
npm run dev          # 开发模式，实际使用 http://127.0.0.1:5180（演示统一端口）
```

构建与离线产物：

```bash
npm run build        # 标准构建 → dist/（多文件，含 hash 路由，放任意目录可访问）
npm run build:single # 单文件构建 → dist/index.html（JS/CSS 内联，仍需后端在 3000 端口运行）
npm run preview      # 本地预览构建产物 → http://127.0.0.1:4173
npm run typecheck   # 类型检查（vue-tsc）
```

> **单文件验收**：`npm run build:single` 产出的 `dist/index.html` 单文件双击即开、不依赖 CDN，但**仍需后端在 3000 端口运行**（无 mock）。前端零 CDN 依赖。

### 环境变量（store-app/.env）

> 首次克隆后需复制一份：`cp .env.example .env`（Windows：`copy .env.example .env`）。仓库已提供 `store-app/.env.example`。

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `VITE_API_BASE` | 真后端地址（唯一数据通路，**无 mock 开关**） | `http://127.0.0.1:3000` |
| `VITE_API_MODE` | 固定为 `http`（保留字段，仅为兼容旧配置） | `http` |

---

## 三种角色演示路径

开场页 `/role`（P1）选择角色，3 秒切入任意一端：

### ① 业代端 · 李强（移动端，主线 P2→P4）
- **P2 今日巡店**：今日路线 + 5 家门店卡片 + 经理下派的待办提醒。点击门店进入拍照。
- **P3 拍照诊断**：上传/选择货架照 → AI 识别动画 → 生成诊断。
- **P4 诊断结果（核心）**：
  - A 顶部摘要 ｜ B AI 健康分 + 六维度 ｜ C **AI 识别标注图（可拖拽对比「原图/标注」）**
  - D 问题清单 ｜ E 风险预判（销量损失预估）｜ F AI 追问对话 ｜ G 千店千面行动方案 ｜ H 底部行动栏
  - ★ **双向高亮**：鼠标悬停「问题清单」某项 → 标注图上对应框点亮；悬停标注框 → 对应问题卡片高亮（整簇联动）。
  - AI 能力：对话追问（SSE 流式）、巡店小结、订货建议理由（SSE 流式，联网走真模型）。
  - 生成整改单 / 订货建议 → 提交成功页 → 返回 P2 绿色闪光。

### ② 区域经理端 · 王敏（桌面端 1440×900，P5）
- **区域经营看板**：概览环形图（门店健康分布）+ 趋势折线 + 风险 Top5 门店榜。
- 点击「下派任务」→ 选门店 / 任务类型 / 时限 → 写入任务库（持久化）。

### ③ 店员/店主端 · 张大姐（移动端，P6）
- **店主自助诊断**：三步引导 → 轻量拍照（可自拍任意货架）→ 口语化结果 → 一键订货成功。
- 不出现「健康分 / 六维度」等内部术语，全程大白话。

### 跨角色闭环（T05.3）
经理在 P5 下派任务 → 任务写入 **SQLite 真库**（`server/data/store.db`）→ 通过 **WebSocket 实时推送**到业代端 P2，无需刷新。**演示时可先开经理端下派，再切到业代端看实时弹出的待办提醒**，形成完整闭环。

---

## 真后端（server/，必启）

需要真大模型 / 真 SSE 流式 / 真 REST 时启用：

```bash
cd server
npm install
cp .env.example .env      # 填入 LLM_API_KEY（DashScope qwen-plus / qwen-vl-plus）
npm start                 # 默认 http://localhost:3000
```

后端提供的关键能力：
- 多轮追问 `/api/v1/ai/chat` 与流式版 `/api/v1/ai/chat/stream`
- AI 生成（巡店小结 / 订货理由）`/api/v1/ai/generate` 与流式版 `/api/v1/ai/generate/stream`
- 任务下派 / 巡店记录等 REST 资源

> SSE 端点若因无 Key / 上游失败会**降级为一帧全文**（保证界面有内容，不白屏）。

### 鉴权（T1/T2 安全整改）

除登录与公开元数据外，**所有 `/api/v1/*` 接口都必须带有效 token**：

```bash
# 登录换 token（白名单接口，无需凭证）
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"liqiang","password":"123456"}'
# → { "code":0, "data":{ "token":"liqiang.<ts>.<exp>.<hmac>", ... } }

# 之后所有业务请求带上 Authorization
curl http://localhost:3000/api/v1/stores -H 'Authorization: Bearer <token>'
```

- token 格式 `username.ts.exp.hmac`：HMAC-SHA256 签名，**8 小时过期**，验签用 `timingSafeEqual` 防时序攻击。
- 兼容回退 `?token=`（SSE 的 `EventSource` 与 `<img src>` 无法自定义请求头，这是浏览器限制；token 本身仍需验签，不是绕过）。
- 角色校验：下派任务限 `manager`，任务回执限 `rep`，不匹配返回 403。
- 白名单（免鉴权）：`POST /api/v1/auth/login`、`GET /api/v1/auth/demo-accounts`、`GET /api/v1/meta/roles`、`GET /health`。

---

## 密钥配置（T3）

**真实密钥只存 `server/.env`，不进仓库。** 仓库里只有 `server/.env.example` 模板（变量名 + `sk-xxx` 占位）。

```bash
cd server
cp .env.example .env      # 然后填入真实值
```

需要配置的变量：

| 变量 | 用途 | 缺省行为 |
| --- | --- | --- |
| `AUTH_SECRET` | HMAC 签发会话 token | 未配置则用进程级随机密钥 + 打印警告，**重启后所有 token 失效** |
| `LLM_API_KEY` | 文本大模型（多轮追问 / 小结 / 话术） | 降级为本地关键词匹配 |
| `LLM_VL_API_KEY` | 视觉识别（货架 CV） | 降级为通用陈列规则 |
| `LLM_BASE_URL` / `LLM_MODEL` | 文本模型地址与型号 | 通义千问 qwen-plus |
| `LLM_VL_BASE_URL` / `LLM_VL_MODEL` | 视觉模型地址与型号 | 通义千问 qwen-vl-plus |

生成 `AUTH_SECRET`：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`.gitignore` 已覆盖 `**/.env` 与 `server/data/`（SQLite 库、上传照片、演示账号），打包或分享仓库不会带出密钥与运行时数据。**换机器/重新 clone 后必须重新 `cp .env.example .env`。**

> ⚠ 演示环境为方便评委自助登录，`GET /api/v1/auth/demo-accounts` 会连同密码一起下发演示账号清单 —— 这是**校园演示专用**的设计，真实系统绝不会回传密码。

---

## 演示数据

- 5 家门店（`S1` 家家悦、`S2` 好邻居、`S3` 美宜佳、`S4` 华联、`S5` 永辉）均可点入 P4 完整演示。
- `S2` 额外提供「整改前 `cold_before.jpg`」对比图（P4 拖拽对比滑块可见整改效果）。
- 标注坐标为 **0–100 相对百分比**，与图片像素解耦；换实拍图只需改 Fixture 坐标，组件代码不动。
- 数字（健康分 / 风险销量损失 / 行动方案金额）由后端 fixture 权威值 + 补货算法实时计算，**可溯源**。

---

## 技术栈

- 前端：Vue 3 (`<script setup>`) + TypeScript + Vite 5 + Pinia 2 + vue-router 4（hash 模式）
- 图表：ECharts 5（看板环形图 / 折线）
- 地图：Leaflet 4 + 高德瓦片（免 key 直连，P2 支持全屏与缩放）
- 后端：Node + Express + SQLite + DashScope 千问（qwen-plus 文本 / qwen-vl-plus 视觉）
- **AI 流式**：SSE（`/api/v1/ai/chat/stream`、`/api/v1/ai/generate/stream`），逐 token 出字
- **MCP 进销存**：`server/mcp/inventory-server.mjs`（零依赖 stdio JSON-RPC），暴露 `get_batch_expiry` / `get_price_book` / `get_store_inventory` 三个工具 —— **效期与价签数据来自进销存，不靠看图猜**
- **补货算法**：`server/src/forecast.js`，Holt 指数平滑 → 单列日均 → 动态安全库存 `z·σ·√L`（90% 服务水平）→ 目标库存 → 建议补货量，逐步可溯源；`GET /api/v1/forecast/:diagnosisId` 可查看完整算式
- **缓存**：双模 —— 配置 `REDIS_URL` 走 Redis，否则自动退化为内存 LRU + TTL（`server/src/cache.js`），AI 文案二次调用秒回

## 演示账号（评委可自己登录不同角色查看）

| 账号 | 密码 | 角色 | 登录后直达 | 能看到什么 |
|---|---|---|---|---|
| `liqiang` | `123456` | 业代 · 李强 | `#/rep/today` | 今日巡店、拍照诊断、AI 方案、整改留证 |
| `wangmin` | `123456` | 区域经理 · 王敏 | `#/manager/dashboard` | 区域看板、风险预警、下派任务 |
| `zhangdajie` | `123456` | 店员/店主 · 张大姐 | `#/owner` | 自助诊断、一键补货 |

- 登录页点任一「演示账号」按钮可一键填入，**不必手打**；
- **账号决定角色、角色决定能看哪些页面**：用 `wangmin` 登录后手动访问 `#/rep/diagnosis/D_S3` 会被守卫送回经理首页；
- 安全阀：未登录 / 跳过登录 / 直接点链接时**不做拦截**，保证评委点任何直达链接都能打开；
- 另有手机号 + 验证码登录路径（演示态任意 6 位数字）。

## 演示注意事项

- **必须先起后端**：`cd server && npm start`（3000 端口），否则页面顶部提示「后端未连接」。
- 单文件产物：`npm run build:single` → `dist/index.html` 双击即开（仍需后端运行）。
- 演示速度倍率 / 骨架屏开关在桌面端手机壳外的设置齿轮里（不影响移动端）。
- 登录态（token + 身份）写入 `localStorage`，刷新自动恢复；后端重启需重新登录（token 8小时有效）。
- 评委追问「数字怎么来的」：P4 风险预判卡可展开**推导依据**；补货量口径见 `server/src/forecast.js`（动态安全库存）；效期/价签来自 MCP 进销存工具。
