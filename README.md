# 店小C · 蒙牛 AI 巡店助手

> 拍一张货架照，AI 告诉你该怎么卖。
> 面向快消零售「人货场」的 AI 巡店与终端经营系统 —— 业代 / 店主 / 经理 / 管理员四端协同。

本项目为竞赛原型，前端 Vue 3 + TypeScript + Vite，后端 Node.js + Express + SQLite，
视觉识别接入通义千问 **qwen3-vl-plus**，文本生成接入 qwen 大模型（SSE 真流式），
无 API Key 时自动降级为确定性结果，保证离线演示不中断。

---

## ✨ 核心能力

- **AI 视觉诊断**：货架/冷柜/堆头/价签拍照 → SKU 陈列识别、缺货、竞品占位、黄金位、价签合规判定，问题在图上直接标注
- **千店千面行动方案**：结合门店动销、库存、临期、价盘，给出补货量（可解释算式）、陈列调整与竞争话术
- **AI 经营问答（ChatBI）**：经理用大白话问数据，答案引用真实指标、可下钻到单店
- **单店 AI 画像 / 智能补货模拟器 / AI 周报 / 体检报告（可打印导出）**
- **三端实时协同**：WebSocket 推送单据状态、管理员公告与工作沟通
- **四端分工**：
  - **业代（移动）**：拜访八步骤、GPS 签到+照片水印、AI 诊断、盘点临期、整改/订货回执
  - **店主（移动）**：自助诊断、智能补货推演、一键订货、实时接单
  - **经理（桌面）**：经营看板、AI 晨报、ChatBI、绩效排行榜、投屏大屏、数据导出
  - **管理员（桌面）**：账号派发、门店黑名单库、问题 SKU 规则、知识库、审计日志

## 🎨 设计语言

- 品牌色取蒙牛官方 **Pantone 7481C（#00B451）**，11 个语义色令牌（AI 专属智紫）
- 日 / 夜双主题，切换时从触点圆形涟漪扩散
- 招牌「牛奶注入奶滴」加载动效；44px 触控、WCAG AA 对比度、完整键盘与读屏支持
- 320px 手机 → 4K 桌面全终端响应式；可安装 PWA

## 🧱 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vue 3 · TypeScript · Vite · Pinia · Vue Router（hash）· ECharts（按需）· Leaflet |
| 后端 | Node.js · Express · better-sqlite3 · 原生 WebSocket（ws）· SSE |
| AI | DashScope qwen3-vl-plus（视觉）· qwen（文本流式）· MCP 数据工具 |
| 工程 | 零 CDN 零外链 · JWT 鉴权 · 限流 · CSP 安全头 · 全局错误边界 · 访问日志/探针 |
| 部署 | Nginx 反代 · PM2 · Let's Encrypt 自动续证 · 演示数据每日自动重置 |

## 🚀 本地运行

```bash
# 后端（默认监听 127.0.0.1:3000）
cd server
npm install
cp .env.example .env        # 可选：填入 DASHSCOPE_API_KEY 启用真模型；不填走兜底
npm run dev

# 前端（默认 5180，自动代理 /api 与 /ws 到 3000）
cd store-app
npm install
npm run dev
```

打开前端地址，登录页可一键填入演示账号（区域经理 / 业代 / 店主）。

## 📁 目录结构

```
store-app/          前端四端应用
  src/views/        rep 业代 · owner 店主 · manager 经理
  src/components/   业务组件与通用组件库
  src/composables/  主题/相机/设备/震动/错误处理等组合式能力
  src/styles/       设计令牌 tokens.css（日夜双主题）· 全局与动效
server/             Express API + WebSocket + SQLite
  src/index.js      接口契约入口
deploy/             Nginx / PM2 / 重置脚本
docs/               架构与冻结设计规格
design-preview/     设计系统高保真稿（HTML）
```

## 🔒 安全说明

- 真实密钥仅通过服务器上的 `server/.env` 注入，**不进入本仓库**（密钥模板见 `.env.example`，仅占位）
- 公网极简健康检查不暴露内部信息；上传文件扩展名白名单 + `nosniff`；默认拒绝式鉴权闸门
- 本仓库内的账号均为**演示用账号与虚构数据**，每日自动重置

## 📄 许可

仅用于竞赛与学习演示。产品图标中的奶滴为原创图形；“蒙牛”及相关商标归其权利人所有。
