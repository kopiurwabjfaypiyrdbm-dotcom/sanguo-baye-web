# MB-GD6 完成报告：scenario 进 verify 流水线（core-loop profile）

日期：2026-08-05
状态：完成，证据齐全

## 交付内容

### `core-loop` verification profile（`.gdeck/config.json`）

```json
"core-loop": {
  "description": "Syntax + logic + interaction regression: check, unit and the strategy-map pan/zoom scenario",
  "check": true,
  "unit": true,
  "scenarios": ["strategy-map-pan-zoom"]
}
```

- `gdeck verify godot --profile core-loop`：**一条命令**跑 check（GDScript 语法）→ unit（逻辑）→ scenario（交互断言）。
- scenario stage 走既有契约：`runScenario` 读取 scenario 定义的 `profile`（strategy-map → fixtureAdapter），报告与截图（`scenario-*.png`）进证据链（result envelope、stage report、evidence-index）。
- `fast`/`daily` 未改动。

## 证据

| 验证 | 结果 |
|---|---|
| core-loop 首次运行 | **PASSED**，Stages: 3 passed / 0 failed（check + unit + scenario） |
| 确定性重跑 | PASSED（连续两次一致） |
| 坏断言（kind 改为不存在，用后恢复） | verify **FAILED**，`Classification: scenario_expectation`，`Decisive functional/scenario:strategy-map-pan-zoom → FAILED`（定位到 scenario stage） |
| `npm run godot:gdeck:verify:fast` | PASSED（2 stages，语义不变） |
| `gdeck doctor godot` | 20 项 ✓ |
| scenario 证据产物 | stage_report JSON + capture PNG 路径出现在 verify 报告 |

## 备份

- 无 CLI 代码变更（纯配置）：`.gdeck/config.json` 变更 git 可回退；未动 addon。

## 发现与备注

1. verification-plan 的 `scenarios` 显式数组自动补 `.json` 扩展名（`projectTarget`），配置写场景名即可。
2. scenario 的 `profile` 字段（MB-GD5 已声明 `strategy-map`）是 fixtureAdapter 与 frames/seed 的唯一来源，verify 无额外配置需求。
3. 本次未遇到 plan_drift（无项目树变化）；后续 Agent 改代码后首次 core-loop 若遇 INCONCLUSIVE 属既有行为，重跑即可。

## 后续

- MB-GD1..MB-GD6 全部完成：gdeck 已具备"验证（check --file / verify --json / scene doctor / scene set / verify core-loop）＋观察（probe query / watch）＋交互回归（scroll/drag scenario）"的 Agent 感知闭环。
- 程序收尾按总纲：更新程序证据、生成收尾报告并交还用户确认闭环成立（人工短确认）。
