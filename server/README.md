# 店小C · 后端骨架（Phase 2）

蒙牛 AI 巡店助手「店小C」的真实后端：**Express + SQLite**（Node 内置 `node:sqlite`，零数据库依赖）。

17 个接口契约与前端 `store-app/src/api/index.ts` 一一对应，Phase 1 的 mock 层可无缝切换为真后端。

## 目录结构

```
server/
├── package.json
├── src/
│   ├── index.js      # Express 入口 + 17 个路由 + 诊断装配
│   ├── db.js         # fixture 读取 + SQLite 建表/种子/CRUD
│   └── domain.js     # 诊断领域逻辑（健康分/方案/风险/对话，前端 domain 移植）
└── data/store.db     # SQLite 数据库（首次启动自动生成）
```

## 快速开始

```bash
cd server
npm install          # 安装 express + cors
npm start            # 启动，默认 http://127.0.0.1:3000
```

启动后访问健康检查：`http://127.0.0.1:3000/health`

## 前端接入（切换真后端）

编辑 `store-app/.env`（或 `.env.local`）：

```
VITE_API_MODE=http
VITE_API_BASE=http://127.0.0.1:3000
```

然后重启前端 dev server。前端会通过 fetch 走真实 HTTP 接口；后端不可用时自动降级回本地 mock（保证演示不中断）。

## 17 个接口契约

| # | 方法 | 路径 | 说明 |
|---|---|---|---|
| ① | GET | /api/v1/meta/roles | P1 三角色卡 |
| ② | POST | /api/v1/session/login | 模拟登录/切换角色 |
| ③ | GET | /api/v1/stores | 门店列表 |
| ④ | GET | /api/v1/stores/:id | 门店详情 |
| ⑤ | GET | /api/v1/visits/today | P2 今日巡店（含待办） |
| ⑥ | GET | /api/v1/visits | 巡店记录列表 |
| ⑦ | GET | /api/v1/visits/:id | 巡店详情+诊断 |
| ⑧ | POST | /api/v1/visits | 完成巡店回写 |
| ⑨ | POST | /api/v1/diagnoses | ★ 拍照→AI 诊断 |
| ⑩ | GET | /api/v1/diagnoses/:id | P4 诊断结果 |
| ⑪ | POST | /api/v1/ai/chat | ★ 多轮追问 |
| ⑫ | GET | /api/v1/ai/chat/suggestions | 快捷问题 chips |
| ⑬ | POST | /api/v1/tickets | 整改单/订货建议 |
| ⑭ | GET | /api/v1/tasks | 业代待办列表 |
| ⑮ | POST | /api/v1/tasks | ★ 经理下派任务 |
| ⑯ | PATCH | /api/v1/tasks/:id | 标记已处理 |
| ⑰ | GET | /api/v1/dashboard/overview | P5 经理看板全量 |

## 数据设计

- **静态数据**（users/stores/skus/visits/diagnoses/dashboard/chatQa）：直接复用前端 `store-app/src/fixtures/*.json`，保证口径一致；
- **可写集合**（tasks/tickets/新增 visits/诊断快照）：落 SQLite，**重启不丢** → 「经理下派任务 → 业代端待办同步」跨进程也成立。

## 验证示例

```bash
# 登录
curl -X POST http://127.0.0.1:3000/api/v1/session/login -H "Content-Type: application/json" -d '{"roleId":"manager"}'
# 下派任务
curl -X POST http://127.0.0.1:3000/api/v1/tasks -H "Content-Type: application/json" -d '{"storeId":"S5","taskType":"OOS","dueAt":"今日 18:00","note":"测试","assigneeId":"U_REP"}'
# 业代待办
curl "http://127.0.0.1:3000/api/v1/tasks?assigneeId=U_REP"
```
