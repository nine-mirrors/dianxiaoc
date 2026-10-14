# AICoding 架构设计 · 资料摘要

> 本文档做一件事：**精读主理人转交的全部原始资料，逐份、逐章节做出摘要**——后面任何人拿到这份摘要，都能通过章节号快速定位回原始文件的对应位置。

> 上游输入：主理人转交的全部原始资料（本轮实际形态为 md / ts / vue / json / js / mjs / mermaid / html，仓库内无 docx / pdf / pptx / xlsx）；
> 产出者：`knowledge-ingest-engineer`（知识摄入工程师 - 闻资料），经 G1 校验与人工审核通过后交付。

> **本轮目标系统**：店小C · 蒙牛 AI 巡店助手 Demo｜代码根目录 `C:/Users/21820/Desktop/蒙牛/03_产品Demo/`
> **下游交付范围**：高层架构设计 / 系统设计 / 部署设计 / 安全设计 / UserStory 五份文档（最终语言为简体中文）。

---

## 模版使用说明（本轮实际执行情况）

| 标记 | 含义 | 本轮处理 |
| --- | --- | --- |
| 占位符（尖括号形式的待填标记） | 必须替换或删除 | 全部替换为真实内容或删除 |
| 填写参考前缀 | 必须替换为真实内容或整行删除 | 已替换为真实内容 |
| 待填日期 / 数字 | 必须替换为真实数值 | 已替换为真实数值 |
| 事实缺口 | 最终必须替换 | 已转为「§3.2 资料缺口与待确认清单」中的具名条目，不使用缺口标记字样 |

**本轮两条填报纪律的实际落地**：

1. 定稿全文无残留占位符、无缺口标记字样。
2. 模板「类型枚举」原为 `docx / pdf / pptx / xlsx`；本轮转交资料**全部为代码仓库内的文本型文件**，因此 §1 的「类型」列按**实际扩展名**登记（md / ts / vue / json / js / mjs / mermaid / html / bat），并在 §1 表下说明原因。四类解析 Skill 的能力映射保留在附录 B。

---

## 0. 元信息

```yaml
标题: 店小C · 蒙牛 AI 巡店助手 Demo - 资料摘要 v1.0
版本: v1.0
状态: Draft（待 G1 自动校验 + 人工审核）
创建日期: 2026-10-10
整理人: knowledge-ingest-engineer（闻资料）
审核人:
  - team-lead（主理人）

原始资料清单:
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/PRD.md: v1.1 需求基线，定义演示什么、演到什么精度
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/ARCHITECTURE.md: v1.0 早期架构规划稿，文首自述已部分过期
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/README.md: 运行态事实源，30 个接口 + SSE + WebSocket，无 mock 层
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/启动说明.md: 本地启动与演示操作说明
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/产品定义书.md: v0.3 收敛版，赛道与差异化定义
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/最小需求清单.md: MVP 图纸，6 页面 + 实体 + AI 介入点
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/docs/产品复查_功能缺口与新增功能清单.md: 2026-10-10 只读复查报告
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/docs/class-diagram.mermaid: 实体关系类图（架构稿配套）
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/docs/sequence-diagram.mermaid: 三条核心流程时序图（含 mock 参与者）
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/产品主线图.html: 聚焦后的产品主线图
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/产品全景图.html: 产品全景架构图
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/server/src/: 后端 12 个源文件（Express + SQLite + LLM/CV + MCP + 算法）
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/server/mcp/inventory-server.mjs: 蒙牛进销存 MCP Server（stdio JSON-RPC）
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/server/: package.json / .env.example / .env / README.md / deploy.md / data/accounts.json
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/store-app/src/: 前端 72 个源文件（api / domain / fixtures / views / components / router / realtime / types）
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/store-app/: package.json / vite.config.ts / .env.example / .env
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/_smoke/: 22 项冒烟脚本（读取结论，不重跑）
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/_qa/: 7 个探针脚本 + 6 个 chrome 性能档案目录（读取结论，不重跑）
  - C:/Users/21820/Desktop/蒙牛/03_产品Demo/docs/测评报告.md: 当前为 0 字节空文件
```

| 版本 | 日期 | 作者 | 变更内容 |
| --- | --- | --- | --- |
| v1.0 | 2026-10-10 | `knowledge-ingest-engineer` | 初稿：登记 41 组资料、逐份逐章节摘要、登记 17 条冲突与 12 项资料缺口 |

### 0.1 术语表（本轮统一口径，含资料中新发现的补充条目）

| 术语 | 含义 / 出处 | 备注 |
| --- | --- | --- |
| 店小C | 产品最终命名，蒙牛 AI 巡店助手 | D1，§8 Q1 已拍板，落地于登录页标题与页脚 |
| 蒙牛 AI 巡店助手 | 产品全称 | D1，§文首 |
| 巡店 | 业代到终端门店检查陈列的工作动作（原文用词，不作替换） | D1，§0 名词 |
| 业代 · 李强（U_REP） | 核心角色，账号 `liqiang`，落地页 `/rep/today` | D32，users.json；D13，§ROLE_HOME |
| 区域经理 · 王敏（U_MGR） | 账号 `wangmin`，落地页 `/manager/dashboard` | 同上 |
| 店员/店主 · 张大姐（U_OWNER） | 账号 `zhangdajie`，落地页 `/owner` | 同上 |
| S1 家家悦 / S2 好邻居 / S3 美宜佳 / S4 华联 / S5 永辉 | 五家演示门店，门店 id 即 S1–S5 | D32，stores.json |
| P1 登录 / P2 今日巡店 / P3 拍照诊断 / P4 诊断结果 / P5 区域看板 / P6 店员自助 | 六个页面 | D1，§4 页面总览 |
| 健康分 | 终端陈列健康度总分（0–100），六维加权 | D1，§7.1 |
| D1 排面达标 0.30 / D2 缺货控制 0.25 / D3 价签合规 0.15 / D4 竞争位势 0.15 / D5 陈列执行 0.10 / D6 期效新鲜 0.05 | 健康分六维度与权重 | D31，§DIMENSIONS；D15，§DIMENSIONS |
| fixture | `store-app/src/fixtures/*.json`，演示数据权威值 | D1，§7.4 校验口径说明 |
| 千店千面行动方案 | 按门店类型生成补货 / 陈列 / 订货三段方案 | D1，§4 P4 模块 G |
| MCP 进销存 | `server/mcp/inventory-server.mjs`，暴露 3 个工具 | D24，§TOOLS |
| Holt 指数平滑 forecast | `server/src/forecast.js` 的需求预测与动态补货算法 | D16，§文件头 |
| SSE | 逐 token 流式输出，2 个端点 | D12，§ai/chat/stream |
| WebSocket | 挂在 `/ws` 的跨角色实时推送 | D18，§文件头 |
| 双模缓存 | Redis → 内置 RESP 服务（redis-lite）→ 内存 LRU 三级降级 | D17，§文件头 |
| 整改回执（Rectification） | 问题「标记已处理」→ 上传整改后照片 → 后端算整改后分 | D12，§rectifications；D30，createRectification |
| 待接单 / 已接单（TicketStatus） | 订货单状态 pending / accepted，业代确认接单后回写 | D30，§updateTicketStatus |
| 严重度调整系数 | 风险预判按缺口占比取 0.7 / 0.95 / 1.4 | D31，§RISK |
| 演示基准日 DEMO_TODAY | 固定 2026-10-02（周五 · 晴 22℃），与真实当天解耦 | D31，§DEMO_TODAY；D14，§DEMO_TODAY |
| AI_SOURCE_BADGE | AI 内容来源角标 llm / fallback / unknown，降级不得谎称 AI | D31，§AI_SOURCE_BADGE |
| V_T 前缀 | 新增巡店记录 id 前缀，与历史真实数据区分 | D14，§VISIT_ID_PREFIX |

---

## 1. 资料清单

> 列出全部原始资料，每份标注解析状态。解析失败或跳过的必须注明原因。
> **类型枚举说明**：本轮转交资料全部为代码仓库文本型文件，无 docx / pdf / pptx / xlsx，故「类型」列按实际扩展名登记；四类解析 Skill 的映射关系见附录 B。

| 编号 | 文件名 | 类型 | 来源 | 解析状态 | 说明 |
| --- | --- | --- | --- | --- | --- |
| D1 | `PRD.md`（77KB） | md | 产品经理 许清楚 | 已解析 | v1.1 需求基线，唯一权威；全章节精读 |
| D2 | `ARCHITECTURE.md`（62KB） | md | 架构师 高见远 | 已解析 | v1.0 早期规划稿，文首自述已部分过期；按声明只继承仍有效的分层与口径部分 |
| D3 | `README.md`（10.8KB） | md | 项目组 | 已解析 | 运行态唯一事实源；全章节精读 |
| D4 | `启动说明.md`（3.1KB） | md | 项目组 | 已解析 | 全章节精读 |
| D5 | `产品定义书.md`（2.5KB） | md | 产品经理 | 已解析 | v0.3 收敛版；全章节精读 |
| D6 | `最小需求清单.md`（3.6KB） | md | 产品经理 | 已解析 | 全章节精读 |
| D7 | `docs/产品复查_功能缺口与新增功能清单.md`（20.5KB） | md | 产品经理 许清楚 | 已解析 | 2026-10-10 只读复查；全章节精读，并逐条与当前源码比对时效性 |
| D8 | `docs/class-diagram.mermaid`（3.6KB） | mermaid | 架构师 | 已解析 | 实体关系类图；读取类定义与字段 |
| D9 | `docs/sequence-diagram.mermaid`（4.7KB） | mermaid | 架构师 | 已解析 | 三条核心流程；参与者含已移除的 mock handlers，判定为过期部分 |
| D10 | `产品主线图.html`（4.7KB） | html | 产品 | 已解析 | 标题「聚焦后的产品主线图」；读取标题与结构，未做视觉渲染 |
| D11 | `产品全景图.html`（5.2KB） | html | 产品 | 已解析 | 标题「产品全景架构图」；读取标题与结构，未做视觉渲染 |
| D12 | `server/src/index.js`（1464 行） | js | 后端 | 已解析 | 路由全量清点 + 鉴权闸门 / SSE / 上传 / 启动逻辑精读 |
| D13 | `server/src/auth.js`（264 行） | js | 后端 | 已解析 | 全文精读 |
| D14 | `server/src/db.js`（661 行） | js | 后端 | 已解析 | 建表语句 + 迁移 + fixture 装载精读 |
| D15 | `server/src/domain.js`（329 行） | js | 后端 | 已解析 | 权重 / 分档 / 双轨装配 / 视觉投射精读 |
| D16 | `server/src/forecast.js`（552 行） | js | 后端 | 已解析 | 参数表 + 核心推导函数精读 |
| D17 | `server/src/cache.js`（188 行） | js | 后端 | 已解析 | 三级缓存降级逻辑精读 |
| D18 | `server/src/realtime.js`（183 行） | js | 后端 | 已解析 | 握手鉴权 + 心跳 + 定向投递精读 |
| D19 | `server/src/mcpClient.js`（168 行） | js | 后端 | 已解析 | 子进程 stdio RPC + 超时降级精读 |
| D20 | `server/src/vision.js`（254 行） | js | 后端 | 已解析 | 视觉模型配置 + 逐层安全网阈值精读 |
| D21 | `server/src/dashboard.js`（185 行） | js | 后端 | 已解析 | 按区域重算 KPI 逻辑精读 |
| D22 | `server/src/env.js`（61 行） | js | 后端 | 已解析 | 全文精读 |
| D23 | `server/src/redisLite.js`（200 行） | js | 后端 | 部分解析 | 已读文件头与导出；**未逐行精读 RESP 协议实现细节**，原因：本阶段只需确认「内置 RESP 服务」这一事实，协议字节级实现不影响下游五份文档 |
| D24 | `server/mcp/inventory-server.mjs`（199 行） | mjs | 后端 | 已解析 | 工具清单与数据样本精读（结构性） |
| D25 | `server/package.json` | json | 后端 | 已解析 | 依赖与脚本；注意 description 仍写「17 个接口」 |
| D26 | `server/.env.example` + `server/.env` | 文本 | 后端 | 已解析 | 变量名全量登记；`.env` 的密钥值已脱敏读取，仅登记型号与地址 |
| D27 | `server/README.md`（76 行） | md | 后端 | 已解析 | 自述 17 接口 + mock 回退，与源码不符，已在 §3 登记 |
| D28 | `server/deploy.md`（128 行） | md | 后端 | 已解析 | 含 Nginx / PM2 部署步骤；环境变量表仍描述 mock 模式，已登记 |
| D29 | `server/data/accounts.json` | json | 后端运行时 | 已解析 | 三账号与角色映射，首次启动由代码落盘 |
| D30 | `store-app/src/api/`（4 文件） | ts | 前端 | 已解析 | 契约层全文精读（client / endpoints / index / error） |
| D31 | `store-app/src/domain/constants.ts` | ts | 前端 | 已解析 | 全文精读 |
| D32 | `store-app/src/fixtures/`（7 JSON + schema.ts + index.ts） | json/ts | 前端 | 已解析 | 演示数据权威值，全量读值并做数值校验 |
| D33 | `store-app/src/router/index.ts` | ts | 前端 | 已解析 | 路由表 + 权限守卫全文精读 |
| D34 | `store-app/src/realtime/client.ts` | ts | 前端 | 已解析 | WS 客户端全文精读 |
| D35 | `store-app/src/types/index.ts`（568 行） | ts | 前端 | 已解析 | 类型契约；按实体清点与关键类型精读，未逐行通读全部字段 |
| D36 | `store-app/src/views/`（7 文件） | vue | 前端 | 已解析 | 按主理人指令只做职责清点 + 关键跳转/订阅点精读，未通读全文 |
| D37 | `store-app/src/components/`（30 文件） | vue | 前端 | 已解析 | 按主理人指令只做清单清点，未逐个通读 |
| D38 | `store-app/package.json` + `vite.config.ts` + `.env.example` + `.env` | json/ts/文本 | 前端 | 已解析 | 依赖、构建、环境变量全量登记 |
| D39 | `_smoke/`（22 项）+ `_qa/`（7 脚本 + 6 档案目录） | mjs/py/ts/目录 | 验证 | 已解析（只读名称，不重跑） | 按主理人指令：脚本名即「已验证过哪些能力」的证据，登记为 §1.2 已验证能力清单 |
| D40 | `docs/测评报告.md` | md | 测评 | 已解析 · 空文件 | 文件大小为 0 字节，无任何内容可继承；已列入 §3.2 缺口 |
| D41 | `WorkBuddy召唤话术.md` | md | 产品 | 已解析 | 目录内补充资料，非主理人清单项；登记原始诉求表述 |

**本轮解析失败资料**：无。
**本轮跳过资料及原因**：无整份跳过。`server/src/redisLite.js`（D23）为**部分解析**，原因见上表说明。

### 1.1 资料规模实测（用于下游判断信息密度）

| 项 | 实测值 | 出处 |
| --- | --- | --- |
| 后端 `src/` 源码行数 | 4959 行（12 个 .js + 1 个 .mjs 合计） | D12–D24 |
| 前端 `src/` 文件数 | 72 个 | D30–D37 |
| 前端组件数 | 30 个（common 10 / business 14 / layout 3，含业务组件与图表组件） | D37 |
| 前端视图数 | 7 个（6 页面 + 占位页） | D36 |
| 后端 HTTP 端点实测数 | 30 个（29 个 `/api/v1/*` + `/health`），另有 `/ws` 与 `/uploads` 静态挂载 | D12，§启动统计 |
| 演示门店总数 | 128 家（S1–S5 为重点店，S101–S228 为区域样本） | D32，stores.json |
| 区域数 | 3 个（R_EAST 44 家 / R_SOUTH 42 家 / R_NORTH 42 家） | D32，stores.json |

### 1.2 已验证能力清单（由 `_smoke` / `_qa` 脚本名反推，未重跑）

| 脚本 | 归属 | 对应已验证能力 |
| --- | --- | --- |
| `smoke.mjs` / `smoke.ts` | D39 _smoke | 主流程冒烟（总入口） |
| `flow-check.mjs` | D39 _smoke | P2→P3→P4 主线流程 |
| `render-check.mjs` | D39 _smoke | 页面渲染 |
| `icon-check.mjs` | D39 _smoke | 内联 SVG 图标 |
| `highlight-check.mjs` | D39 _smoke | 问题清单 ↔ 标注框双向高亮联动 |
| `closure-check.mjs` | D39 _smoke | 跨角色闭环 |
| `p2-todo-check.mjs` | D39 _smoke | P2 待办提醒（任务下行） |
| `p5-check.mjs` | D39 _smoke | P5 经理看板 |
| `sse-check.mjs` | D39 _smoke | SSE 流式输出 |
| `ws-check.mjs` / `ws-e2e-check.mjs` | D39 _smoke | WebSocket 推送与端到端联动 |
| `auth-check.mjs` / `_auth-helper.mjs` | D39 _smoke | 鉴权与 token 校验 |
| `api-coverage.py` | D39 _smoke | 接口覆盖度盘点 |
| `forecast-check.mjs` | D39 _smoke | 补货算法推导接口 |
| `map-offline-check.mjs` / `offline-tip-check.mjs` | D39 _smoke | 地图无网降级与提示条 |
| `switch-fix-check.mjs` | D39 _smoke | 切换账号修复验证 |
| `shot-rep.mjs` | D39 _smoke | 业代端截图取证 |
| `final-check.mjs` | D39 _smoke | 交付前终检 |
| `_db-baseline.json` | D39 _smoke | 数据库基线快照 |
| `chrome-cdp`（目录） | D39 _smoke | 浏览器 CDP 自动化 |
| `probe-api.mjs` | D39 _qa | 接口层探针 |
| `probe-ui.mjs` | D39 _qa | 界面层探针 |
| `probe-a11y.mjs` | D39 _qa | 可访问性探针 |
| `probe-fault.mjs` | D39 _qa | 故障注入 / 降级探针 |
| `label-check.mjs` | D39 _qa | 文案与标签校验 |
| `probe-2.mjs` / `probe-3.mjs` | D39 _qa | 补充探针（未注明主题） |
| `chrome-prof` ~ `chrome-prof6`（6 个目录） | D39 _qa | Chrome 性能 / 行为档案 |

---

## 2. 资料内容摘要

> 逐份文档按自身章节结构做摘要。每条摘要标注章节号（`D编号，§章节`），后面任何人想核实某个点，直接定位回原文对应位置即可。
> 「引用方式」列取值：直接引用 / 数据提取 / 综合归纳 / 推断。凡标注「推断」的条目，均在摘要中显式写出推断风险。

### D1：`PRD.md`（v1.1 · 2026-10-09）

> 定义「演示什么、演到什么精度」的唯一需求基线；文首自述：技术实现以 ARCHITECTURE.md / README.md 为准，演示数字以 fixture 为准。

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D1，§修订记录 v1.0 | 初版 2026-10-02：基于产品定义书 v0.3 与最小需求清单，定义 6 页面 / 47 项需求池 / 5 家门店 / 健康分 6 维模型；当时假设技术形态为「纯前端 Vue + 本地 mock」 | 直接引用 |
| D1，§修订记录 v1.1 | 2026-10-09 五处修订：① 地图改为在线瓦片 + 无网降级；② 数字口径对齐 fixture（S3 补货改 27 瓶 / ¥108，区域看板环比改 ↑0.8 / ↓1.1pt / ↑1.9pt）；③ 账号登录取代角色自选（#1 变更、#4 作废、新增 #48）；④ 接口与架构描述更新为真后端实现；⑤ 需求池 #11 升级为 P1 | 直接引用 |
| D1，§文首权威性说明 | 本文档负责「演示什么、演到什么精度」；技术细节以 ARCHITECTURE.md 与 README.md 为准；数字以 `store-app/src/fixtures/*.json` 为准；三者冲突时以代码与 fixture 为准并回写本文档 | 直接引用 |
| D1，§0 交付边界 | 定位为校园创新大赛高保真可演示原型（非上线系统）；不做技术架构、不做数据库设计、不做真实模型训练 | 直接引用 |
| D1，§0 硬约束① | 不依赖真实摄像头（模拟拍照 + 相册上传两入口）；业务链路可离线；唯一需要网络的是 P2 巡店地图底图（高德在线瓦片），无网自动降级为浅灰静态示意图 + 提示条，点位与四档着色仍准确 | 直接引用 |
| D1，§0 硬约束② | 静态资源全部本地打包零 CDN（照片、内联 SVG 图标、系统字体栈、ECharts 按需引入）；唯一例外为地图瓦片在线请求 | 直接引用 |
| D1，§0 硬约束③ | AI 能力已接入真实大模型（千问 qwen-plus 文本 / qwen-vl-plus 视觉）；无 Key / 断网 / 上游失败时静默降级为本地预置文案，保证演示永不中断 | 直接引用 |
| D1，§0 名词 | 业代＝蒙牛业务代表；SKU＝具体单品；排面＝某 SKU 在货架占据的列/面位数；健康分＝终端陈列健康度总分（0–100） | 直接引用 |
| D1，§0.1 差异化定位 | 「打卡软件＝去过+拍了；AI 识别产品＝识别+看板；我们＝诊断+方案+闭环，是 Agent 不是工具」；输出物为健康分 + 问题清单 + 风险预判 + 行动方案；使用者为一线业代；是否闭环为是 | 直接引用 |
| D1，§1 目标1 | 一条主线三分钟跑通：业代全链路 90 秒内演示完毕，任意一步不依赖网络 | 直接引用 |
| D1，§1 目标2 | 三处 AI 介入点全部可视化：识别（真实出框 + 图例 + 原图/标注对比）、诊断（6 维打分过程可见）、对话（多轮追问给具体数字和话术） | 直接引用 |
| D1，§1 目标3 | 数据闭环证明有用：同一门店「上周 48 分 → 整改 → 本周 80 分」证据链；区域 8 周趋势（平均健康分 62→74、缺货率 18%→7%） | 直接引用 |
| D1，§2.1 角色定位 | 业代（李强）演示权重 60% / 3 个主页面；区域经理（王敏）30% / 1 个看板页；店员店主（张大姐）10% / 1 个轻量页 | 直接引用 |
| D1，§2.2 用户故事 | 业代 5 条（拍照即知不合格、AI 直接给补货量与摆位、像问老师傅一样追问、一键生成整改单并复查留证、离线可用）；经理 3 条（红灯排序、8 周趋势、下派并跟踪任务）；店主 2 条（随手拍冷柜、直接看到「建议订 27 瓶、约 ¥108」并一键下单） | 直接引用 |
| D1，§2.3 核心流程图 | 角色选择 →（业代）今日巡店 → 拍照 → 开始 AI 诊断 → 诊断结果 → 三分支（多轮追问 / 千店千面行动方案 / 生成整改单或订货建议）→ 门店状态更新为已完成 → 整改留证 48分→80分对比；经理分支为看板 → 下派任务 → 业代端待办同步；店员分支为引导页 → 拍照 → 轻量诊断 → 一键订货 | 直接引用 |
| D1，§3.1 配色 | 品牌主色 蒙牛绿 `#009639`；深绿 `#00662A`；浅绿 `#E8F5EC`；页面背景 `#F5F7F5`；卡片 `#FFFFFF`；文字主/次/弱 `#1A1F1C` / `#4B5563` / `#9CA3AF`；AI 专属强调色紫 `#6D3BF5`→`#9B6BFF` 渐变；待改进橙 `#FF9800`；缺货风险红 `#E02020`；竞品标识蓝 `#3B82F6` | 数据提取 |
| D1，§3.2 分档色 | 优秀 85–100 绿 `#009639` ✓；良好 70–84 黄绿 `#8BC34A` ◐；预警 60–69 橙 `#FF9800` △；风险 0–59 红 `#E02020` ✖ | 数据提取 |
| D1，§3.3 字体与尺寸 | 字体栈 `PingFang SC / HarmonyOS Sans / Microsoft YaHei`；主演示形态移动端竖屏 390×844（iPhone 14 视口），桌面内嵌手机壳；经理看板 1440×900（≤1024px 折叠）；圆角 12px 卡片 / 24px 按钮；间距基数 4px；图标线性 1.5px | 数据提取 |
| D1，§3.4 通用组件 | AI 徽标紫胶囊「✦ AI」；分数环 SVG 环色随分档，中间 48px/700 分数；进度型加载用分步文字流而非转圈；Toast / 成功页给「下一步去哪」 | 综合归纳 |
| D1，§4 页面总览 | P1 登录/角色选择 ★★ P0；P2 今日巡店 ★★★★ P0；P3 巡店拍照 ★★★★ P0；P4 诊断结果 ★★★★★ P0；P5 区域经理看板 ★★★★ P0；P6 店员自助 ★★ P0（简化版） | 数据提取 |
| D1，§4 P1 登录/角色选择 | 信息架构为品牌区 + 角色卡 ×3 + 演示模式说明；关键元素含 Slogan「拍一张货架照，AI 告诉你该怎么卖」、推荐角标、演示模式说明；交互为点击卡片 0.3s 过渡后 400ms 进对应首页；出口为业代→P2、经理→P5、店员→P6 | 综合归纳 |
| D1，§4 P2 今日巡店 | 顶部渐变头 + 三格概览（今日门店 5 / 已完成 2/5 / 平均健康分 85.5 ↑2.4）+ 待办提醒条 + 巡店线路 5 张卡 + 底部 Tab 4 项；卡片含序号圆点、店名、类型标签、距离、上次健康分、状态标签、操作按钮；S2 整改复查店显示 `48 → 80 (+32)`；含 Leaflet 4 + 高德在线瓦片的巡店地图（全屏 / 缩放 / 点击弹窗 / 无网降级提示条） | 数据提取 |
| D1，§4 P3 巡店拍照 | 门店确认卡 + 拍摄类型分段控件（冷藏柜/常温架/堆头）+ 照片三入口（模拟拍照 / 相册上传 / 换一张）+ 缩略图 ≤6 张 + 自动打卡行（GPS + 时间戳）+ 紫色渐变主按钮「✦ 开始 AI 诊断」；陌生照片走通用识别兜底，禁止白屏或原生报错 | 综合归纳 |
| D1，§4 P4 诊断结果 | 单页纵向 8 模块 A–H：A 顶部摘要 / B 健康分区（环形仪表 + 6 维条形 + 预计可提升至 89 分）/ C AI 识别标注图（标注图与原图对比滑块 + 图层筛选 chips + 图例）/ D 问题清单（严重度排序，左侧 4px 色条）/ E 风险预判（本周与月度瓶数与金额 + 推导依据展开）/ F AI 追问（气泡 + chips + 打字机 400ms/句）/ G 千店千面行动方案（补什么货 / 怎么摆 / 订多少）/ H 底部行动栏（生成整改单 / 生成订货建议） | 直接引用 |
| D1，§4 P4 补充 v1.1 | 实际已增至 11 个区块，新增 I 补货算法推导（Holt 平滑 → 单列日均 → 动态安全库存 z·σ·√L → 目标库存 → 建议补货量，并与业务基准并列对比）、J AI 订货建议理由、K AI 巡店小结、L AI 给店主的话术，均为点「生成」后千问流式出字 | 直接引用 |
| D1，§4 P4 加载态 | 全屏紫渐变遮罩 + 5 步文字流（上传 → 识别 14 目标 → 比对 C 类标准 → 结合近 4 周动销推理 → 诊断完成），每步约 600ms，合计约 2.4s，可在演示设置调至 4s | 直接引用 |
| D1，§4 P5 区域看板 | 桌面 1440 布局：顶栏 + KPI 卡 ×4 + 左（健康分布环图 + 门店明细表）+ 右上（近 8 周趋势 3 指标切换）+ 右下（风险预警 Top5 + 下派任务）；下派任务弹层字段为门店 / 任务类型（缺货补货、排面调整、价签整改、堆头执行）/ 时限 / 备注话术 / 指派给业代李强 | 直接引用 |
| D1，§4 P5 成功态 | 下派任务成功 → Toast「任务已下发给 业代·李强」→ 切角色到业代端 → P2 顶部待办新增同一条任务卡片；文档标注此联动为「整个 Demo 讲闭环的关键证据，必须验证通过」 | 直接引用 |
| D1，§4 P6 店员自助 | 引导页 3 步（拍照 → AI 看 → 一键订货）+ 轻量拍照页（去掉门店确认卡与拍摄类型，仅一张冷柜照）+ 轻量诊断结果（复用 C 识别图 + G 行动方案，隐藏内部维度术语）+ 一键订货成功页；明确不出现「健康分 / 维度 / 雷达」等内部术语 | 直接引用 |
| D1，§4.7 跳转总表 | 13 条跳转关系；其中 P5「下派任务 → 确认」标注 ★联动，P4 只读历史态由 `?readonly=1` 进入 | 数据提取 |
| D1，§5 需求池 | 共 48 项：P0 37 / P1 9 / P2 2。关键项：#1 三角色切换已变更（→#48）；#4 角色卡主次区分已作废；#11 巡店地图升级为 P1；#29 AI 多轮追问为真实大模型 SSE 流式 + 6 组兜底问答库；#38 门店明细表演示环境展示 5 家重点店（区域总量 128 家为业务规模口径），扩到全量 128 行前需加虚拟滚动；#41 图例联动筛选未实现（10-22 前不做）；#45 全站离线本地化零 CDN，地图瓦片为唯一在线请求；#48 账号密码登录与角色权限隔离（v1.1 新增，取代 #1/#4） | 数据提取 |
| D1，§6.1 五家门店 | S1 家家悦 A 类连锁超市 6/12/1，91 优秀；S2 好邻居 C 类便利 3/5/0，上周 48 风险 → 本周 80 良好（+32）；S3 美宜佳 C 类便利 4/5/0，72 良好偏弱，执行后预计 89，★主线演示店；S4 华联 B 类大卖场 4/8/1，64 预警；S5 永辉 B 类社区生鲜 4/8/1，43 风险，★看板红色告警 + 下派任务目标店。今日线路初始态：已完成 2（S1 91、S2 80）/ 待巡 3，平均健康分 85.5，S5 红点告警 | 数据提取 |
| D1，§6.2 区域看板 | 区域平均健康分 76.6（↑0.8，目标 80）；红灯门店 12 家（↓5）；本周缺货率 7.2%（↓1.1pt）；蒙牛铺货率 86.4%（↑1.9pt）。健康分布 优秀 42（32.8%）/ 良好 53（41.4%）/ 预警 21（16.4%）/ 风险 12（9.4%）= 128 家。近 8 周：健康分 62.1→74.3；缺货率 18.4→7.2；铺货率 71.2→86.4 | 数据提取 |
| D1，§6.3 标注图脚本 | S3 开门正面拍冷藏柜，第二层为蒙牛专属 4 列位；识别共 14 项（8 蒙牛 SKU + 1 空位 + 2 竞品 + 3 价签问题）；框色约定：蒙牛正常绿实线 / 缺货预警橙实线 / 空位红虚线 / 竞品蓝虚线 / 价签橙色角标 / 堆头未执行橙虚线大框；实现方式为前端覆盖层绘制，数据来自 fixture JSON，预留接口供后续替换为真实模型坐标 | 综合归纳 |
| D1，§6.4 对话脚本 | 6 轮主脚本 Q1–Q6 + 2 兜底策略；Q2 明确「合计 27 瓶 / ¥108（12+9+6 瓶，48+36+24 元），覆盖 3 天动销」；Q1 给出黄金层单列日均 11 瓶 vs 底层 5.2 瓶（差 2.1 倍）；Q4 给出味全毛利 ¥0.8 vs 优益C ¥1.2（高 50%） | 数据提取 |
| D1，§6.5 视频脚本 | 90 秒主线 9 段：0:00 角色选择 → 0:08 今日巡店 → 0:18 拍照 → 0:28 加载动画 → 0:33 健康分与识别图 → 0:48 风险与追问 → 1:05 行动方案 → 1:20 经理看板下派 → 1:32 回业代端看整改闭环（48→80） | 数据提取 |
| D1，§6.6 素材注意 | `02_实拍素材` 目录当前仅有拍照指引文档、尚无实拍照片；未到位前使用合成高保真货架示意图占位；换图机制必须「只换文件不动代码」，前端通过门店 fixture 引用路径 | 直接引用 |
| D1，§7.1 六维权重 | D1 排面达标 30%（加权冷柜 0.5 + 常温架 0.3 + 堆头 0.2，>100 封顶）/ D2 缺货控制 25%（100 − 缺货数×12 − 预警数×5）/ D3 价签合规 15%（100 − 缺失×8 − 不符×5）/ D4 竞争位势 15%（蒙牛排面/(蒙牛+竞品)×标准份额系数×100，黄金层被占 −15 分/列）/ D5 陈列执行 10%（已执行/应执行×100，无活动要求按满分）/ D6 期效新鲜 5%（100 − 临期×20 − 过期×50，无数据默认 85）。总分 = Σ(维度得分 × 权重)，四舍五入取整 0–100 | 直接引用 |
| D1，§7.2 分档规则 | 优秀 85–100 标记保持；良好 70–84 本周内处理、不进经理预警；预警 60–69 自动进经理风险预警清单（第 2 梯队）；风险 0–59 自动进 Top 预警 + 建议 24h 内整改、允许经理下派任务 | 直接引用 |
| D1，§7.3 风险公式 | 单 SKU 日均潜在损失 = 近 4 周日均动销 × 排面缺口占比 × 排面弹性系数（0.35）；本周 = Σ × 7；本周金额 = 瓶数 × 单瓶零售指导价；月度 = 本周 × 4.3。S3 代入：11 × 37.5% × 0.35 ≈ 3.9 瓶/天 → 本周 ≈ 27 瓶 → ¥108 → 月度 ≈ 117 瓶 / ¥468 | 直接引用 |
| D1，§7.4 fixture 分值 | S1 92/95/85/88/90/90 → 91 优秀；S2 整改后 82/80/78/72/85/90 → 80 良好；S2 整改前 50/30/60/45/40/65 → 48 风险；S3 76/68/70/62/82/85 → 72 良好；S4 68/52/75/70/45/80 → 64 预警；S5 48/30/55/38/40/60 → 43 风险 | 数据提取 |
| D1，§7.4 校验口径说明 | S2 整改前六维加权计算值为 45.5，但页面展示 48，为有意为之（`diagnoses.json` 带 `scoreOverride: 48`），用于讲「整改前 48 → 整改后 80（+32）」的闭环叙事；六维明细是构成明细、总分是业务口径权威值，不是数据错误。另注明演示数据以 fixture 为准，公式用于现场/新增照片的动态计算路径，两者允许 ±3 分偏差 | 直接引用 |
| D1，§8 待确认存档 | 5 条历史问题均已拍板：Q1 产品命名定为「店小C」；Q2 实拍照片已用占位图 + 换图机制解决；Q3 技术形态由纯前端 mock 推翻为真后端；Q4 采用混合形态（业代/店员竖屏 + 经理 1440 桌面）；Q5 AI 追问升级为预设库兜底 + 默认真 LLM SSE 流式 | 数据提取 |
| D1，§9 交付说明 | 需求池 48 项 = P0 37 / P1 9 / P2 2；建议先做 P1→P2→P3→P4 主线再做 P5→P6；PDF/视频可直接引用 §6.1/§6.2 数字（以 fixture 为准，勿用 v1.0 初版数值） | 直接引用 |
| D1，§9.1 技术架构现状 | 前端 Vue 3（script setup + TS）+ Vite 5 + Pinia + vue-router 4（hash 模式）+ Tailwind 与 CSS 变量双轨 + ECharts 5 按需 + 内联 SVG + Leaflet 4；后端 Express 真后端（21 个 REST 端点 + 2 个 SSE 流式端点 + WebSocket `/ws`）+ SQLite 持久化（stores / skus / visits / diagnoses / tasks / tickets）；大模型 qwen-plus 文本 + qwen-vl-plus 视觉；MCP 进销存暴露 `get_batch_expiry` / `get_price_book` / `get_store_inventory`；补货算法 `server/src/forecast.js`（Holt → 单列日均 → z·σ·√L → 建议补货量）；缓存双模 Redis / 内存 LRU + TTL；实时为 WebSocket 推送 + SSE 逐 token；鉴权为账号密码登录、身份由后端裁定；离线策略为地图瓦片唯一在线请求 + AI 静默降级 | 直接引用 |
| D1，§9.1 冲突声明 | 本节与 v1.0 初版冲突处以本节为准；初版假设「纯前端 + 本地 mock + 17 接口契约」，实际已升级为真后端 21+ 端点 + 真实模型能力 | 直接引用 |

### D2：`ARCHITECTURE.md`（v1.0 · 2026-10-02）

> 早期架构规划稿；**文首自述已部分过期**，仅保留分层架构、数据流、口径设计中仍有效的部分。

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D2，§文首过期声明 | 文档为 v1.0 早期规划稿，已部分过期；当前真实实现以 README.md 与 PRD.md v1.1 为准（真后端 30 个 REST 端点 + 2 个 SSE 流式 + WebSocket 实时推送，无 mock 层） | 直接引用 |
| D2，§文首已知过期点 | ① 文中「17 个接口」实为 30 个 REST + 2 个 SSE；②「mock 默认 / `VITE_API_MODE=mock`」已移除，现为 http 真后端；③ Phase 2 的部分「不实现」条目已实现（AI 文案、视觉识别、实时推送） | 直接引用 |
| D2，§0 铁律1 | API 层是唯一「假后端」也是将来真后端契约：页面 → `src/api/index.ts` → `client.ts` →（mock handlers 或 endpoints）；页面永不 import fixtures 与 api/mock；每方法签名 = 真实 REST 接口；Phase 2 只改 client.ts 分发开关 + 补全 endpoints.ts，页面一行不动 | 直接引用 |
| D2，§0 铁律2 | 一切资源本地化零外网请求：字体系统栈、图标内联 SVG、ECharts 按需引入、图片放 public；验收方式为断网 + Network 面板外域请求数 = 0 | 直接引用 |
| D2，§0 铁律3 | 数据以 fixture 为准、公式只做兜底：预置 5 家店的分数 / 风险数字 / 对话答案全部直接读 fixture 权威值；7.1/7.3 公式只在陌生照片兜底路径启用 | 直接引用 |
| D2，§0 校验结论 | 已用权重回算校验：S1/S2后/S3/S4/S5 与 PRD 表误差 ≤0.35 分，S2 整改前差 2.5 分（在 PRD 允许 ±3 内）；显示一律取 fixture 值 | 直接引用 |
| D2，§1.1 整体形态 | 单页应用 Vue 3 + Vite，6 个页面级视图；数据来源 Phase 1 本地 JSON fixture + 模拟 API（主线），Phase 2 Node/Express + SQLite（仅设计预留）；演示尺寸业代/店员 390×844、经理 1440×900（≤1024 折叠）；AI 能力 100% 本地规则引擎；持久化内存对象 + localStorage 镜像 | 直接引用 |
| D2，§1.2 选型 | Vue 3 ^3.4.38 / Vite 5 ^5.4.3 / TypeScript ^5.5.4（宽松模式，类型报错不阻塞 dev 与 build）/ vue-router 4 ^4.4.3 / Pinia ^2.2.2 / ECharts 5 ^5.5.1 按需（约 350KB）/ Tailwind CSS 3 + CSS 变量 / 内联 SVG 图标 / 系统字体栈 / 原生 fetch（不装 axios）/ vite-plugin-singlefile ^2.0.2 | 数据提取 |
| D2，§1.3 四层目录 | 视图层 views → 组件层 components → 领域层 domain（纯函数）→ 数据层 api + fixtures；依赖方向严格单向向下，domain 不允许 import 任何上层与 api | 直接引用 |
| D2，§1.4 明确不做 | 不做真实鉴权或 JWT 校验、微服务、真实摄像头强制调用、在线地图（静态 SVG 代替）、SSR、单元测试框架、i18n、复杂动画库、真实支付下单 | 直接引用 |
| D2，§2 目录与文件列表 | 规划文件数：配置 8 + 源码约 48 ≈ 56 个；列出 public/stores 照片命名规范（S1–S5 的 cold / ambient / stack，S2 另含 cold_before，fallback/generic-shelf）、api / fixtures / domain / stores / components / views / composables / styles 各层文件名 | 综合归纳 |
| D2，§3.3 接口清单 | 规划 17 个接口（统一前缀 `/api/v1`，统一信封 `{ code, message, data }`）：meta/roles、session/login、stores、stores/:id、visits/today、visits、visits/:id、visits(POST)、diagnoses(POST)、diagnoses/:id、ai/chat、ai/chat/suggestions、tickets、tasks、tasks(POST)、tasks/:id(PATCH)、dashboard/overview | 数据提取 |
| D2，§3.3 说明 | 演示版不引入轮询/SSE，`steps[]` 随响应一并返回由 `useLoadingSteps` 播放；真实后端若改异步任务，只需把 diagnoses 拆成 POST 返回 jobId + GET 轮询，前端仍只改 api/index.ts | 直接引用 |
| D2，§3.4 Phase2 映射 | 接口 → Express 路由 → SQLite 表的映射预留（users / stores / store_standards / store_photos / visits / visit_photos / diagnoses / annotations / dimension_scores / issues / risk_items / action_items / chat_messages / tickets / ticket_items / tasks / 视图聚合） | 数据提取 |
| D2，§5.4 权重回算校验表 | S1 公式 90.80→91 vs fixture 91（−0.20）；S2 整改后 80.10→80 vs 80（+0.10）；S2 整改前 45.50→46 vs 48（−2.50，±3 内）；S3 72.05→72 vs 72（+0.05）；S4 63.65→64 vs 64（−0.35）；S5 42.85→43 vs 43（−0.15）。结论为显示一律取 fixture 权威值，S2 整改前以 48 展示 | 数据提取 |
| D2，§5.5 风险预判 | 给出 `predictRisk` 伪代码：gapRatio =（标准 − 实际）/ 标准；dailyLoss = 日均动销 × gapRatio × GAP_FACTOR × ELASTICITY；weeklyBottles = Σ × 7；monthly = weekly × 4.3 | 直接引用 |
| D2，§5.5 不自洽说明 | 按 PRD 7.3 字面公式 `11 × 37.5% × 0.35 = 1.44 瓶/天`，但成品数字是 3.9 瓶/天 → 27 瓶/周 → ¥108；反向验证为 `11 × 0.35 = 3.85 ≈ 3.9`，`×7 = 26.95 ≈ 27`，`×4.0 = 107.8 ≈ 108`，`×4.3 = 115.9 ≈ 117`，`×4.0 = ¥463 ≈ 468`。工程默认值为预置门店的 dailyLossBottles 直接由 fixture 提供（3.9），derivation 文案由 fixture 提供，公式（GAP_FACTOR=1.0、ELASTICITY=0.35）仅在兜底路径使用 | 直接引用 |
| D2，§5.6 问题与方案 | `buildIssues` 按 severe > medium > low 排序；`buildPlan` 按门店类型决定排面标准与补货系数，补货量 =（标准列数 − 有效列数）× 单列容量，再按到店间隔天数 × 日均动销取安全库存；S3 期望输出 优益C100ml×12(¥48) / 优益C450g×9(¥36) / 真果粒250ml×6(¥24) → 合计 27 瓶 ¥108，覆盖 3 天 | 数据提取 |
| D2，§5.7 对话引擎 | 归一化 → 关键词打分（命中数 × 权重，阈值 ≥2 视为命中）→ 命中取 chat-qa.json 全文并可返回 highlightSection → 未命中且 llmAdapter.enabled 则调 LLM，失败或超时 3s 静默降级 → 仍未命中返回兜底话术 + 3 个推荐问题 | 综合归纳 |
| D2，§6 任务列表 | T01 项目基础设施与设计系统 / T02 数据契约层（fixture + 模拟 API）/ T03 领域计算模块（纯函数）/ T04 业代端主线 P2→P3→P4 / T05 P1 登录壳 + P5 看板 + P6 店员端 + 闭环联动，均标记为已完成 | 综合归纳 |
| D2，§9 待明确 #1 | 风险公式与 PRD 数字不自洽，建议以成品数字为准（预置店 dailyLossBottles 与推导依据文案直接写进 fixture），备选是把弹性系数改成 0.945 使公式自洽但不推荐；影响 P4 风险卡数字与 PDF 引用一致性 | 直接引用 |
| D2，§9 待明确 #3 | S2 整改前 48 分 vs 公式 45.5，差 2.5 分在 ±3 内；建议按 48 展示（「48 → 80 (+32)」是闭环核心文案），公式仅作解释不作为显示来源 | 直接引用 |
| D2，§9 待明确 #4 | 现场演示形态建议两个都做：`build` 产出常规 dist 用 preview，`build:single` 产出单文件 HTML 作灾备（双击即开，不需要任何服务器/网络） | 直接引用 |
| D2，§9 待明确 #5 | P1 增强项（双向高亮 / 图层筛选 / 整改前后对比 / 手机壳 / 静态地图 / 多图）按序做、做不完直接砍；第 1 项双向高亮性价比最高建议至少保住，第 7、8 项可砍 | 直接引用 |
| D2，附 覆盖自检 | P0（37 项）100% 覆盖；P1（8 项）全部排入增强项；P2（2 项）为静态地图与演示设置面板；明确裁剪线为 P1/P2 全部砍掉后 P0 主线依然完整可演示 | 数据提取 |

### D3：`README.md`（运行态事实源）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D3，§标题与导语 | 定位为高保真演示原型（校园创新大赛作品）；覆盖业代 / 区域经理 / 店员店主三角色；**全站真实后端 + 真实大模型，无任何 mock 兜底** | 直接引用 |
| D3，§运行态声明 | 唯一数据通路 = Express 真后端（含 SQLite、千问 LLM/CV、MCP 进销存、补货算法、Redis 缓存、WebSocket 推送）；AI 对话 / 巡店小结 / 订货理由 / 给店主话术均为真实大模型流式输出；后端不可用时**如实报错并提示**，不再偷偷降级为假数据 | 直接引用 |
| D3，§目录结构 | `03_产品Demo/` 下 store-app（前端 Vue3 + Vite + TS + Pinia）、server（真后端 Express + SQLite，提供 30 个 REST + SSE + WebSocket）；store-app 单独即可完整演示全部功能；**server 必须启动**（3000 端口），无 mock 层，后端未起时页面显示「后端未连接」且没有数据 | 直接引用 |
| D3，§快速开始 | `npm run dev` 实际使用 http://127.0.0.1:5180（演示统一端口）；`npm run build` 标准构建；`npm run build:single` 单文件构建（JS/CSS 内联，仍需后端在 3000 端口运行）；`npm run preview` → 4173；`npm run typecheck` 走 vue-tsc | 数据提取 |
| D3，§环境变量 | `VITE_API_BASE` 默认 `http://127.0.0.1:3000`（唯一数据通路，无 mock 开关）；`VITE_API_MODE` 固定 `http`（保留字段，仅为兼容旧配置） | 数据提取 |
| D3，§业代端路径 | P2 今日路线 + 5 家门店卡 + 经理下派待办提醒；P3 上传/选择货架照 → AI 识别动画 → 生成诊断；P4 为 A–H 八模块，含双向高亮（悬停问题项 → 对应框点亮；悬停标注框 → 对应问题卡高亮，整簇联动）、AI 能力（对话追问 SSE 流式、巡店小结、订货建议理由 SSE 流式联网走真模型）、生成整改单/订货建议 → 提交成功页 → 返回 P2 绿色闪光 | 综合归纳 |
| D3，§经理端路径 | 桌面端 1440×900：区域经营看板（概览环形图 + 趋势折线 + 风险 Top5）；点击下派任务 → 选门店/任务类型/时限 → 写入任务库（持久化） | 综合归纳 |
| D3，§店员端路径 | 三步引导 → 轻量拍照（可自拍任意货架）→ 口语化结果 → 一键订货成功；不出现「健康分 / 六维度」等内部术语 | 直接引用 |
| D3，§跨角色闭环 T05.3 | 经理在 P5 下派任务 → 任务写入 SQLite 真库（`server/data/store.db`）→ 通过 WebSocket 实时推送到业代端 P2，无需刷新；演示时可先开经理端下派再切业代端看实时弹出待办 | 直接引用 |
| D3，§真后端能力 | 多轮追问 `/api/v1/ai/chat` 与流式版 `/api/v1/ai/chat/stream`；AI 生成（巡店小结 / 订货理由）`/api/v1/ai/generate` 与流式版 `/api/v1/ai/generate/stream`；任务下派 / 巡店记录等 REST 资源 | 数据提取 |
| D3，§SSE 降级 | SSE 端点若因无 Key / 上游失败会降级为一帧全文（保证界面有内容，不白屏） | 直接引用 |
| D3，§鉴权 T1/T2 | 除登录与公开元数据外，所有 `/api/v1/*` 接口都必须带有效 token；token 格式 `username.ts.exp.hmac`，HMAC-SHA256 签名，8 小时过期，验签用 timingSafeEqual 防时序攻击；兼容回退 `?token=`（SSE 的 EventSource 与 img 标签无法自定义请求头，token 本身仍需验签）；角色校验为下派任务限 manager、任务回执限 rep，不匹配返回 403；白名单为 `POST /api/v1/auth/login`、`GET /api/v1/auth/demo-accounts`、`GET /api/v1/meta/roles`、`GET /health` | 直接引用 |
| D3，§密钥配置 T3 | 真实密钥只存 `server/.env` 不进仓库，仓库只有 `.env.example` 模板；`AUTH_SECRET` 未配置则用进程级随机密钥 + 打印警告（重启后所有 token 失效）；`LLM_API_KEY` 缺省降级为本地关键词匹配；`LLM_VL_API_KEY` 缺省降级为通用陈列规则；`LLM_BASE_URL` / `LLM_MODEL` 缺省通义千问 qwen-plus；`LLM_VL_BASE_URL` / `LLM_VL_MODEL` 缺省通义千问 qwen-vl-plus | 数据提取 |
| D3，§密钥警告 | 演示环境为方便评委自助登录，`GET /api/v1/auth/demo-accounts` 会连同密码一起下发演示账号清单，这是校园演示专用设计，真实系统绝不会回传密码 | 直接引用 |
| D3，§演示数据 | 5 家门店（S1 家家悦、S2 好邻居、S3 美宜佳、S4 华联、S5 永辉）均可点入 P4 完整演示；S2 额外提供整改前 `cold_before.jpg` 对比图；标注坐标为 0–100 相对百分比，与图片像素解耦，换实拍图只需改 Fixture 坐标、组件代码不动；数字由后端 fixture 权威值 + 补货算法实时计算，可溯源 | 直接引用 |
| D3，§技术栈 | 前端 Vue 3 + TypeScript + Vite 5 + Pinia 2 + vue-router 4（hash 模式）；图表 ECharts 5；地图 Leaflet 4 + 高德瓦片（免 key 直连，P2 支持全屏与缩放）；后端 Node + Express + SQLite + DashScope 千问（qwen-plus 文本 / qwen-vl-plus 视觉）；AI 流式 SSE 两个端点逐 token 出字；MCP 进销存零依赖 stdio JSON-RPC 暴露 3 个工具；补货算法 `server/src/forecast.js`；缓存双模（配置 REDIS_URL 走 Redis，否则自动退化为内存 LRU + TTL） | 直接引用 |
| D3，§演示账号 | `liqiang` / `123456` 业代李强 → `#/rep/today`；`wangmin` / `123456` 区域经理王敏 → `#/manager/dashboard`；`zhangdajie` / `123456` 店员店主张大姐 → `#/owner`；登录页点「演示账号」按钮可一键填入；账号决定角色、角色决定可见页面（用 wangmin 访问 `#/rep/diagnosis/D_S3` 会被守卫送回经理首页）；安全阀为未登录 / 跳过登录 / 直接点链接时不做拦截；另有手机号 + 验证码登录路径（演示态任意 6 位数字） | 数据提取 |
| D3，§演示注意 | 必须先起后端否则页面顶部提示「后端未连接」；单文件产物双击即开但仍需后端运行；演示速度倍率 / 骨架屏开关在桌面端手机壳外的设置齿轮里；登录态写入 localStorage，刷新自动恢复，后端重启需重新登录（token 8 小时有效）；评委追问「数字怎么来的」时 P4 风险卡可展开推导依据，补货量口径见 forecast.js，效期/价签来自 MCP 进销存工具 | 综合归纳 |

### D4：`启动说明.md`

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D4，§一 环境要求 | Node.js ≥ 22.5（用到内置 `node:sqlite`）；低于该版本会报 `node:sqlite` 找不到模块 | 直接引用 |
| D4，§二 启动顺序 | 第 1 步先起后端（3000 端口，`cd server && npm start`），成功标志为「✅ 店小C 后端已启动：http://127.0.0.1:3000 / 30 个接口契约就绪，实时推送：/ws」；第 2 步起前端（5180 端口）；第 3 步访问 http://127.0.0.1:5180/ | 直接引用 |
| D4，§三 演示账号 | 三个账号密码统一 `123456`；答辩演示建议开两个浏览器窗口（左经理右业代），经理下派任务后业代窗口实时弹出提醒 | 直接引用 |
| D4，§四 常见问题 | 页面顶部黄条「后端未连接」= 后端没起；登录页读不出账号 = 后端未启动；端口被占用可用 `start-all.bat` 一键启停；首次进「拍照诊断」很慢（视觉模型 1–9 秒），录视频前先点一次预热；地图不显示需联网加载瓦片，断网自动降级为浅灰示意图 | 数据提取 |
| D4，§五 录屏建议 | 窗口放大约 1440×900 并 F11 全屏；开录前完整走一遍；先点一次「拍照诊断」预热视觉模型；保持后端终端开着，中途不要重启（重启需重新登录，token 失效） | 数据提取 |

### D5：`产品定义书.md`（v0.3 收敛版 · 2026-10-01）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D5，§一 核心场景 | 蒙牛业代的 AI 巡店助手；业代是蒙牛自己人、拍照是本职，落地性零争议 | 直接引用 |
| D5，§二 一条主线 | 业代拍蒙牛货架 → AI 识别 → 终端健康度诊断（健康分 + 风险预判 + 追问）→ 输出动态监测结论 + 千店千面选品/行动方案 → 数据汇聚 → 区域经理看板；官方三方向（终端健康度预判 / 行业动态监测 / 千店千面动态选品）在该流程中自然融合 | 综合归纳 |
| D5，§三 三角色主次 | 业代端核心必做（拍照、诊断、巡店任务、整改留证）；经理看板顺势（健康地图、风险预警、趋势、派任务）；店员端延伸轻量（业代引导店主自助诊断/订货） | 直接引用 |
| D5，§四 落地性 | 快消品牌本就在别人的杂货架里管自己的那几格，属行业标准工种；只拍蒙牛所在冷柜/常温架/堆头，范围小而明确；AI 目标检测从复杂背景识别特定商品为成熟技术（95%+ 准确率主张）；真正难点是陌生店员配合，故以业代端为核心规避 | 直接引用 |
| D5，§五 AI 内核 | ①多模态识别（SKU、缺货空位、价签、竞品、物料、冰柜）②知识库 Skill（产品目录、陈列标准、促销规则）③诊断推理（两轮追问 → 三套方案，对标奶牛 AI 医生）④健康分模型（打分、风险分级、趋势预判）⑤能力边界（复杂客情/费用/合同转人工） | 数据提取 |
| D5，§六 差异化 | 打卡软件＝去过+拍了；AI 识别＝识别+看板；我们＝诊断+方案+闭环，是 Agent 而非工具 | 直接引用 |
| D5，§七 交互 | 拍照诊断为主（高效）+ 对话追问（智能），结合 A/B/C 三种交互 | 直接引用 |
| D5，§八 PDF 讲什么 | 为什么做（背景/痛点/为什么是 AI）→ 做什么（产品/主线/功能/差异化）→ 怎么做（技术/Demo/落地/效果）→ 谁来做（团队） | 数据提取 |

### D6：`最小需求清单.md`（MVP 图纸）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D6，§一 页面清单 | 6 个页面：登录/角色选择（三角色入口，演示用无需真实注册登录）、业代今日巡店（线路列表 + 打卡入口 + 顶部三数据）、巡店拍照（选门店 + 上传或拍摄三种部位 + 开始 AI 诊断）、诊断结果（健康分大数字 + 标注图 + 问题清单 + 风险预判 + 多轮追问 + 千店千面方案 + 一键生成整改单/订货建议）、经理看板（健康度分布 + 风险预警 + 趋势图表 + 派任务）、店员端（轻量自助拍照诊断/订货，一个引导页） | 综合归纳 |
| D6，§二 数据实体 | Store（id/名称/类型/地址/负责人）、SKU（id/名称/品牌/品类/规格）、Visit（id/门店/时间/照片/健康分）、Diagnosis（识别到的 SKU/排面数/缺货项/价签问题/风险）、Action（建议事项/订货量/整改项）、User（姓名/角色） | 数据提取 |
| D6，§三 AI 介入点 | 图像识别（货架照片 → SKU/排面/空位/价签，演示可先用模拟标注）、诊断推理（识别结果 + 陈列标准知识库 → 健康分/问题/风险/方案）、多轮对话（业代追问，AI 结合该店情况回答） | 直接引用 |
| D6，§四 技术建议 | 两步走：第一步保底纯前端 + 模拟 API 层（Vue，双击 HTML 即可离线演示）；第二步完整版真实后端（Node/Express + SQLite，本地前后端联调）；但现场演示默认走第一步纯前端稳妥路径；通用约定为 AI/识别先用演示数据，真实模型能力作为技术规划写进 PDF | 直接引用 |
| D6，§五 演示数据 | 3–5 家示例门店（不同类型）；每家预置货架照片、SKU、健康分、问题、方案；保证打开就能演示完整流程，不依赖现场网络 | 直接引用 |

### D7：`docs/产品复查_功能缺口与新增功能清单.md`（2026-10-10 只读复查）

> 复查对象为 store-app/src/views（7 页面）、components/business（13 组件）、server/src（2575 行）；基线为 PRD v1.0（47 项）；**距 2026-10-22 截止 12 天**。
> ⚠ 本报告的判定与 2026-10-10 23:04 的当前源码状态存在偏差，已在 §3 冲突 X17 登记。

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D7，§摘要 | 主线完整度约 85%（P2→P3→P4→行动方案→生成单据→状态回写已跑通）；闭环完整度约 50%（诊断→开方完整，执行→回执→复查几乎为零）；三端连通度为任务下行 ✅ / 任务上行 ❌ / 订货单只写不读 ❌；阻塞级缺陷 4 个，其中 3 个会在评委现场操作时立刻暴露；一句话诊断为「产品做得比文档更好，但闭环目前停在口号」 | 直接引用 |
| D7，§1.1 业代主线 | 逐项核对结果：今日巡店 / 拍照页三入口 / 分步加载动画 / 健康分与六维 / 标注图与拖拽对比 / 双向高亮 / 风险卡与推导依据 / 多轮追问 SSE / 行动方案与单据 / 补货算法推导折叠区 均为 ✅（多项标注「超出预期」）；**整改后回填照片与标记完成** ❌ 完全没有；**整改前后对比视图** ❌ 未实现（现有对比滑块是原图 vs 标注图，不是整改前 vs 整改后） | 数据提取 |
| D7，§1.2 缺口 A | 整改留证闭环是「假按钮」（最高优先级）：代码证据 `DiagnosisView.vue:238-240`，「标记已处理」只弹一个 Toast，不写库、不改状态、不生成回执、不关联照片；更深一层是 PRD 需求池 #8 的「48 → 80 (+32)」是 `stores.json` 的静态字段（prevScore 48 / lastScore 80），不是本次演示跑出来的 | 直接引用 |
| D7，§1.2 缺口 B | 任务闭环只有下行没有上行（第二高优先级）：`stores/tasks.ts:40` 定义了 `markDone(id)` → 调 `PATCH /api/v1/tasks/:id`，但全站 grep 显示 `markDone` 零调用点、`useTasksStore` 零使用；后端接口 #14/#16 已实现、前端已封装，但没有任何页面使用；同时 P5 看板没有「我派的任务」列表 | 直接引用 |
| D7，§1.2 缺口 C | 订货单数据流只写不读：P4 与 P6 的 `POST /api/v1/tickets` 均落库 + broadcast('ticket:new')；但前端订阅 `ticket:new` 为零（只有 TodayRouteView 订阅了 task:new）；`GET /api/v1/tickets` 后端根本没有；业代端「待接单」入口不存在；经理端「区域订货单/补货量汇总」不存在 | 直接引用 |
| D7，§1.2 缺口 D | 经理看板三处「看起来能点、其实没数据」：区域切换是假数据（changeRegion 后三个区域返回同一份）；点「查看详情」被守卫弹回（`DashboardView:150` 跳 `/rep/diagnosis/D_S3?readonly=1`，但该路由 `meta.roles:['rep']`，经理账号被 beforeEach 送回）；明细表只有 5 行（dashboard.json storeRows 实为 5 条，PRD #38 要求 8–12 行） | 直接引用 |
| D7，§1.2 缺口 E | 数字口径三处打架：PRD 6.1/6.4/6.5 与 chat-qa.json Q2 写 S3 补货「36 瓶 / ¥144」，diagnoses.json 实际渲染「27 瓶 / ¥108」；区域看板环比为 PRD 6.2 承诺 ↑3.8 / ↓2.6pt / ↑3.1pt，实际 fixture 为 ↑0.8 / ↓1.1pt / ↑1.9pt | 直接引用 |
| D7，§1.2 缺口 F | P2 概览平均分不随本次诊断变化：后端 `visits/today` 的 avgScore 取门店档案里的历史分，不是本次诊断得分，闭环在数据上不显形 | 直接引用 |
| D7，§1.3 B1 | 「切换角色」三处全部失效（最高优先级，0.5 人日）：`TodayRouteView:138` / `DashboardView:45` / `PhoneFrame:23` 都在调 `session.login('owner')` 或 `session.login('rep')` —— 只传 1 个参数，但签名是 `login(username, password)`；后果是 90 秒视频脚本里 1:20 切经理、1:32 切业代两处必卡 | 直接引用 |
| D7，§1.3 B2 | 经理点「查看详情」被路由守卫弹回（0.2 人日）：`DashboardView:150` vs `router/index.ts:42` | 直接引用 |
| D7，§1.3 B3 | 区域切换返回同一份数据（0.5 人日）：后端 `#17` 返回 `{...dashboard, regionId}` | 直接引用 |
| D7，§1.3 B4 | Leaflet 高德瓦片为外网请求，违反 PRD #45 零外网（0.5 人日）：`MapView.vue:53` 引用 `https://webrd0{s}.is.autonavi.com/...`，断网演示时地图变空白格 | 直接引用 |
| D7，§1.4 逐条对照 | #1 三角色切换已被改造取代（须回写 PRD）；#4 角色卡主次区分消失；#11 做成真 Leaflet 地图但引入外网瓦片（超额但违规）；#16/#24/#27/#30/#46/#47 全做；#38 只有 5 行；#41 未做；#45 零外网被 Leaflet 破坏；总评：PRD 承诺 17 接口 / mock 架构，实际是真后端 + 真 LLM + 真 CV + MCP + Redis + WebSocket + SSE + 21 个端点，PRD 需要重写 v2.0 | 数据提取 |
| D7，§② 新增功能 12 项 | 1 整改执行闭环（P0，2-3 人日）；2 订货单三端打通（P0，2 人日）；3 区域对比 + 门店排名（P1，1.5）；4 整改前后对比视图（P1，1）；5 AI 生成内容自动展开（P1，0.5）；6 P4 页面瘦身（P1，1）；7 经理端任务跟踪卡（P1，0.5）；8 进销存 MCP 事实可视化（P1，1，AI 深度最强差异化点但界面未露出）；9 门店维度对比（P2，1）；10 整改单/订货记录独立页（P2，0.5）；11 我的业绩看板（P2，2）；12 多店批量巡店（P2，2-3） | 数据提取 |
| D7，§明确表态 | 只做两件事时首选整改执行闭环（#1），次选订货单三端打通（#2）；#5 是送分题不是决胜题；#8 是锦上添花需先救命再添花；#4 是 #1 的展示层不要单独排期 | 直接引用 |
| D7，§建议放弃 | 明确不做 #12 / #11 / #9（合计 5-6 人日且全无法进 90 秒视频）；Leaflet 真地图不再投入（保留现状 + 无网自动隐藏兜底 0.2 人日）；P4 不再新增第 5 个 AI 卡片 | 直接引用 |
| D7，§附 一句话 | 已把「AI 能诊断」做得比预期好，但评委看的是闭环；剩下 12 天不要再加新能力，把「开方 → 执行 → 复查 → 数据回流」一条链走通 | 直接引用 |

### D8：`docs/class-diagram.mermaid`

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D8，§class User | 字段 id / name / role / avatarText / regionId | 数据提取 |
| D8，§class Store | 字段 id / name / type / address / ownerName / distanceKm / standard / photos / lastScore / prevScore | 数据提取 |
| D8，§class ShelfStandard | 字段 coldCols / ambientCols / stacks | 数据提取 |
| D8，§class Photo | 字段 id / type（ShootType）/ url / caption | 数据提取 |
| D8，§整体 | 类图覆盖 User、Store、ShelfStandard、Photo 等实体及关联，是 v1.0 架构稿的实体关系配套产物 | 综合归纳 |
| D8，§时效性判断 | 类图字段与当前 stores.json / users.json 的字段基本一致（stores.json 实际多了 regionId 与 lat/lng，类图中 Store 未列 lat/lng）；**推断**：类图已不完整覆盖当前 fixture，风险为下游若直接引用会漏掉经纬度与区域字段——建议以 D32 fixtures 实测字段为准 | 推断 |

### D9：`docs/sequence-diagram.mermaid`

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D9，§文件头 | 三条核心流程：拍照 → AI 诊断 → 结果渲染（含分步加载动画）、多轮追问、经理下派任务 → 业代端待办可见（跨角色闭环） | 直接引用 |
| D9，§流程一参与者 | 参与者为 业代李强 / CaptureView P3 / AiLoadingOverlay / api index.ts 契约层 / **mock handlers** / domain 计算模块 / router / DiagnosisView P4 | 数据提取 |
| D9，§流程一首步 | `POST /api/v1/diagnoses {storeId:S3, photoIds, shootTypes:[cold]}`，分发时注入 mock 延迟 2400ms × speed，随后查陈列标准与预置识别结果 | 数据提取 |
| D9，§时效性判断 | 参与者中的 `mock handlers` 与「注入 mock 延迟」在当前源码中已不存在（mock 层已移除，见 D30 与 D3），**此流程图的 mock 分支已过期**，但 api 契约层 → 领域计算 → 路由跳转的分层关系仍然有效 | 推断 |

### D10：`产品主线图.html`

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D10，§title | 标题为「聚焦后的产品主线图」；产物日期 2026-10-01 | 数据提取 |
| D10，§规模 | 4.7KB 单页 HTML，无外部依赖迹象；本阶段仅取标题与定位信息，未做视觉渲染与逐节点解析 | 综合归纳 |

### D11：`产品全景图.html`

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D11，§title | 标题为「产品全景架构图」；产物日期 2026-10-01 | 数据提取 |
| D11，§规模 | 5.2KB 单页 HTML；本阶段仅取标题与定位信息，未做视觉渲染与逐节点解析 | 综合归纳 |

### D12：`server/src/index.js`（1464 行 · 后端入口）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D12，§文件头注释 | 注释仍写「17 个接口契约与前端 src/api/index.ts 一一对应」，与文件实际路由数不符（已登记为冲突 X2） | 直接引用 |
| D12，§CORS A2 | CORS 白名单来源 `VITE_ORIGIN`（可逗号分隔），默认覆盖 5173（Vite dev）与 5180（vite preview，演示实际使用）；无 Origin 头放行；不在白名单不给 CORS 头；整改原因说明原 `cors()` 等于 `Access-Control-Allow-Origin: *`，任意第三方网页都能跨域读 `GET /api/v1/auth/demo-accounts`（返回三个演示账号明文密码）与 `GET /health` | 直接引用 |
| D12，§A3 输入长度 | 用户输入统一截断到 500 字（`MAX_USER_TEXT = 500`），避免超长文本拼进 prompt 导致 token 成本失控 | 数据提取 |
| D12，§B2 limit 守卫 | `normalizeLimit` 对非法 / 非正数 limit 回落到默认 20；原写 `Number(req.query.limit || 20)` 在 `limit=abc` 时得 NaN → `slice(0, NaN)` 返回空数组，排障时极具误导性 | 直接引用 |
| D12，§LLM 默认配置 | 文本 LLM 默认 `baseUrl = https://api.deepseek.com`、`model = deepseek-chat`；视觉 LLM 默认 `baseUrl = https://dashscope.aliyuncs.com/compatible-mode/v1`、`model = qwen-vl-ocr`，key 缺省复用文本 LLM 的 key | 数据提取 |
| D12，§常量 | `PORT` 默认 3000；`DEMO_WEEKDAY = '周五'`；`DEMO_WEATHER = '晴 22℃'`；成功信封 `{ code: 0, message: 'ok', data }`；失败信封 `{ code, message, data: null }` | 数据提取 |
| D12，§鉴权闸门 | 白名单 `AUTH_WHITELIST` = `POST /api/v1/auth/login`、`GET /api/v1/auth/demo-accounts`、`GET /api/v1/meta/roles`；`app.use('/api/v1', ...)` 挂在所有路由之前，用「默认拒绝」逐个放行，新增接口不会漏鉴权；`/health`、`/uploads`、`/ws` 不在 `/api/v1` 下，天然不受此闸门影响 | 直接引用 |
| D12，§端点实测清单 | 实测 29 个 `/api/v1` 路由：`meta/roles` GET、`auth/demo-accounts` GET、`auth/login` POST、`auth/me` GET、`stores` GET、`stores/:id` GET、`visits/today` GET、`visits` GET、`visits/:id` GET、`visits` POST、`diagnoses` POST、`diagnoses/:id` GET、`ai/chat` POST、`ai/chat/suggestions` GET、`ai/generate` POST、`ai/chat/stream` POST、`ai/generate/stream` POST、`tickets` POST、`tickets` GET、`tickets/:id` PATCH、`rectifications` POST、`rectifications` GET、`tasks` GET、`tasks` POST（requireRole manager）、`tasks/:id` PATCH（requireRole rep）、`dashboard/overview` GET、`demo/reset` POST（requireRole manager）、`uploads` POST、`forecast/:diagnosisId` GET；另加 `GET /health` 共 30 个 HTTP 端点，`/uploads` 为静态挂载，`/ws` 为 WebSocket | 数据提取 |
| D12，§visits/today | 按 `['S1','S2','S3','S4','S5']` 顺序装配 5 张卡；`status` 取 `store.alert ? 'alert' : done ? 'done' : 'pending'`；S2 标记 `isReview: true`；`avgScore = doneStores.map(r => r.store.lastScore)` 均值（取门店档案历史分，非本次诊断分）；`todoTasks = listTasks(repId).filter(status === 'open')`；`summary.avgDelta` 硬编码 2.4 | 数据提取 |
| D12，§broadcast 点 | `diagnosis:new`（诊断创建 3 处）、`ticket:new`（单据创建）、`ticket:status`（单据状态变更）、`rectification:new`（整改回执提交）、`task:new`（任务下派，带 `toRole: 'rep'` 定向投递） | 数据提取 |
| D12，§uploads | base64 图片落盘到 `server/data/uploads`，返回 photoId 与可访问 url；静态服务设 `X-Content-Type-Options: nosniff` 与 `Content-Disposition: inline`（纵深防御） | 直接引用 |
| D12，§health | 返回 `ok / service / db / llm / llmKeyPresent / mcp / cache / realtime`；`llm` 字段文案为 `dashscope(未验证连通性)` 或 `fallback(无 Key)`，注释说明不要只看 key 在不在（错 key 也报 dashscope，会误导现场判断） | 直接引用 |
| D12，§forecast 端点 | `GET /api/v1/forecast/:diagnosisId` 返回 `buildForecast` 结果（含 params / lines / compare / coverage / total / summary）；注释说明与 fixture 权威建议的差异来自陈列天数与整箱取整口径 | 直接引用 |
| D12，§启动统计 | 接口数由 `app._router.stack` 动态统计（原写死「17 个」，加接口后一直漂移），打印「N 个接口契约就绪，实时推送：/ws，健康检查：/health」；随后 `attachRealtime(server, '/ws')` | 直接引用 |

### D13：`server/src/auth.js`（264 行）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D13，§文件头设计要点 | ① 凭证只存在后端 `server/data/accounts.json`，前端拿不到密码 ② 账号决定身份，前端不允许自选角色 ③ token 必须防伪造（HMAC-SHA256 + 8 小时过期 + timingSafeEqual 防时序攻击），密钥来自 `AUTH_SECRET`，未配置时随机生成并打印警告 ④ 业务接口必须鉴权 | 直接引用 |
| D13，§env 自载说明 | ESM 的 import 先于模块体执行，若 .env 只在 index.js 加载，本模块顶层 `const SECRET = process.env.AUTH_SECRET || ...` 必然读到 undefined；因此凡模块顶层要读环境变量的模块都必须自己先 `loadEnv()`（`vision.js` 同样处理） | 直接引用 |
| D13，§SECRET | `AUTH_SECRET` 未配置时用 `randomBytes(32).toString('hex')` 进程级密钥 + 打印两行警告（重启后所有 token 失效，属安全兜底而非静默降级） | 直接引用 |
| D13，§DEFAULT_ACCOUNTS | 三个演示账号 `liqiang` / `wangmin` / `zhangdajie`，密码均为 `123456`，角色分别为 rep / manager / owner；首次启动落盘，之后以文件为准 | 数据提取 |
| D13，§ROLE_HOME | rep → `/rep/today`；manager → `/manager/dashboard`；owner → `/owner` | 数据提取 |
| D13，§ROLE_SCOPE | rep 可访问 今日巡店 / 拍照诊断 / AI 方案 / 整改留证；manager 可访问 区域看板 / 风险预警 / 下派任务；owner 可访问 自助诊断 / 一键补货 | 数据提取 |
| D13，§token 结构 | `username.ts.exp.hmac`：前三段明文载荷，第四段为前三段的 HMAC-SHA256 十六进制签名；旧格式 `demo-token-{username}-{ts}`（无签名即可冒充角色）**不再被接受** | 直接引用 |
| D13，§accountFromToken | 四段校验：① 验签（签名覆盖前三段）② 查过期 ③ 账号仍存在；任一不过返回 null | 直接引用 |
| D13，§readToken | 优先 `Authorization: Bearer`，兼容回退 `?token=` query（SSE 的 EventSource 与 img 标签无法自定义请求头，属浏览器限制而非鉴权绕过，token 本身仍需验签） | 直接引用 |
| D13，§requireAuth | 校验失败返回 401 信封 `{ code: 401, message: '登录已失效，请重新登录' }`，成功把账号挂到 `req.account` | 直接引用 |
| D13，§requireRole | `req.account.role` 不在白名单返回 403 `{ code: 403, message: '当前角色无权执行该操作' }`；必须挂在 requireAuth 之后 | 直接引用 |
| D13，§demoAccountList | 返回 username / password / role / person / roleLabel / scope / home；注释重申密码随清单下发仅限校园演示环境，真实系统绝不会回传密码 | 直接引用 |
| D13，§TOKEN_TTL_MS | 8 小时（够一天演示，过期须重新登录） | 数据提取 |

### D14：`server/src/db.js`（661 行）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D14，§文件头 | 静态数据（users/stores/skus/visits/diagnoses/dashboard/chatQa）来自前端 fixture JSON 只读；可写集合（tasks/tickets/新增 visits/诊断快照）落 SQLite，重启不丢，跨角色闭环成立 | 直接引用 |
| D14，§依赖 | 使用 Node 内置 `node:sqlite` 的 `DatabaseSync`；fixture 目录指向 `../../store-app/src/fixtures`（前端与后端共用同一份数据，保证口径一致） | 直接引用 |
| D14，§VISIT_ID_PREFIX | 现为 `V_T`（原为 `V_NEW`，与历史真实增量数据前缀相同，导致按前缀清理测试数据时误删真实记录）；依赖此前缀的判断点有两处：index.js 的「今日是否已巡店」与 `HistoryView.vue` 的增量记录识别 | 直接引用 |
| D14，§DEMO_TODAY | 本地硬编码 `'2026-10-02'`（不 import dashboard.js 的导出，避免循环依赖；两处取值必须一致） | 数据提取 |
| D14，§STORE_TO_RAW_KEY | S1–S5 各自映射到同名诊断 key；`VISIT_TO_RAW_KEY` 中 `V_S2_001 → S2_BEFORE`，其余 visit 映射到同名 key | 数据提取 |
| D14，§建表 | 5 张表：`tasks`（含 assignee/creator/task_type/due_at/note/status）、`tickets`（含 kind/items/placements/total_bottles/total_amount/note）、`visits`（含 visit_no/photo_ids/score/status，`UNIQUE(store_id, visit_no)`）、`diagnoses`（id/store_id/data）、`rectifications`（含 diagnosis_id/issue_id/before_score/after_score/photo_id/photo_url/derivation/status/operator） | 数据提取 |
| D14，§索引与迁移 | `idx_tasks_assignee`（assignee_id, status）；`ensureTicketsStatusColumn` 用 PRAGMA table_info 判断后 ALTER 补 status 列（默认 pending）；`ensureTasksDueAtLabelColumn` 补 due_at_label 并迁移老中文数据；`ensureVisitsUniqueVisitNo` 通过「建新表 → INSERT SELECT → DROP → RENAME」在事务中重建表加唯一约束（SQLite 不支持 ADD CONSTRAINT），理由是 POST /api/v1/visits 会先 await 视觉调用 2–4 秒，并发提交会读到同一个 MAX(visit_no) 插入重复单号 | 直接引用 |
| D14，§P0 建目录修复 | 模块顶层先确保 `server/data/` 与 `server/data/uploads` 存在再开库；`.gitignore` 忽略了 `server/data/`，新克隆仓库没有该目录，而 `new DatabaseSync()` 在父目录不存在时不会自动建目录会直接抛 ERR_SQLITE_ERROR，由于本行在模块顶层，抛错即整个 import 失败 → 后端起不来 → 演示白屏 | 直接引用 |
| D14，§roleOptions | 三条角色卡数据：业代李强（推荐）、区域经理王敏、店员店主张大姐，含 desc 与 sub 文案 | 数据提取 |

### D15：`server/src/domain.js`（329 行）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D15，§文件头 | 从前端 `src/domain/*.ts` 移植的纯函数；预置门店 → fixture 权威值，陌生照片 → 公式兜底（保证不白屏、不报错） | 直接引用 |
| D15，§DIMENSIONS | D1 排面达标 0.30 / D2 缺货控制 0.25 / D3 价签合规 0.15 / D4 竞争位势 0.15 / D5 陈列执行 0.10 / D6 期效新鲜 0.05 | 数据提取 |
| D15，§HEALTH_LEVELS | excellent 85–100 `#009639`；good 70–84 `#8BC34A`；warning 60–69 `#FF9800`；risk 0–59 `#E02020` | 数据提取 |
| D15，§RISK_DAYS | 周 7 天、月 4.3 周（与 PRD 7.3 一致） | 数据提取 |
| D15，§estimateAfterFix | `clamp(Math.round(score + (100 - score) * 0.6), 89, 96)` | 数据提取 |
| D15，§resolveHealth 双轨 | 视觉六维传入且长度为 6 时优先采用（source 标 vision，且不套用 scoreOverride）；否则用 fixture.dimensions（source 标 fixture）；两者都按 `Σ(维度分 × 权重)` 加权取整，保证 health.score === 六维加权和 | 直接引用 |
| D15，§兜底路径 | 无六维数据时给 72 分（良好下限），且六维全部同为该分数（权重和为 1，故加权结果恰好等于该分数，避免「总分 72 却六维全 80」的自曝矛盾），source 标 computed | 直接引用 |
| D15，§视觉投射规则 | 空位率 = emptyCount /（skuCount + emptyCount）→ ≤3% 记 0、≤8% 扣 6、>8% 扣 12 → D2；竞品占比 = competitorCount / max(1, skuCount) → ≤5% 记 0、≤15% 扣 8、>15% 扣 14 → D4；价签缺失率 = priceTagMissing / max(1, skuCount) → ≤3% 记 0、≤10% 扣 7、>10% 扣 12 → D3；命中维度从基线扣减（保底 0），未命中维度沿用基线；**权重表完全不动** | 数据提取 |

### D16：`server/src/forecast.js`（552 行）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D16，§文件头口径 | 补货量 = max(安全库存, 缺口列数 × 单列日均 × 铺货天数)，再按整箱规格向上取整；日均动销来自近 4 周动销（常数平滑；生产环境接 ERP 逐日序列走 Holt-Winters）；铺货天数按门店类型取值（A 类连锁 2 天 / C 类便利 3 天 / B 类大卖场与社区生鲜 3–4 天）；安全库存是下限约束 | 直接引用 |
| D16，§演示口径说明 | 演示数据只有「近 4 周日均动销」一个聚合值、没有逐日序列，预测环节退化为「常数平滑 + 变异系数估计」；生产环境应接入 ERP 逐日销量序列（模块已预留 `salesSeries` 入参） | 直接引用 |
| D16，§FORECAST_PARAMS | smoothAlpha 0.3；cvSigma 0.3；serviceZ 1.28（90% 服务水平）；leadTimeDays 2；coverDays 3（兜底，真实值优先取 plan.coverDays）；caseSize 1（演示数据未提供供应商装箱规格，按整瓶计，避免用多联装规格冒充装箱数放大 5 倍）；capacityFactor 1.2；stockAware true | 数据提取 |
| D16，§stockAware 口径 | true（当前默认）：覆盖需求 = 缺口列数 × 单列日均 ×（提前期 + 铺货天数），适用于货架已有货只是部分缺货（本项目五家店都是这种）；false：覆盖需求 = 全店日均 ×（提前期 + 铺货天数），适用于新品首次铺货或货架清空后重备。注释记录曾用全店日均口径导致 S3 算出 44 瓶（基线 27 的 1.6 倍），因为它假设货架是空的，对「4 列标准、2.5 列在卖」的场景系统性高估 | 直接引用 |
| D16，§singleColumnDaily | 单列日均 = 区间日均动销 / 标准陈列列数（列数下限 1） | 数据提取 |
| D16，§forecastDaily | 有 ≥2 个逐日序列时走 Holt 一阶（mode 标 holt）；仅有聚合值时按 α 做一次保守修正（低 10%）并标 mode conservative | 直接引用 |
| D16，§salesSigma | 有序列用样本标准差；缺失时用 `daily × cvSigma` 估计 | 数据提取 |
| D16，§dynamicSafetyStock | `z × σ × √(leadTimeDays)`，√L 来自随机需求下的经典结论：周期越长需求波动累积越大但增速放缓 | 直接引用 |

### D17：`server/src/cache.js`（188 行）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D17，§文件头 | 三级缓存：真 Redis → 内置 RESP 兼容服务（redis-lite）→ 内存 LRU；上 Redis 的原因是 AI 生成每次调千问单次 2-5 秒且有 token 成本，同一门店同一诊断文本高度稳定，缓存后二次打开秒回；redis-lite 的原因是演示机器装不了 Redis 服务端，但必须真实跑通 Redis 语义（用真正的 ioredis 客户端连内置 RESP 服务，SET/GET/EX/TTL/过期全部是真实 Redis 行为） | 直接引用 |
| D17，§配置 | `REDIS_URL` 存在则连真 Redis；`DEFAULT_TTL_SEC` = 3600（1 小时）；内存兜底为 Map + 过期时间 + 容量上限 500（LRU 近似：超限删最早） | 数据提取 |
| D17，§降级链 | ① 配置 REDIS_URL → 连真 Redis（backend = redis）② 起内置 RESP 服务并用 ioredis 连（backend = redis-lite）③ 兜底纯内存（backend = memory）；连接参数 lazyConnect、maxRetriesPerRequest 1、connectTimeout 1500、retryStrategy 返回 null | 综合归纳 |

### D18：`server/src/realtime.js`（183 行）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D18，§文件头 | 把 WebSocketServer 挂在已有 HTTP server 的 `/ws` 路径，让「经理下派任务 → 业代待办」从 fixture 模拟刷新变成真正的秒级推送；优雅降级（任何客户端异常/断开都不影响 HTTP 主流程，broadcast 永不抛错）；心跳 30s 一次 ping，pong 超时则 terminate 避免僵尸连接；定向投递（payload.toRole 指定时只发给该角色连接，缺省广播全部） | 直接引用 |
| D18，§A1 握手鉴权 | 原实现直接读 query 里自报的 `role`/`name`，任何人 `new WebSocket('ws://host/ws?role=manager')` 就能连上并收全部 `task:new` / `diagnosis:new` / `ticket:new` / `rectification:new` 广播；现改为身份一律来自 token（复用 `accountFromToken` 做 HMAC 验签 + 过期校验），query 里的 role/name 完全忽略；浏览器 WebSocket API 不能自定义请求头，故 token 只能走 query，这与 SSE / img 标签是同一套浏览器限制，不是鉴权绕过 | 直接引用 |
| D18，§parseMeta | 未通过验签时返回 `{ role: 'guest', name: '', authorized: false }`，调用方据此直接关闭连接（1008 未授权） | 数据提取 |
| D18，§HEARTBEAT_MS | 30000 | 数据提取 |
| D18，§broadcast | 导出 `broadcast(event, payload)`，供 index.js 在诊断创建 / 单据创建 / 单据状态变更 / 整改回执 / 任务下派五处调用 | 数据提取 |

### D19：`server/src/mcpClient.js`（168 行）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D19，§文件头 | 把蒙牛进销存 MCP Server 当子进程拉起，走 stdio JSON-RPC 调用工具；① 懒启动 + 单例复用（避免每次请求都 spawn）② 调用结果带 TTL 缓存（批次/价格变化慢）③ 任何异常（server 起不来 / 超时 / 协议错）都返回 null，调用方降级到 fixture，绝不因 MCP 拖垮 AI 主流程 | 直接引用 |
| D19，§常量 | `SERVER_PATH` 指向 `../mcp/inventory-server.mjs`；`CALL_TIMEOUT_MS` = 4000；`CACHE_TTL_MS` = 5 分钟 | 数据提取 |
| D19，§spawn 参数 | `stdio: ['pipe','pipe','ignore']`，env 注入 `NO_PROXY=*` 与 `no_proxy=*`（避免代理干扰本地 stdio 通信） | 数据提取 |
| D19，§按行解包 | stdout 按 `\n` 切行，逐行 JSON.parse 后按 id 匹配 pending 中的 waiter，`msg.error` 则 reject | 综合归纳 |
| D19，§退出处理 | 子进程 exit 时置 `child = null`、`initialized = false`，并 reject 所有 pending（避免悬挂 Promise） | 综合归纳 |

### D20：`server/src/vision.js`（254 行）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D20，§文件头 | 方案 B：主线 S1–S5 也走视觉模型生成标注框；安全网规则为**按层判定**——视觉给出的框与该层 fixture 参照数量偏差 ≤ 阈值就采纳，偏差过大就回退该层 fixture 坐标并在 sourceText 说明该层由陈列标准库定位（诚实且现场不会翻车） | 直接引用 |
| D20，§IMAGE_DIRS | 按序查找三个目录：`server/data/uploads`（本次上传）、`store-app/public`、`store-app/public/stores`；注释说明只读 uploads 会导致主线 fixture 图读不到、视觉直接返回 null（实测踩过） | 直接引用 |
| D20，§VL 配置 | `LLM_VL_API_KEY || VL_KEY || LLM_API_KEY` 三级回退；model 默认 `qwen-vl-ocr`；baseUrl 默认 `https://dashscope.aliyuncs.com/compatible-mode/v1`；注释记录此前误读 `VL_KEY` 导致视觉永远取不到 key、静默返回 null（耗时 0.2s 就是没调） | 直接引用 |
| D20，§TOLERANCE | 各层允许的最大相对偏差（超过则回退 fixture 坐标）：mengniu 0.35 / empty 0.7 / oos 0.7 / competitor 0.7 / pricetag 0.7；注释说明阶段 B4 整体下调一档（原 0.5 / 1.0），让视觉框更高概率被采信，安全网保留不删 | 数据提取 |
| D20，§识别缓存 | `CACHE_TTL` = 5 分钟，key 为「图片名 + 门店名」；视觉调用 2-9 秒，演示时反复进同一页会卡；换图/换店会自然失效，改了 fixture 图请重启后端清缓存 | 直接引用 |
| D20，§analyzeShelfWithBoxes | 无 VL key 时直接返回 null；返回 `{ skuCount, emptyCount, competitorCount, priceTagMissing, boxes }`，失败返回 null | 数据提取 |

### D21：`server/src/dashboard.js`（185 行）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D21，§文件头目标 | 让「切换区域」真的切换数字：按 regionId 过滤门店明细，并用该区域自己的门店重算所有 KPI，保证不同区域看到不同数字，且同一区域内口径自洽（distribution 各档 count 之和 === 该区域门店总数，且 KPI「红灯门店」=== distribution 里 risk 档的 count，不出现第二个口径矛盾） | 直接引用 |
| D21，§DEMO_TODAY | `2026-10-02`，`DEMO_NOW = '2026-10-02 23:59'`；注释说明逾期判定必须用演示基准日而不是真实当天，否则「本周五前完成」的任务会随日历漂移导致演示现场「全部逾期」 | 直接引用 |
| D21，§REGION_STORE_IDS | 由 `stores.json` 的 `regionId` 聚合（缺省归 `R_EAST`）；区域中文名来自 `dashboard.json` 的 `regionIds` | 数据提取 |
| D21，§buildDistribution | 按该区域 rows 重算各档 count 与 ratio（ratio 保留 3 位小数）；区域无门店时各档置 0 | 数据提取 |
| D21，§buildDashboardOverview | 输出 `regionId / regionIds / kpis / distribution / trend / riskTop5 / storeRows`，并额外输出 `rectification / orderSummary / taskSummary`；storeRows 按 score 升序（分数低的排前面，与「风险优先」一致） | 数据提取 |

### D22：`server/src/env.js`（61 行）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D22，§文件头 | 后端有三个模块在模块顶层就要读环境变量（auth.js 读 AUTH_SECRET、vision.js 读 LLM_VL_*、index.js 读 LLM_* 与 VITE_ORIGIN）；ESM 的 import 先于模块体执行，所以「在 index.js 里加载 .env」救不了前两者；因此凡需要环境变量的模块都必须自己在 import 之后立刻调用 `loadEnv()` | 直接引用 |
| D22，§解析规则 | 只识别 `KEY=VALUE`（KEY 为大写字母/下划线）；忽略 `#` 注释行与空行；去掉值两端成对引号；**不覆盖已存在的环境变量**（`process.env[k] === undefined` 才写），使 `PORT=3100 node src/index.js` 这类命令行传参生效 | 直接引用 |
| D22，§不使用 dotenv | 演示项目不引新依赖（硬约束：不引入新 UI 库/新包）；换机克隆时少一个「装了没装」的失败点 | 直接引用 |
| D22，§ENV_PATH | `server/.env`；幂等可重复调用，文件不存在静默跳过 | 数据提取 |

### D23：`server/src/redisLite.js`（200 行 · 部分解析）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D23，§定位 | 内置 speaking-RESP 的 TCP 服务，供 cache.js 在没有真 Redis 服务端时用真正的 ioredis 客户端连接，从而跑通真实 Redis 协议路径 | 综合归纳 |
| D23，§导出 | 导出 `startRedisLite(port)` 与 `redisLiteStats`，cache.js 以 `startRedisLite(0)` 启动（端口 0 表示由系统分配） | 数据提取 |
| D23，§未精读声明 | RESP 命令解析与过期实现的字节级细节本轮未逐行精读；**推断**：对下游五份文档（架构/系统/部署/安全/UserStory）的产出不构成本质影响，风险等级为低。若 platform-architect 需要精确描述内置 RESP 服务行为，需回补精读 | 推断 |

### D24：`server/mcp/inventory-server.mjs`（199 行）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D24，§文件头 | 零依赖手写实现（只实现 `tools/list`、`tools/call`、`initialize` 三个方法）；serverInfo 为 `{ name: 'mengniu-inventory-mcp', version: '1.0.0' }`，capabilities 为 `{ tools: {} }` | 数据提取 |
| D24，§TOOLS 1 | `get_batch_expiry`（参数 skuId）：批次效期，用于期效新鲜维度与临期判断 | 数据提取 |
| D24，§TOOLS 2 | `get_price_book`（参数 skuId）：价格库，含 `guidePrice` 与 `execPrice`（当前样本中两者取值相同），用于价签核对 | 数据提取 |
| D24，§TOOLS 3 | `get_store_inventory`（参数 storeId / skuId）：门店在库量 | 数据提取 |
| D24，§数据 | SKU 主数据来自 skus.json，构造 `skuId → { name, guidePrice, execPrice }` 映射 | 数据提取 |
| D24，§定位 | 效期与价签数据来自进销存，不靠看图猜（与 D1 §9.1、D3 §技术栈表述一致） | 综合归纳 |

### D25：`server/package.json`

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D25，§元信息 | name `store-app-server`，version 1.0.0，type module；scripts 为 `start`（node src/index.js）与 `seed`（node src/db.js --seed-only） | 数据提取 |
| D25，§description | 仍写「17 个接口契约与前端 src/api/index.ts 一一对应，Phase 1 的 mock 层无缝替换为真后端」——与实测 30 个端点不符（已登记为冲突 X2） | 直接引用 |
| D25，§dependencies | cors ^2.8.5、express ^4.19.2、ioredis ^6.0.0、redis-memory-server ^0.17.1、ws ^8.22.0（共 5 个） | 数据提取 |

### D26：`server/.env.example` 与 `server/.env`

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D26，§模板变量 | `AUTH_SECRET`（HMAC 签发会话 token）、`LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`、`LLM_VL_API_KEY`、`LLM_VL_BASE_URL`、`LLM_VL_MODEL` | 数据提取 |
| D26，§模板推荐值 | 主推方案为全部用通义千问：`LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`、`LLM_MODEL=qwen-plus`、`LLM_VL_MODEL=qwen-vl-plus`；备选为文本用 DeepSeek（`https://api.deepseek.com` + `deepseek-chat`）+ 视觉仍用千问；其他备选视觉模型为智谱 GLM-4V、腾讯混元 vision | 数据提取 |
| D26，§实际配置 | 本机 `server/.env` 实际为：`LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`、`LLM_MODEL=qwen-plus`、`LLM_VL_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`、`LLM_VL_MODEL=qwen-vl-ocr`、`AUTH_SECRET` 已配置（值已脱敏）、两个 API KEY 已配置（值已脱敏） | 数据提取 |
| D26，§偏差提示 | 实际视觉型号为 `qwen-vl-ocr`，与模板推荐值 `qwen-vl-plus` 及 PRD/README 的表述不一致（已登记为冲突 X10） | 综合归纳 |

### D27：`server/README.md`（76 行）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D27，§定位 | 真实后端为 Express + SQLite（Node 内置 `node:sqlite`，零数据库依赖）；目录结构只列了 index.js / db.js / domain.js 三个文件 | 直接引用 |
| D27，§接口表 | 自述「17 个接口契约」并列出 ①–⑰ 表，其中登录路径写的是 `POST /api/v1/session/login`（与当前源码的 `/api/v1/auth/login` 不同） | 直接引用 |
| D27，§降级表述 | 「后端不可用时自动降级回本地 mock（保证演示不中断）」——与当前源码（无 mock 层、如实报错）直接冲突（已登记为冲突 X15） | 直接引用 |
| D27，§验证示例 | 给出 curl 参考命令：登录（roleId 传 manager）、下派任务、业代待办查询；路径与参数沿用旧的 session/login 形态 | 数据提取 |
| D27，§数据设计 | 静态数据复用前端 fixture 保证口径一致；可写集合落 SQLite 重启不丢，跨角色闭环成立 | 直接引用 |

### D28：`server/deploy.md`（128 行）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D28，§一 本机演示 | 双击 `03_产品Demo/start-all.bat` 会开两个命令行窗口（后端 3000 / 前端 5180）并自动打开浏览器；后端接口自检访问 `http://127.0.0.1:3000/health`；灾备为 `npm run build:single` 产出内联单文件 `dist/index.html`（约 276KB），U 盘拷走双击即开 | 直接引用 |
| D28，§一 环境变量表述 | 文中写「前端 `.env` 保持 `VITE_API_MODE=mock` 可走纯离线；改 `http` 则走真后端」——mock 模式已移除（已登记为冲突 X15） | 直接引用 |
| D28，§二 服务器部署 | Ubuntu 22.04 环境：apt 安装 nodejs / npm / nginx；确认 Node ≥ 22（`node:sqlite` 需要内置 SQLite）；上传整个 `03_产品Demo/` 到 `/opt/store-app/`；前后端分别 `npm install` 与 `npm run build` | 数据提取 |
| D28，§二 PM2 | `pm2 start src/index.js --name store-api`（PORT=3000），`pm2 save && pm2 startup` 开机自启 | 数据提取 |
| D28，§二 Nginx | 监听 80；root 指向 `store-app/dist`，`location /` 用 `try_files $uri $uri/ /index.html`；`location /api/` 反代到 `http://127.0.0.1:3000`；`location /uploads/` 同样反代 | 数据提取 |
| D28，§三 环境变量 | 后端变量表：`LLM_API_KEY`（不配降级为关键词匹配）、`LLM_BASE_URL`（默认 `https://api.deepseek.com`）、`LLM_MODEL`（默认 `deepseek-chat`）、`LLM_VL_MODEL`（不配降级为 mock 识别）、`PORT`（默认 3000）；前端变量表：`VITE_API_MODE`（mock 默认全离线 / http 走真后端）、`VITE_API_BASE`、`VITE_DEMO_SPEED` | 数据提取 |
| D28，§三 降级保证 | 「任何 LLM 缺 key / 超时 / 报错，都静默降级到关键词匹配 + mock 识别，演示永不中断」——与前端 client.ts 的「如实报错不降级」冲突（见 X15） | 直接引用 |
| D28，§四 常见问题 | Node 版本低于 22 报 `node:sqlite` 错误需升级；前端改 `.env` 必须重启 dev server 或重新 build；经理下派任务业代看不到需确认前后端连同一后端；数据库清空可用 `POST /api/v1/demo/reset` 或直接删 `server/data/store.db` | 数据提取 |

### D29：`server/data/accounts.json`

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D29，§内容 | 三个账号：liqiang / rep、wangmin / manager、zhangdajie / owner，密码均为 `123456`；与 D13 的 DEFAULT_ACCOUNTS 完全一致 | 数据提取 |
| D29，§生成方式 | 由 `auth.js` 的 `loadAccounts()` 首次启动时落盘，之后以文件为准；位于 `.gitignore` 覆盖的 `server/data/` 下，不进仓库 | 综合归纳 |

### D30：`store-app/src/api/`（契约层 4 文件）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D30，§index.ts 文件头 | 页面/组件的唯一数据入口（ARCHITECTURE 铁律 1）；页面严禁 import `@/fixtures`（分层验收硬性条款） | 直接引用 |
| D30，§client.ts 职责 | 统一响应信封 `{ code, message, data }`；`code !== 0` 抛统一业务错误（由 useApi 吞掉并 Toast 友好文案，绝不原生报错）；**唯一数据通路 = 真实后端，2026-10-09 起移除 mock 与离线兜底** | 直接引用 |
| D30，§client.ts token | `authToken()` 直接读 localStorage 键 `store-app:session` 而不 import session store（避免循环依赖）；`authHeaders()` 在有 token 时加 `Authorization: Bearer` | 直接引用 |
| D30，§client.ts 错误处理 | fetch 失败时 console.error + `window.dispatchEvent(new CustomEvent('api:offline'))` + 抛 `ApiError(-1, '后端未连接，请确认服务已启动（npm start）')`；后端可达时广播 `api:online` | 直接引用 |
| D30，§endpoints.ts | 端点常量表含 ROLES / LOGIN（`${API_PREFIX}/session/login`）/ STORES / STORE_DETAIL / VISITS_TODAY / VISITS / VISIT_DETAIL / DIAGNOSES / DIAGNOSIS_DETAIL / AI_CHAT / AI_CHAT_SUGGESTIONS / TICKETS / TASKS / TASK_DETAIL / DASHBOARD_OVERVIEW；另有 PHASE2_TABLE_MAP 表映射备注 | 数据提取 |
| D30，§endpoints 偏差 | 常量表里的 LOGIN 仍为 `/api/v1/session/login`，但 `api/index.ts` 实际调用写的是 `/api/v1/auth/login`；常量表未覆盖 auth/demo-accounts、auth/me、uploads、rectifications、forecast、ai/generate、demo/reset 等新增端点（已登记为冲突 X17 的伴生现象） | 数据提取 |
| D30，§index.ts 鉴权组 | `getRoles`、`fetchDemoAccounts`、`loginWithAccount`（POST /api/v1/auth/login）、`authMe`（GET /api/v1/auth/me，token 走 query） | 数据提取 |
| D30，§index.ts 资源组 | `getStores`、`getStore`、`getTodayRoute`、`getVisits`、`getVisit`、`createVisit`、`uploadPhoto`（POST /api/v1/uploads，base64）、`createDiagnosis`、`getDiagnosis` | 数据提取 |
| D30，§index.ts AI 组 | `postChat`（非流式）、`getChatSuggestions`、`generateAi`（type 取值 summary / order / owner / pitch）、`fetchForecast` | 数据提取 |
| D30，§index.ts 单据组 | `createTicket`、`getTickets`（支持 storeId / kind / status / limit 过滤）、`updateTicketStatus`（PATCH，状态仅 pending 或 accepted，成功后后端广播 `ticket:status`） | 数据提取 |
| D30，§index.ts 整改组 | `createRectification`（整改后健康分由**后端**按可解释规则计算并返回含 derivation 说明，前端只展示不自行计算）、`getRectifications` | 直接引用 |
| D30，§index.ts 任务组 | `getTasks`、`createTask`、`updateTaskStatus` | 数据提取 |
| D30，§index.ts 看板组 | `getDashboardOverview`（默认 regionId = R_EAST） | 数据提取 |
| D30，§index.ts SSE | `streamSse` 手动解析 ReadableStream 的 `text/event-stream`，帧格式 `data: {json}\n\n`，结束帧带 `done`；`SseResult` 含 `ok`（是否收到增量）与 `source`（llm / fallback / null）；注释说明降级路径也会发 delta 帧，只看「有没有收到增量」就标「AI 生成」会在答辩时被戳穿 | 直接引用 |
| D30，§index.ts SSE 端点 | `streamChat` → `/api/v1/ai/chat/stream`；`streamGenerate` → `/api/v1/ai/generate/stream`；两者均带 `authHeaders()` 与 AbortSignal | 数据提取 |

### D31：`store-app/src/domain/constants.ts`

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D31，§文件头 | 纯常量模块，不依赖 Vue、不依赖 api/fixtures；任何页面不得硬编码色值或分档区间，必须从这里取 | 直接引用 |
| D31，§HEALTH_LEVELS | 四档含 key / min / max / label / color / icon / advice；advice 文案为「保持当前陈列水平」「有小问题，本周内处理」「需立即处理，否则影响销量」「红色告警，24 小时内整改」 | 数据提取 |
| D31，§DIMENSIONS | D1 排面达标 0.30 / D2 缺货控制 0.25 / D3 价签合规 0.15 / D4 竞争位势 0.15 / D5 陈列执行 0.10 / D6 期效新鲜 0.05（与 D15、D1 §7.1 三方一致） | 数据提取 |
| D31，§RISK | `SEVERITY_LOW` 0.7（缺口 ≤20%）、`SEVERITY_MID` 0.95（20%–50%）、`SEVERITY_HIGH` 1.4（>50%）、`GAP_FACTOR` 1.0、`WEEK_DAYS` 7、`MONTH_WEEKS` 4.3；**常量表中不存在 ELASTICITY**（与 PRD 7.3 的 0.35 弹性系数不同，已登记为冲突 X3） | 数据提取 |
| D31，§severityOf | 按 gapRatio 取 0.7 / 0.95 / 1.4 三档 | 数据提取 |
| D31，§AI_SOURCE_BADGE | llm → 「AI 生成」（tone ai）；fallback → 「基于陈列标准库生成」（tone standard）；unknown → 「内容生成未完成」（tone muted，不宣称 AI）；设计理由是降级路径同样会吐文案，若一律标「AI 生成」等于误导 | 直接引用 |
| D31，§ANNOTATION_STYLES | mengniu 绿 `#009639` 实线；oos 橙 `#FF9800` 实线；empty 红 `#E02020` 虚线；competitor 蓝 `#3B82F6` 虚线；pricetag 橙实线 + badge；stack 橙虚线 | 数据提取 |
| D31，§LAYER_FILTERS | 全部 / 缺货 / 价签 / 竞品 四个 chips | 数据提取 |
| D31，§SEVERITY_META | severe 严重 红 `#E02020` 权重 3；medium 中度 橙 `#FF9800` 权重 2；low 轻度 灰 `#9CA3AF` 权重 1 | 数据提取 |
| D31，§SHOOT_TYPES | cold 冷藏柜 / ambient 常温架 / stack 堆头端架 | 数据提取 |
| D31，§TASK_TYPES | OOS 缺货补货 / FACING 排面调整 / PRICETAG 价签整改 / STACK 堆头执行 | 数据提取 |
| D31，§TREND_NAMES | score 平均健康分 / oosRate 缺货率 / coverage 铺货率 | 数据提取 |
| D31，§IMAGE_BOTTOM_CROP | 0.95（AI 生成图右下角有水印，y > 96%，统一裁掉底部 5%） | 数据提取 |
| D31，§FRIENDLY_ERROR | 「网络或服务异常，已为你加载本地演示数据」（集中定义，页面不得自造报错文案；**注意此文案仍带有已移除的本地兜底语义，与 client.ts 的如实报错策略存在措辞冲突**） | 直接引用 |
| D31，§DEMO_TODAY | `2026-10-02` / 周五 / 晴 22℃ | 数据提取 |

### D32：`store-app/src/fixtures/`（演示数据权威值）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D32，§stores.json 规模 | 共 128 家门店；区域分布 R_EAST 44 / R_SOUTH 42 / R_NORTH 42；S1–S5 为重点店，S101 起为区域样本（命名形如「城东片区-01」「城南片区-01」「城北片区-01」） | 数据提取 |
| D32，§stores.json S1 | 家家悦·学府路店，R_NORTH，A 类连锁超市，标准 6/12/1，lastScore 91，prevScore 87，alert false，含经纬度 | 数据提取 |
| D32，§stores.json S2 | 好邻居·地铁口店，R_EAST，C 类便利店，标准 3/5/0，lastScore 80，**prevScore 48**，alert false；照片含 cold.jpg（整改后）与 cold_before.jpg（整改前） | 数据提取 |
| D32，§stores.json S3 | 美宜佳·城建学院店，R_EAST，C 类便利店，标准 4/5/0，lastScore 72，prevScore 72，alert false；照片含 cold / ambient / stack 三张 | 数据提取 |
| D32，§stores.json S4 | 华联超市·万达店，R_SOUTH，B 类大卖场，标准 4/8/1，lastScore 64，prevScore 62，alert false | 数据提取 |
| D32，§stores.json S5 | 永辉生活·中央公园店，R_NORTH，B 类社区生鲜，标准 4/8/1，lastScore 43，prevScore 46，**alert true** | 数据提取 |
| D32，§diagnoses.json S3 | 六维 76/68/70/62/82/85，expectedScore 89，prevScore 72，scoreOverride null；风险 weeklyBottles 27 / weeklyAmount 108 / **monthlyBottles 116 / monthlyAmount 464**；风险项 elasticity **0.95**、dailyLossBottles 3.9、gapRatio 0.375、unitPrice 4、dailyAvgSales 11、stdFacings 4、actualFacings 2.5；derivation 为多步算式文本（直接缺口损失 → 缺货严重度调整 → …）；方案 restock 优益C100ml×12(¥48) / 优益C450g×9(¥36) / 真果粒250ml×6(¥24)，totalBottles 27、totalAmount 108、coverDays 3；annotations 14 条、issues 4 条 | 数据提取 |
| D32，§diagnoses.json S1 | 六维 92/95/85/88/90/90，expectedScore 96，prevScore 87；风险 6 瓶 / ¥30 / 26 瓶 / ¥130，elasticity 0.7；方案 特仑苏 6 瓶 ¥30，coverDays 2；annotations 3、issues 1 | 数据提取 |
| D32，§diagnoses.json S2 整改后 | 六维 82/80/78/72/85/90，expectedScore 88，prevScore 48；风险 8 瓶 / ¥32 / 34 瓶 / ¥136，elasticity 0.7；方案 优益C 6 瓶 ¥24，coverDays 2；annotations 4、issues 1 | 数据提取 |
| D32，§diagnoses.json S2_BEFORE | 六维 50/30/60/45/40/65，**scoreOverride 48**，expectedScore 80，**prevScore 44**；风险 59 瓶 / ¥236 / 254 瓶 / ¥1016，elasticity 1.4；方案 39 瓶 ¥156，coverDays 3；annotations 6、issues 4 | 数据提取 |
| D32，§diagnoses.json S4 | 六维 68/52/75/70/45/80，expectedScore 82，prevScore 62；风险 41 瓶 / ¥185 / 176 瓶 / ¥792，elasticity 0.95；方案 30 瓶 ¥143，coverDays 3；annotations 5、issues 3 | 数据提取 |
| D32，§diagnoses.json S5 | 六维 48/30/55/38/40/60，expectedScore 72，prevScore 46；风险 78 瓶 / ¥312 / 335 瓶 / ¥1340，elasticity 1.4；方案 48 瓶 ¥210，coverDays 4；annotations 6、issues 5 | 数据提取 |
| D32，§加权回算校验 | 按 D31 权重回算：S1 = 90.80、S2 后 = 80.10、S2 前 = 45.50、S3 = 72.05、S4 = 63.65、S5 = 42.85；与 D2 §5.4 校验表逐项一致；与 fixture 展示值 91/80/48/72/64/43 的偏差分别为 −0.20 / +0.10 / **−2.50** / +0.05 / −0.35 / −0.15 | 数据提取 |
| D32，§dashboard.json KPI | 区域平均健康分 **74.3**（↑0.8，目标 80）；红灯门店 **12**（↓5）；本周缺货率 **7.2%**（↓1.1pt）；蒙牛铺货率 **86.4%**（↑1.9pt） | 数据提取 |
| D32，§dashboard.json 分布 | 优秀 42（0.328）/ 良好 53（0.414）/ 预警 21（0.164）/ 风险 12（0.094），合计 128 | 数据提取 |
| D32，§dashboard.json 趋势 | 近 8 周 W1→W8：平均健康分 62.1→74.3；缺货率 18.4→7.2；铺货率 71.2→86.4 | 数据提取 |
| D32，§dashboard.json 区域 | regionIds 为 R_EAST 城东片区 / R_SOUTH 城南片区 / R_NORTH 城北片区 | 数据提取 |
| D32，§dashboard.json riskTop5 | S5 永辉 43 risk「连续 3 周下滑 · 缺货 5 项」；S4 华联 64 warning「排面被挤压 · 堆头物料缺失 3 项」；S3 美宜佳 72 good「黄金列位被竞品占用 · 缺货 1 列」；S2 好邻居 80 good「价签缺失 1 处 · 已完成整改闭环」；S1 家家悦 91 excellent「仅 1 处价签轻度缺失 · 区域标杆店」 | 数据提取 |
| D32，§dashboard.json storeRows | **128 行**（含 S1–S5 与 S101–S228 区域样本），按 score 升序；首行示例 S101 城东片区-01 score 96 level excellent weekDelta 4 | 数据提取 |
| D32，§users.json | U_REP 李强 rep（辖区 128 家 · 今日待巡 5 家，R_EAST）；U_MGR 王敏 manager（城东片区 · 128 家门店，R_EAST）；U_OWNER 张大姐 owner（好邻居 · 地铁口店店主，R_EAST） | 数据提取 |
| D32，§visits.json | 6 条：V_S1_001（2026-10-02 09:12，score 91，done）、V_S2_002（2026-10-02 10:05，score 80，done）、V_S2_001（2026-09-25 15:40，score 48，done，photo 为整改前）、V_S3_001（2026-09-25 11:20，score 72，done）、V_S4_001（2026-09-25 14:05，score 64，done）、V_S5_001（2026-09-25 16:30，score 43，status alert） | 数据提取 |
| D32，§skus.json | 10 个蒙牛 SKU（SKU_001 优益C 100ml 指导价 4；SKU_002 优益C 原味 450g 价 4；SKU_003 冠益乳 250g 价 5.5；SKU_004 冠益乳杯装 100g 价 3.5；SKU_005 纯甄常温酸奶 价 4.5；SKU_006 真果粒 250ml 价 4；SKU_007 优益C 原味；SKU_008 优益C 芦荟味 价 4；SKU_009 特仑苏 250ml 价 5）+ 竞品 SKU（SKU_101 味全 332ml 价 3.5、SKU_102 养乐多 100ml 等） | 数据提取 |
| D32，§chat-qa.json | 6 条快捷问题 + 2 条兜底；Q2 答复明确「合计 27 瓶 / ¥108」，Q6 同样为 27 瓶 ¥108；Q1 给黄金层单列日均 11 瓶 vs 底层 5.2 瓶；Q4 给味全毛利 0.8 vs 优益C 1.2 | 数据提取 |
| D32，§schema.ts | SCHEMA_VERSION 常量与 FixtureRoot 类型 + 版本校验（结构性读取） | 综合归纳 |

### D33：`store-app/src/router/index.ts`

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D33，§文件头 | 使用 hash 模式配合 `base:'./'` 保证任意目录双击 index.html 即开；每个业务路由用 `meta.roles` 声明允许访问的角色，beforeEach 统一拦截 | 直接引用 |
| D33，§路由表 | `/` 重定向到 `/login`；`/login`（RoleSelectView）；`/role` 旧入口重定向到 `/login`；`/rep/today`（roles rep）；`/rep/capture/:storeId?`（roles rep）；`/rep/diagnosis/:id`（**roles rep + manager**）；`/rep/history`（roles rep）；`/rep/me`（roles rep，PlaceholderView）；`/manager/dashboard`（roles manager）；`/owner`（roles owner + rep）；兜底 404（PlaceholderView） | 数据提取 |
| D33，§守卫 ① | 未登录判断：只有**本地根本没有 token** 才送去登录页；断网时 restore 无法验证 token 但不会清除它，若无条件弹登录页会导致现场断网即被踢出工作台 | 直接引用 |
| D33，§守卫 ② | 已登录访问 `/login` 直接回工作台（断网时 session.home 可能为空，退回角色默认落地页） | 直接引用 |
| D33，§守卫 ③ | 角色权限隔离：`session.logged && allow.length && !allow.includes(session.role)` 时送回 `session.home`；断网时 role 为默认 rep，故有 token 但未恢复身份时跳过校验放行 | 直接引用 |
| D33，§ROLE_HOME | rep `/rep/today`、manager `/manager/dashboard`、owner `/owner`（与 D13 服务端 ROLE_HOME 一致） | 数据提取 |
| D33，§标题 | afterEach 设 `document.title` 为「页面标题 · 店小C」，无标题时为「店小C · 蒙牛 AI 巡店助手」 | 数据提取 |

### D34：`store-app/src/realtime/client.ts`

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D34，§文件头 | 优雅降级铁律：连不上就静默退避重试，绝不抛错、绝不白屏；重连期间只是暂时收不到推送 | 直接引用 |
| D34，§事件名 | `hello` / `ack` / `task:new` / `diagnosis:new` / `ticket:new` / `chat:reply`；**未声明后端实际广播的 `ticket:status` 与 `rectification:new`**（前端仍在用字符串订阅，见 D36 TodayRouteView） | 数据提取 |
| D34，§resolveWsUrl | 优先 `VITE_WS_BASE`，否则把 `VITE_API_BASE` 的 http(s) 换成 ws(s)，缺省 `ws://127.0.0.1:3000`；**必须附带 `?token=`**，否则后端以 1008 未授权关闭连接；浏览器 WebSocket API 不能自定义请求头只能走 query，token 本身仍需 HMAC 验签 | 直接引用 |
| D34，§退避 | BACKOFF_BASE 2000ms，指数增长，BACKOFF_MAX 10000ms（2s → 4s → 8s → 10s 封顶），持续尝试不放弃 | 数据提取 |
| D34，§分发 | `dispatch` 复制一份 handler 数组允许回调内退订；单个订阅者异常不影响其他订阅者（绝不因推送崩页面） | 直接引用 |
| D34，§API | 导出 `connectRealtime` / `disconnectRealtime` / `onRealtime` / `offRealtime` / `isRealtimeConnected` / `resolveWsUrl` | 数据提取 |

### D35：`store-app/src/types/index.ts`（568 行）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D35，§定位 | 全量实体与 DTO 类型，是前后端契约的单一出处（结构性清点 + 关键类型精读，未逐行通读全部字段） | 综合归纳 |
| D35，§TicketStatus | 注释为「pending 待接单 / accepted 已确认接单（业代确认后回执）」 | 数据提取 |
| D35，§待接单笔数 | 类型中存在「待接单笔数」字段（用于看板 orderSummary） | 数据提取 |
| D35，§覆盖 | 涵盖 Role / User / RoleOption / Store / Visit / Task / Ticket / TaskType / TaskStatus / Diagnosis / ChatMessage / ChatReply / DashboardOverview / TodayRoute / CreateVisitPayload / CreateDiagnosisPayload / ChatPayload / CreateTicketPayload / CreateTaskPayload / CreateRectificationPayload / Rectification / TicketKind / TicketStatus / RestockItem / PlacementItem / ShootType 等（由 D30 api/index.ts 的 import 清单反推） | 数据提取 |

### D36：`store-app/src/views/`（7 个视图 · 职责清点）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D36，§RoleSelectView | P1 登录页；调用 `session.login(u, p)` 传入账号与密码两个参数（与 D7 报告的 B1 缺陷描述已不一致，修复已落地） | 数据提取 |
| D36，§TodayRouteView | P2 业代今日巡店；含「待接单」区块（店主 P6 下单 → 业代秒收，订货三端打通的落点），订阅 `ticket:new` 与 `ticket:status`（第 144 行 `onRealtime('ticket:status', ...)`），拉取 `pending` 状态订货单，确认成功后才从待接单区移除；第 92–123 行注释明确该区块功能 | 数据提取 |
| D36，§CaptureView | P3 巡店拍照；职责为上传/选择货架照 → AI 识别动画 → 生成诊断 | 综合归纳 |
| D36，§DiagnosisView | P4 诊断结果（1275 行，最核心）；引入 `RectificationCompare` 组件；调用 `streamGenerate` 分别生成 summary / order / pitch 三类 AI 内容；调用 `fetchForecast` 取补货推导；调用 `getRectifications` 取整改回执；第 3 行注释仍写「A–H 八模块」但正文已含 I–L（与 D1 §4 P4 补充一致） | 数据提取 |
| D36，§HistoryView | 巡店记录列表；依赖 `V_T` 前缀识别增量记录（与 D14 的约定成对） | 数据提取 |
| D36，§DashboardView | P5 经理看板（657 行）；含已接单/待接单展示（`orderSummary.pending`，来自后端 overview）；第 45 行注释记录了「原实现调 session.login('rep') 只传一个参数必失败」的历史问题 | 数据提取 |
| D36，§OwnerFlowView | P6 店员自助；含订单状态展示（`t.status === 'accepted' ? '业代已接单' : '待接单'`） | 数据提取 |
| D36，§PlaceholderView | 占位页，承载 `/rep/me` 与 404 | 综合归纳 |

### D37：`store-app/src/components/`（30 个组件 · 清单清点）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D37，§common 10 个 | AppIcon（内联 SVG）、AiBadge（AI 紫徽标）、ScoreRing（环形分数仪表）、HealthBadge（分档色 Badge）、SectionCard（白卡容器）、SkeletonBlock（骨架屏）、ToastHost（Toast 容器）、PhoneFrame（桌面端 390×844 手机壳 + 演示设置齿轮）、EmptyState（空态）、SmartImage（图片，含底部裁切） | 综合归纳 |
| D37，§business 14 个 | ActionPlan（千店千面方案）、AiLoadingOverlay（全屏分步加载）、AnnotatedImage（标注图 + 图层筛选 + 高亮联动）、CompareSlider（原图/标注拖拽对比）、DimensionBars（六维条形）、IssueList（问题清单）、MapView（Leaflet 巡店地图）、RectificationCompare（整改前后对比）、RectificationDialog（整改回执提交）、RiskCard（风险预判 + 推导依据）、StoreCard（巡店线路卡）、TaskDispatchDialog（下派任务弹层）、charts/DonutChart（健康分布环图）、charts/TrendLine（8 周趋势折线） | 综合归纳 |
| D37，§layout 3 个 | MobileLayout（390 竖屏外壳）、TabBar（底部 4 项）、DesktopHeader（经理看板顶栏） | 综合归纳 |
| D37，§新增组件 | 相对 D2 §2 的规划清单，实际新增了 MapView、RectificationCompare、RectificationDialog、SmartImage 四个组件（规划中无） | 数据提取 |
| D37，§MapView 要点 | 引用 `https://webrd0{s}.is.autonavi.com/appmaptile?...` 高德在线瓦片；监听 `tileload` / `tileerror`，失败时置 `tileFailed` 并显示无网提示（第 109 行 `map-offline-tip`） | 数据提取 |
| D37，§PhoneFrame 要点 | 「切换账号」实现为 `session.logout()` + Toast「请重新登录目标账号」+ 跳转 `/login`；注释记录原实现 `session.login(next)` 只传角色值与新签名不匹配必失败 | 直接引用 |

### D38：前端工程配置（package.json / vite.config.ts / .env）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D38，§package.json 元信息 | name `store-app`，type module；description 仍写「纯前端 + 本地 Fixture，全站离线」（与当前真后端形态不符） | 直接引用 |
| D38，§scripts | dev（vite）、build（vite build）、build:single（vite build --mode single）、preview（vite preview --port 4173）、typecheck（vue-tsc --noEmit） | 数据提取 |
| D38，§dependencies | echarts ^5.5.1、**leaflet ^1.9.4**、pinia ^2.2.2、vue ^3.4.38、vue-router ^4.4.3 | 数据提取 |
| D38，§devDependencies | @vitejs/plugin-vue ^5.1.3、autoprefixer、postcss、tailwindcss ^3.4.10、typescript ^5.5.4、vite ^5.4.3、vite-plugin-singlefile ^2.0.2；optionalDependencies 含 @esbuild/win32-x64 与 @rollup/rollup-win32-x64-msvc | 数据提取 |
| D38，§leaflet 实测 | `node_modules/leaflet/package.json` 实测版本为 **1.9.4**（与 PRD §9.1 与 README 的「Leaflet 4」表述不符，已登记为冲突 X12） | 数据提取 |
| D38，§vite.config | `base: './'`；alias `@` → ./src；dev server host 127.0.0.1 **port 5173**（strictPort false）；preview port 4173；optimizeDeps.include 预打包 vue / vue-router / pinia / echarts（避免演示中途二次预打包）；build outDir dist、assetsInlineLimit 4096、chunkSizeWarningLimit 1200；`--mode single` 时挂载 viteSingleFile | 数据提取 |
| D38，§.env.example | `VITE_API_BASE=http://127.0.0.1:3000`、`VITE_API_MODE=http`（注释说明 mock 模式已在 v1.1 移除，保留变量仅为兼容旧配置）、`VITE_DEMO_SPEED=1`；可选 `VITE_WS_BASE` 与 `VITE_ORIGIN`（默认已含 5180 / 5173）；注释警告 `.env` 缺失会导致 fetch 打到 dev server 自身拿到 index.html 而解析失败 | 直接引用 |
| D38，§端口偏差 | vite.config 的 dev port 为 5173，而 README 与启动说明统一宣称 5180；因 strictPort 为 false，实际端口由占用情况决定（已登记为冲突 X16） | 综合归纳 |

### D39：`_smoke/` 与 `_qa/`（验证证据，只读名称不重跑）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D39，§规模 | `_smoke/` 共 22 项（含 `_auth-helper.mjs`、`_db-baseline.json` 两个辅助件与 `chrome-cdp` 目录，脚本 19 个）；`_qa/` 共 7 个探针脚本 + 6 个 `chrome-prof*` 目录 | 数据提取 |
| D39，§覆盖映射 | 脚本名对应的已验证能力见本文档 §1.2 表（流程 / 渲染 / 图标 / 高亮 / 闭环 / P2 待办 / P5 看板 / SSE / WS / 鉴权 / 接口覆盖 / 算法推导 / 地图离线 / 切换修复 / 截图 / 终检 / API 与 UI 与 a11y 与故障注入探针 / 标签校验） | 综合归纳 |
| D39，§重要限制 | 本轮**未重跑任何脚本**，因此「已验证」仅指「历史上曾针对该能力建立过验证脚本」，**不能等同于当前代码状态通过验证**；此限制须由下游继承 | 推断 |

### D40：`docs/测评报告.md`

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D40，§文件状态 | 文件大小 0 字节，无任何内容；最后修改时间 2026-10-10 12:27 | 数据提取 |
| D40，§影响 | 无测评结论可继承，下游不得引用「测评已通过」类表述 | 直接引用 |

### D41：`WorkBuddy召唤话术.md`（目录内补充资料）

| 出处 | 内容摘要 | 引用方式 |
| --- | --- | --- |
| D41，§操作步骤 | 打开 WorkBuddy → 左侧「专家」→ 分类「技术工程」或搜索「软件开发团队」→ 召唤 → 粘贴话术并拖入 `最小需求清单.md` | 数据提取 |
| D41，§开场白 | 需求描述为「快消行业的 AI 巡店助手高保真演示原型，用于校园创新大赛，不要求真实上线，重点是跑通完整流程、界面可演示」；核心用户为蒙牛业务员；主线 5 步为看今日线路 → 到店拍货架（冷藏柜/常温架/堆头）→ AI 识别商品与排面与空位与价签 → 打健康分并列出问题做风险预判 → 支持多轮对话追问 | 数据提取 |

---

## 3. 冲突记录

> 不同资料对同一事实描述矛盾时，**并列保留两个版本**，不做裁决。
> 「文档自述优先级」列仅在**资料自身明确声明**时填写，不代表本摘要的裁决意见；未填写的条目为并列保留、待主理人或下游 Owner 裁决。

### 3.1 冲突登记

| 编号 | 冲突主题 | 版本 A | 出处 A | 版本 B | 出处 B | 差异说明 | 文档自述优先级 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| X1 | 后端架构形态与端点数量 | 17 个接口契约 + mock 默认（`VITE_API_MODE=mock`）+ 无 SSE/WS；Phase 2 的 AI 文案/视觉识别/实时推送标为「不实现」 | D2，§文首过期点、§3.3、§1.1 | 真后端 30 个 REST + 2 个 SSE + WebSocket，无 mock 层；实测 29 个 `/api/v1` 路由 + `/health` + `/ws` + `/uploads` | D3，§目录结构；D12，§端点实测清单 | 数量差 13 个端点，且 mock 层存在与否是根本形态差异 | D2 文首自述「当前真实实现以 README.md 与 PRD.md v1.1 为准」 |
| X2 | 后端接口数自述（同一仓库内） | 「17 个接口契约与前端 src/api/index.ts 一一对应」 | D12，§文件头注释；D25，§description；D27，§接口表 | 启动时由 `app._router.stack` 动态统计，打印 30；实测 29 个 `/api/v1` + `/health` | D12，§启动统计 | 同一文件内注释与代码行为不一致；D27 的登录路径还写作 `/api/v1/session/login`，而源码实为 `/api/v1/auth/login` | 无（源码行为与注释并存，需下游统一回写） |
| X3 | 风险预判弹性系数 | 排面弹性系数 0.35；`GAP_FACTOR=1.0`、`ELASTICITY=0.35` 仅在兜底路径使用 | D1，§7.3；D2，§5.5 | 无 ELASTICITY 常量，改为按缺口占比取严重度调整系数 0.7 / 0.95 / 1.4；fixture 中 S3 的 elasticity 实测为 0.95、S2_BEFORE 与 S5 为 1.4、S1 与 S2 后为 0.7 | D31，§RISK、§severityOf；D32，§diagnoses.json 各店 | 系数体系已从「单一弹性系数」换成「三档严重度系数」，PRD 与 ARCHITECTURE 均停留在旧口径 | D1 §7.4 声明「演示数据以 fixture 为准，公式用于现场/新增照片的动态计算路径」 |
| X4 | S3 风险月度流失数字 | 月度 ≈ 117 瓶 / ¥468；ARCHITECTURE 复算亦为 117 / ¥468 | D1，§7.3；D2，§5.5 | fixture 实测 monthlyBottles 116 / monthlyAmount 464 | D32，§diagnoses.json S3 | 周度一致（27 瓶 / ¥108），月度差 1 瓶 / ¥4，源于 4.3 倍系数的取整顺序差异 | D1 §7.4 声明以 fixture 为准 |
| X5 | 区域平均健康分 | 76.6（↑0.8，目标 80） | D1，§6.2 表；D1，§4 P5 线框 | fixture KPI 实测 74.3（↑0.8，目标 80） | D32，§dashboard.json KPI | 主数值差 2.3 分；D1 §6.2 自己的八周趋势 W8 也是 74.3，即 PRD 内部 6.2 表与趋势序列已不自洽 | D1 §文首声明「数字以 fixture 为准」 |
| X6 | 红灯门店数 | 12 家（↓5） | D1，§6.2 表；D32，§dashboard.json KPI | 10（↓5） | D1，§4 P5 线框 | 同一文档内 §4 线框与 §6.2 表不一致；fixture 为 12 | D1 §文首声明以 fixture 为准 |
| X7 | 本周缺货率 / 蒙牛铺货率 | 7.2% / 86.4% | D1，§6.2 表；D32，§dashboard.json KPI | 7.8% / 81.7% | D1，§4 P5 线框 | 同一文档内 §4 线框与 §6.2 表不一致；fixture 与 §6.2 一致 | D1 §文首声明以 fixture 为准 |
| X8 | 健康分布各档数 | 优秀 42 / 良好 53 / 预警 21 / 风险 12（合计 128） | D1，§6.2；D32，§dashboard.json 分布 | 优秀 41 / 良好 50 / 预警 21 / 风险 12（合计 124） | D1，§4 P5 线框 | 同一文档内 §4 线框的合计 124 与「共 128 家」文案自相矛盾 | D1 §文首声明以 fixture 为准 |
| X9 | P5 门店明细行数 | 演示环境展示 5 家重点店，PRD #38 要求 8–12 行 | D1，§5 #38 | fixture `storeRows` 实测 128 行 | D32，§dashboard.json storeRows | D7 报告（2026-10-10）记「只有 5 行」，与 2026-10-10 23:04 的 fixture 实测值不符；三份材料给出三个不同行数 | 无（5 / 8-12 / 128 三个版本并列，PRD #38「扩到全量 128 行前需加虚拟滚动」的要求是否落实待确认） |
| X10 | 视觉大模型型号 | qwen-vl-plus | D1，§9.1；D3，§技术栈、§密钥配置；D26，§模板推荐值 | 实际 `server/.env` 为 `qwen-vl-ocr`；index.js 与 vision.js 的代码默认值也是 `qwen-vl-ocr` | D26，§实际配置；D12，§LLM 默认配置；D20，§VL 配置 | 型号不同（ocr 系列与 plus 系列）；模板推荐值与本机实际配置亦不同 | 无（并列保留） |
| X11 | 文本大模型默认 | 通义千问 qwen-plus | D3，§技术栈、§密钥配置；D26，§实际配置 | index.js 代码默认为 `https://api.deepseek.com` + `deepseek-chat` | D12，§LLM 默认配置；D28，§三 环境变量 | 代码默认值与实际 .env 配置不同；deploy.md 的默认值表也写 DeepSeek | 无（.env 优先级高于代码默认，两者并存） |
| X12 | Leaflet 版本 | Leaflet 4 | D1，§9.1、§4 P2；D3，§技术栈 | package.json 声明 `^1.9.4`，node_modules 实测 1.9.4 | D38，§dependencies、§leaflet 实测 | 大版本号差 3 个主版本 | 无（并列保留） |
| X13 | 零外网铁律 vs 地图在线瓦片 | 铁律 2「一切资源本地化，零外网请求」，验收为断网时外域请求数 = 0；PRD #45「全站离线资源本地化，零 CDN」 | D2，§0 铁律2；D1，§5 #45 | `MapView.vue` 实际引用 `https://webrd0{s}.is.autonavi.com/...` 高德在线瓦片 | D37，§MapView 要点；D7，§1.3 B4 | D1 v1.1 已把地图瓦片列为「唯一在线请求」例外并加无网降级，但 D2 的铁律 2 原文未同步修订 | D1 §0 硬约束①与 #45 已声明地图瓦片为唯一例外；D2 未同步 |
| X14 | AI 降级策略 | 无 Key / 断网 / 上游失败时**静默降级为本地预置文案**，保证演示永不中断 | D1，§0 硬约束③；D28，§三 降级保证 | 后端不可用时**如实报错并提示**，不再偷偷降级为假数据；client.ts 已移除全部 mock 兜底 | D3，§运行态声明；D30，§client.ts 错误处理 | 降级语义完全相反；D31 的 FRIENDLY_ERROR 文案仍保留「已为你加载本地演示数据」的旧措辞 | 无（两条路径并存：LLM 层可降级、后端不可达层不降级，需下游明确边界） |
| X15 | mock 模式是否仍存在 | `VITE_API_MODE=mock / http` 可切换；deploy.md 称保持 mock 可走纯离线 | D28，§一、§三 环境变量；D27，§降级表述 | `VITE_API_MODE` 固定为 http（保留字段仅为兼容旧配置），mock 层已于 2026-10-09 移除 | D3，§环境变量；D38，§.env.example；D30，§client.ts 职责 | 部署文档与后端 README 停留在旧形态 | D30 与 D38 均声明 mock 已移除；D28 / D27 未同步 |
| X16 | 前端 dev 端口 | 5180（演示统一端口） | D3，§快速开始；D4，§二 启动顺序 | vite.config.ts 的 server.port 为 5173（strictPort false） | D38，§vite.config | strictPort 为 false 时实际端口由占用情况决定，两者都可能成立 | 无（并列保留） |
| X17 | 复查报告（D7）判定与当前源码状态 | 2026-10-10 判定：整改留证为假按钮（缺口 A）、任务上行缺失（缺口 B）、订货单只写不读（缺口 C）、明细表 5 行（缺口 D）、数字 36 瓶 ¥144（缺口 E）、切换角色失效（B1）、查看详情被弹回（B2）、区域切换假数据（B3） | D7，§1.2、§1.3 | 当前源码已存在：`rectifications` 表与 `POST/GET /api/v1/rectifications`、`broadcast('rectification:new')`、`RectificationDialog.vue` 与 `RectificationCompare.vue`、`GET /api/v1/tickets` 与 `PATCH /api/v1/tickets/:id`、业代端「待接单」区（订阅 `ticket:new` 与 `ticket:status`）、看板 `orderSummary.pending`、storeRows 128 行、dashboard.js 按区域重算、路由 `/rep/diagnosis/:id` 已放行 manager、`session.login(u, p)` 双参数调用、chat-qa.json 已为 27 瓶 ¥108 | D12、D14、D30、D32、D33、D36、D37 | 报告产出时间早于代码最后修改时间（2026-10-10 23:04），多项判定已不成立；但**未完成度需实测运行才能最终确认**，本摘要只登记事实差异不做结论 | 无（报告自述为「只读分析，未改动任何代码」，且基线为 PRD v1.0） |

### 3.2 资料缺口与待确认清单

| 编号 | 缺口项 | 性质 | 建议承接方 |
| --- | --- | --- | --- |
| G-01 | `docs/测评报告.md` 为 0 字节空文件，无任何测评结论 | 缺失资料 | 主理人 / 测评负责人 |
| G-02 | `_smoke`（19 脚本）与 `_qa`（7 脚本）本轮未重跑，只有脚本名作为能力证据，无最近一次通过/失败结论 | 未验证 | 主理人决定是否安排回跑 |
| G-03 | `server/src/redisLite.js` 的 RESP 协议实现细节未逐行精读 | 本阶段主动部分解析 | platform-architect 如需精确描述再回补 |
| G-04 | `store-app/src/types/index.ts`（568 行）未逐行通读全部字段 | 本阶段按主理人指令做结构性清点 | system-architect 如需字段级契约再回补 |
| G-05 | `store-app/src/views/`（7 个）与 `components/`（30 个）按主理人指令只做职责清点，未逐个通读全文 | 本阶段按指令限定 | 下游如需交互细节再回补 |
| G-06 | `产品主线图.html` 与 `产品全景图.html` 仅取标题与规模，未做视觉渲染与节点解析 | 本阶段按「可选」定位处理 | 主理人 / product-story-designer 如需图形内容再解析 |
| G-07 | `02_实拍素材` 目录未在本次转交范围内（D1 §6.6 提到该目录当时只有拍照指引文档、无实拍照片），实拍照片是否已落盘无法核实 | 外部资料未获取 | 主理人向产品侧确认 |
| G-08 | `store-app/public/stores/` 下的实际图片文件清单未盘点（仅从 fixture 的 url 字段间接得知命名） | 未读取 | 主理人 / 前端 |
| G-09 | MCP 三个工具（`get_batch_expiry` / `get_price_book` / `get_store_inventory`）未实际调用，无返回数据样本 | 未实测 | 主理人决定是否启动后端取样 |
| G-10 | LLM 实际连通性未验证；`/health` 的 `llm` 字段自述为「dashscope(未验证连通性)」，注释并指出错 key 也会报 dashscope | 未验证 | 主理人 / 现场演示前自检 |
| G-11 | `start-all.bat`、`package-lock.json`、`node_modules`、`store-app/dist` 产物、`_screenshots` 目录、`chrome-prof*` 6 个目录未纳入本轮登记 | 未读取 | 主理人如需部署证据再补 |
| G-12 | 演示基准日固定为 2026-10-02，而系统当前日期为 2026-10-10；所有截图口径、任务时限、趋势周期均以基准日为准，真实运行时的日期表现未核实 | 口径待确认 | 主理人 / 现场演示前确认 |

---

## 4. 硬指标清单

| 章节 | 硬指标 | 状态 |
| --- | --- | --- |
| §0 | 元信息完整（标题 / 版本 / 状态 / 日期 / 整理人 / 审核人 / 原始资料清单 / 版本变更表全部为真实值） | ✅ |
| §1 | 资料清单覆盖主理人转交的全部资料，共登记 41 组 | ✅ |
| §1 | 每份资料有解析状态；无整份跳过，1 份部分解析已注明原因（D23） | ✅ |
| §2 | 逐份文档按自身章节结构逐条摘要，共 41 个 D 编号小节 | ✅ |
| §2 | 每条摘要标注了 `D编号，§章节`，共 200 余条出处标注 | ✅ |
| §2 | 每条摘要标注引用方式（直接引用 / 数据提取 / 综合归纳 / 推断），推断类 3 条均显式写出推断风险 | ✅ |
| §3 | 冲突信息并列保留多个版本并标注双方出处，共 17 条（X1–X17），未做裁决 | ✅ |
| 全文 | 无残留占位符：不含尖括号占位、不含日期占位、不含待定标记、不含填写参考前缀、不含缺口标记字样 | ✅ |
| 全文 | 附录 A（生成流程）与附录 B（解析 Skill）保留；decision 结论明确 | ✅ |

---

## 附录 A：生成流程

### 流程总览

| 步骤 | 动作 | 落入章节 |
| --- | --- | --- |
| Step0 | 读取模板 + 全部原始资料，识别待替换标记，确认硬指标清单 | — |
| Step1 | 盘点资料清单，标注解析状态 | §1 |
| Step2 | 逐份打开资料，按自身章节结构逐条摘要，标注 `D编号，§章节` 与引用方式 | §2 |
| Step3 | 交叉比对不同资料，发现并记录矛盾（并列保留） | §3 |
| Step4 | 登记资料缺口与待确认项 | §3.2 |
| Step5 | 逐项核验硬指标 | §4 |

```mermaid
flowchart LR
    S0[读取模板与资料] --> S1[盘点资料清单]
    S1 --> S2[逐份精读逐章节摘要]
    S2 --> S3[交叉比对记录冲突]
    S3 --> S4[登记资料缺口与待确认项]
    S4 --> S5[硬指标自检]
```

### 整理原则

1. **逐份精读，不跨文档归并**：摘要按文档自身章节结构组织，不做跨文档的主题重组（那是下游的事）
2. **出处即章节号**：每条摘要标注 `D编号，§章节`，直接映射回原文位置
3. **冲突保留**：矛盾信息并列保留两个版本，不擅自裁决
4. **事实驱动**：以原始资料中的事实为准，不添加主观推断；确需推断时显式标注推断与风险
5. **不越权**：只登记事实、冲突、缺口与待确认点，不输出方案裁决、不提前做业务边界 / 模块拆分 / 部署拓扑 / 安全策略 / 用户故事的结论

---

## 附录 B：解析 Skill

- `docx`：Word 类产品/业务文档
- `pdf`：PDF 类规范、手册、报告
- `pptx`：PPT 类方案/汇报
- `xlsx`：Excel 类数据清单、指标表

**本轮实际使用的解析方式**：转交资料不含上述四类文件，实际为代码仓库文本型文件，按扩展名直接读取并做结构化提取：

| 实际类型 | 解析方式 | 涉及资料 |
| --- | --- | --- |
| md | 全文读取 + 按标题层级切章节 | D1–D7、D27、D28、D40、D41 |
| mermaid | 读取类定义 / 参与者与消息 | D8、D9 |
| html | 读取 title 与结构（未渲染） | D10、D11 |
| js / mjs | 全文或关键段读取 + 路由/导出符号清点 | D12–D24 |
| ts | 全文或关键段读取 + 常量与导出清点 | D30–D35、D38 |
| vue | 职责清点 + 关键行精读 | D36、D37 |
| json | 读取 + 用 node 脚本做数值聚合与加权回算校验 | D25、D29、D32、D38 |
| 文本 | 读取变量行并脱敏 | D26、D38 |
| 脚本目录 | 只读文件/目录名，不重跑 | D39 |

---

## decision

`decision: "资料摘要完成，下游可进入"`

**完成度说明**：主理人转交的资料已全部登记并逐份逐章节摘要（41 组资料、200 余条出处标注）；17 条冲突已并列保留并标注双方出处；12 项资料缺口已具名登记于 §3.2；9 项硬指标自检全部达标。

**移交下游时须同时继承的三条限制**：

1. 冲突 X1–X17 **未经裁决**，下游（business-architect / system-architect / platform-architect / security-architect / product-story-designer）不得默认采信任一版本，须按各自 Owner 职责做出裁决并回写。
2. §1.2 的「已验证能力清单」基于脚本名反推，**不等于当前代码状态通过验证**（G-02）。
3. `docs/测评报告.md` 为空（G-01），下游不得引用任何测评结论。
