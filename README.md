<div align="center">

# 🥛 店小C · 蒙牛 AI 巡店助手

**拍一张货架照，AI 告诉你该怎么卖。**
面向快消零售「人货场」的 AI 巡店与终端经营系统

<p>
<img alt="Vue" src="https://img.shields.io/badge/Vue_3-35495E?logo=vuedotjs&logoColor=4FC08D">
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white">
<img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white">
<img alt="Node" src="https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white">
<img alt="Pantone 7481C" src="https://img.shields.io/badge/Mengniu-7481C-00B451">
</p>

</div>

---

竞赛原型。前端 **Vue 3 + TypeScript + Vite**，后端 **Node.js + Express + SQLite**，
视觉识别接入通义千问 **qwen3-vl-plus**、文本接入 **qwen**（SSE 真流式），并通过 MCP 工具读取进销存；
无 API Key 时自动降级为确定性结果，保证离线演示不中断。

## ✨ 已上线能力

- **AI 视觉诊断**：货架 / 冷柜 / 堆头拍照 → 缺货、竞品占位、黄金陈列位、价签识别，问题在图上直接标注
- **千店千面行动方案**：结合动销、库存、临期、价盘，给出补货量（算式可解释、可溯源）、陈列调整与竞争话术
- **AI 生成（真流式）**：多轮追问、巡店小结、订货理由、给店主的沟通话术
- **三端实时闭环**：经理下派任务 → WebSocket 实时推送到业代；店主下单 → 业代实时接单
- **真机拍照**：getUserMedia 取景器（权限三分支降级）/ 相册 / 示例图三通道
- **企业级体验**：蒙牛 7481C 品牌设计系统、日/夜双主题（涟漪切换）、招牌牛奶注入加载、
  320px–4K 全终端响应、无障碍（44px 触控 / AA 对比度 / 键盘 / 读屏）、PWA 可安装

### 🗺️ 路线图（本轮扩展，见 [`docs/specs/`](docs/specs/) 冻结规格）

业代拜访八步骤（GPS 签到 + 照片水印 / 价签 / 冰柜纯净度 / 盘点临期）·
AI 经营问答 ChatBI · 单店 AI 画像 · AI 周报 · 智能补货模拟器 · 门店体检报告导出 ·
**管理员端**（账号派发 / 黑名单库 / 知识库 / 审计）· 四端消息中心（公告 + 工作沟通）·
全局 AI 悬浮球 · 语音输入 · 演示导览 / 投屏大屏。

## 🧱 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vue 3 · TypeScript · Vite · Pinia · Vue Router(hash) · ECharts（按需）· Leaflet |
| 后端 | Node.js · Express · better-sqlite3 · 原生 WebSocket · SSE |
| AI | DashScope qwen3-vl-plus（视觉）· qwen（文本）· MCP 进销存工具 |
| 工程 | 零 CDN 零外链 · JWT 鉴权 · 限流 · CSP 安全头 · 全局错误边界 · 访问日志/就绪探针 |
| 部署 | Nginx 反代 · PM2 · Let's Encrypt 自动续证 · 演示数据每日重置 |

## 🚀 快速开始

```bash
# 1) 后端（默认 127.0.0.1:3000）
cd server
npm install
cp .env.example .env     # 可选：填入 LLM Key 启用真模型；不填走确定性兜底
npm start                # 或 npm run dev

# 2) 前端（开发态 http://127.0.0.1:5180，自动代理 /api、/ws 到 3000）
cd store-app
npm install
cp .env.example .env
npm run dev
```

> 必须先启动后端（本项目无 mock 数据层）。后端未连接时页面会如实提示「后端未连接」。

其他前端命令：`npm run build`（多文件产物）· `npm run build:single`（单文件双击即开，仍需后端）· `npm run typecheck`。

## 🔐 环境变量（`server/.env`，仅本地，不入库）

| 变量 | 用途 | 缺省行为 |
| --- | --- | --- |
| `AUTH_SECRET` | HMAC 签发会话 token | 进程级随机密钥（重启后 token 失效，**演示前务必固定**） |
| `LLM_API_KEY` | 文本大模型 | 降级为本地确定性文案 |
| `LLM_VL_API_KEY` | 视觉识别 | 降级为通用陈列规则 |
| `LLM_BASE_URL` / `LLM_MODEL` | 文本模型地址/型号 | 通义千问 qwen 系列 |
| `LLM_VL_BASE_URL` / `LLM_VL_MODEL` | 视觉模型地址/型号 | qwen3-vl-plus |

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"  # 生成 AUTH_SECRET
```

真实密钥只存 `server/.env`（`.gitignore` 已覆盖 `**/.env`），仓库内只有占位模板。

## 👥 演示账号（虚构演示数据）

| 账号 | 密码 | 角色 | 落地页 |
|---|---|---|---|
| `liqiang` | `123456` | 业代 · 李强 | `#/rep/today` |
| `wangmin` | `123456` | 区域经理 · 王敏 | `#/manager/dashboard` |
| `zhangdajie` | `123456` | 店主 · 张大姐 | `#/owner` |

账号决定角色、角色决定可访问页面（路由守卫 + 后端鉴权双重隔离）；token 为 HMAC 签名、8 小时有效。

## 🎬 演示动线

- **业代（移动）**：今日线路 → 进店拍照 → AI 识别（工作链可见 qwen3-vl-plus）→ 标注图与问题双向高亮 →
  AI 追问 / 一键生成整改单或订货建议 → 回执前后对比
- **经理（桌面）**：区域看板（健康分布 / 趋势 / 风险 Top5）→ AI 晨报 → 下派任务（业代端 WebSocket 实时收到）
- **店主（移动）**：三步引导自助拍 → 大白话结果 → 一键订货（确认弹层）→ 实时看接单状态
- **跨角色闭环**：先在经理端下派，再切到业代端看待办实时弹出

## 📁 目录结构

```
store-app/        前端三端（views/rep · owner · manager）
  src/composables/  主题/相机/设备/震动/错误处理
  src/styles/       设计令牌 tokens.css（日夜双主题）
server/           Express API + WebSocket + SQLite
  src/forecast.js  Holt 指数平滑 + 动态安全库存补货算法（可溯源）
  mcp/             进销存 MCP 工具（效期/价签/库存）
deploy/           Nginx / PM2 / 每日重置脚本 / 部署手册
docs/             架构冻结文档 + 本轮扩展冻结设计规格
design-preview/   设计系统高保真稿（HTML）
```

数字（健康分 / 销量损失 / 补货金额）由后端 fixture 权威值与补货算法实时计算，可溯源；
标注坐标用 0–100 相对百分比，与图片像素解耦。

## ✅ 演示前检查清单

1. **`AUTH_SECRET` 已固定** —— 否则中途重启后端会让三端集体掉线（最容易翻车的一项）
2. 后端监听 `127.0.0.1:3000`（不要把 `HOST` 设成 `0.0.0.0`），`/health` 返回 `ok:true`
3. 三个端都已登录、页头显示当前角色
4. 不要在演示中途点「重置演示数据」（会清库并清空 uploads）
5. 生产模式（`NODE_ENV=production`）下口令清单接口已关闭、登录与 AI 接口均限流

部署到公网服务器的完整步骤见 [`deploy/服务器部署操作手册.md`](deploy/服务器部署操作手册.md)。

## 🔒 安全

- 真实密钥 / SQLite 数据 / 上传照片均不入库、不进版本库；公网健康检查不暴露内部信息
- 上传文件扩展名白名单 + `X-Content-Type-Options: nosniff`；默认拒绝式鉴权闸门；CSP / HSTS 等安全响应头

## 📄 许可

仅用于竞赛与学习演示。奶滴为原创图形；「蒙牛」及相关商标归其权利人所有。
