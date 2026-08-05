# MB-GD1 完成报告：CLI 快速反馈层

日期：2026-08-05
状态：完成，证据齐全

## 交付内容

### 1. `gdeck check --file <path>` —— 单文件秒级校验

- 新增 `--file` 选项（`registry/commands.mjs`），允许在 `check` 命令上指定单个 `.gd` 文件。
- 新增校验 runner：`godot/check_script_runner.gd`（CLI 工具树内，随 CLI 分发）。
  - 通过 `SceneTree._initialize()` 加载目标脚本，**项目 autoload 已注册**，避免 `--check-only --script` 对 autoload 引用的误报（实测 `--check-only` 对 `FlightDeckProbe` 引用报 `Identifier not found`，SceneTree 方案无误报）。
- 实现于 `cli/gdeck.mjs` 的 `checkScriptFile()`：
  - 路径安全：必须位于项目内（`pathIsInside`）、必须存在、必须 `.gd` 后缀。
  - 判定沿用既有 `ERROR_PATTERN`（`SCRIPT ERROR|Parse Error|ERROR:|FATAL:`），与全量 `check` 契约一致（Godot 对解析失败返回 exit 0，不能只信退出码）。
  - 失败时输出错误摘要（含 `SCRIPT ERROR` 行与 `at: ...file.gd:行号` 行）。
- 全量 `check`（无 `--file`）行为不变。

### 2. `gdeck verify --json` —— 机器可读失败摘要

- `verify` 新增 `--json` 选项（registry + 实现）。
- 失败时输出结构化 digest（`printVerificationFailureDigest` 的 JSON 分支）：
  - `verdict`、`toolVersion`、`decisiveStage`（id/kind/classification/summary/reportPath/exitCode/outputTail/**failures**）
  - `failedStages`（同结构数组）、`recentStages`、`reports`（json/markdown 路径）
  - **failures** 从 stage report 原文（`reportPath` 指向的 JSON）提取失败用例的 `name`（测试函数名）、`file`（res:// 路径）、`failureKind`（如 `assertion`）、`failures`（断言消息）、`failureDetails`（expected/actual）——不受 aggregate 投影哈希化影响。
- 通过时无 digest 输出（无失败即无摘要）；文本 digest 保留（不传 `--json` 时行为不变）。

## 证据

### check --file 演示

| 场景 | 结果 | 耗时 |
|---|---|---|
| 好文件 `src/presentation/entry_chrome.gd`（引用 autoload） | exit 0，`Flight Deck check passed` | 0.33s |
| 坏文件（类型错误 + 未声明标识符） | exit 1，输出 `SCRIPT ERROR` + `at: ...gd:3` 行号 | — |
| 项目外文件 `C:/Windows/notepad.exe` | exit 1，拒绝（非 .gd） | — |
| 不存在文件 | exit 1，拒绝 | — |
| 全量 `check godot`（无 --file） | exit 0，`Flight Deck check passed`（契约不变） | — |

坏文件用例已删除，未残留。

### verify --json 演示（临时失败测试 `zz_tmp_mbgd1_fail_test.gd`，验证后已删除）

```json
{
  "schemaVersion": 1,
  "verdict": "FAILED",
  "decisiveStage": {
    "id": "unit",
    "kind": "unit",
    "classification": "assertion",
    "reportPath": "...\\stage-reports\\unit-...json",
    "exitCode": 1,
    "failures": [{
      "name": "test_tmp_always_fails",
      "file": "res://tests/zz_tmp_mbgd1_fail_test.gd",
      "failureKind": "assertion",
      "failures": ["MB-GD1 temporary failure fixture"],
      "failureDetails": [{"assertion": "true", "expected": true, "actual": false}]
    }]
  }
}
```

## 回归

- `npm run godot:gdeck:verify:fast`：**PASSED**（check + unit 全绿）。
- `gdeck doctor godot`：关键项全绿（Runtime probe、Addon version match `1.6.3-cursor.2`、Cursor compat mode、Editor bridge availability `connected ... 1.6.3-cursor.2`、Editor Bridge read available）。
- `gdeck describe check` / `describe verify`：usage 与选项反映新能力。
- 未修改游戏玩法代码；未改变 `allowWrites`/`supplementaryEnabled`（保持 false）。

## 备份

- CLI 修改前备份：`D:\03_Godot\04_Tools\GodotFlightDeck-Cursor\cli\backup-mbgd1\gdeck.mjs.bak`（247,560 字节）。
- 变更文件：`cli/gdeck.mjs`、`registry/commands.mjs`、新增 `godot/check_script_runner.gd`。

## 发现与备注（委托决策记录）

1. **单文件校验技术路线**：选择 SceneTree runner（`-s` + `_initialize` 加载），否决 `--check-only --script`（对 autoload 引用误报，实测证据见上）。
2. **Godot 解析失败退出码为 0**：校验判定必须依赖 `ERROR_PATTERN` 输出匹配，与既有 `checkProject` 一致。
3. **plan_drift 防护（既有行为，非本 Mission 引入）**：任何项目树变化（含 Godot import 生成/删除 `.uid`）后的**首次** `verify` 会以 `INCONCLUSIVE`/`plan_drift` 拒绝，第二次运行才执行。Agent 工作流须知：改文件后第一次 verify 可能被拒，重跑即可。此行为不在本 Mission 范围，留待评估是否优化。
4. **aggregate 报告对 unit case 名称哈希化**（`case-<sha12>`），完整名称/文件在 stage report 原文；digest 已按原文提取。

## 后续

- 下一 Mission（MB-GD2：probe 运行时只读观察）按程序约定使用 `$mission-brief` 生成。
