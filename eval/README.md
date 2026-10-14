# 视觉识别自测集（P0-3）

> 目的：用**与线上诊断完全相同的视觉函数**跑小样本评测，产出可写进 PDF 的真实数据，
> 把"方案可落地性/AI 应用深度"从口头声称变成可复核数字。

## 文件

- `labels.json`：逐图人工标注真值（skuCount / emptyCount / competitorCount / priceTagMissing）。
- `vision-benchmark.mjs`：评测脚本（复用 `server/src/vision.js`，非另写模型调用）。
- `results.json` / `results.md`：最近一次运行结果（机读 / 人读）。

## 使用步骤

1. 在 `server/` 配好视觉模型 key（`.env` 的 `LLM_VL_*`）。
2. **先人工标注（最关键）**：逐张打开 `store-app/public/stores/**/*.jpg`，按统一口径数出：
   - `skuCount`：画面中清晰可见的蒙牛 SKU **排面数**（正面朝外、可辨识的瓶/盒）；
   - `emptyCount`：蒙牛所在层架的明显空位；`competitorCount`：竞品排面数；`priceTagMissing`：缺失/不符价签数。
   数完把 `labels.json` 对应条目的 `"verified"` 改为 `true`。
   > 当前预填值来自系统陈列基线，**不是人工真值**；verified=false 的结果只能内部调试，禁止写进 PDF。
3. 运行（在 `server/` 目录，保证读到 `.env`）：
   ```bash
   node ../eval/vision-benchmark.mjs
   ```
4. 打开 `results.md`：全对率、±1 容差率、MAE、平均耗时、降级率、不可用率。
5. 想要更大样本：往 `store-app/public/stores/eval/` 加实拍图，在 `labels.json` 追加条目即可（建议 n≥25 更有说服力）。

## 已测结论（2026-10-12，n=5，**待人工标注复核**）

- 视觉模型 `qwen3-vl-plus` 对全部 5 张图均返回结构化结果，无一次调用失败/计数越界降级。
- 单次端到端平均耗时约 **11 秒**（冷启动）→ 支撑"录屏/答辩前先预热一次"的操作建议。
- 计数整体偏高（相对陈列基线），这正是产品里保留**业务上限校验 + 只采信置信层 + 算法兜底**的原因；
  PDF 引用准确率前必须以人工真值重跑，宁可不写数字，也不写未经验证的数字。
