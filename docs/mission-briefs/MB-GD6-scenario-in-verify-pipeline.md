# Mission Brief: MB-GD6 scenario 进 verify 流水线（core-loop profile）

## Outcome

交互断言成为验证流水线的一等公民：`gdeck verify --profile core-loop`（或等价 profile 名）一条命令运行 GDScript check + unit + 代表性 scenario（含 fixture 驱动的地图拖动/缩放断言），通过/失败与证据链完整可审计；Agent 改完交互代码后用一个命令确认"语法 + 逻辑 + 交互"三层全绿。

## Context

- 程序总纲：`docs/mission-briefs/MB00-gdeck-agent-loop-program.md`；MB-GD1..MB-GD5 已完成，报告在 `docs/gdeck-program/mission-reports/`。MB-GD5 交付了 scroll/drag 注入与 `strategy-map-pan-zoom` 场景（11 steps / 2 assertions 通过）。
- CLI 位置：`D:\03_Godot\04_Tools\GodotFlightDeck-Cursor`（1.6.3-cursor.2，in-process 兼容模式）。
- 现状事实（已核实）：
  - `verification-plan.mjs` 已支持 `scenarios` stage：profile 声明 `scenarios` 数组（显式）或 `true`/缺省（auto 发现 `qa/scenarios/*.json`）；每个 scenario 由 `runScenario` 执行，其定义内 `profile` 字段决定 fixtureAdapter（`strategy-map-pan-zoom.json` 已声明 `"profile": "strategy-map"`）。
  - 当前 `.gdeck/config.json` 的 `verificationProfiles`：`fast`（check+unit auto）与 `daily`（check+unit true）**均未声明 scenarios**；verify 报告显示 scenario 为 `not_configured`。
  - MB-GD1 曾记录 plan_drift 既有行为（项目树变化后首次 verify 被拒，第二次通过）；scenario 纳入流水线后该行为同样适用，不属本 Mission 修复范围。
  - 项目验证门禁 `npm run godot:gdeck:verify:fast` 与 `doctor` 当前全绿。

## Required Behaviors

- **新增 verification profile**（如 `core-loop`，命名由执行者定）：`check: true` + `unit: true` + `scenarios: [strategy-map-pan-zoom]`（显式选择，保证流水线只跑确定集）。
- `gdeck verify godot --profile core-loop`：单命令执行 check → unit → scenario；scenario 失败时 verify 失败且 digest 可定位（stage id、scenario 名、失败 step/断言）。
- **证据完整**：scenario stage 的 report（含语义事件、断言计数、截图路径）进入既有证据链（result envelope、SHA-256、evidence-index），不新增旁路输出。
- **不破坏既有 profile**：`fast`/`daily` 行为不变；`verify:fast` 仍是 MB 回归门禁。
- **回归**：`gdeck doctor` 全绿 + `npm run godot:gdeck:verify:fast` 通过 + `gdeck verify --profile core-loop` 通过。

## Constraints

- 只改 `.gdeck/config.json`（verificationProfiles）与必要时 CLI 的 profile 校验逻辑；**不修改游戏玩法代码**与已有 scenario 数据（除非证据要求修正，修正需记录）。
- 不改 `fast`/`daily` 语义；不弱化现有门禁。
- 修改 CLI 前保留可还原备份；不引入新组件；不 force push、不改 git config、不发布；`allowWrites`/`supplementaryEnabled` 保持 false。
- plan_drift 首次拒绝属既有行为：验证时连续跑两次，记录第一次 INCONCLUSIVE（若有）与第二次通过，不得把该现象写成功能缺陷或绕过。

## Non-goals

- 不做 scenario 编写工具/录制器。
- 不把全部 MB 门禁合并成单一 profile（fast 保持轻量）。
- 不做视觉断言进流水线（visual-test 属独立能力，后续按需评估）。
- 不新增 scenario 类型或输入注入能力（MB-GD5 已交付）。

## Evidence of Completion

- 演示证据：`gdeck verify godot --profile core-loop` 全绿（check/unit/scenario 各 stage 通过，报告含 scenario 断言计数与截图路径）；人为改坏 scenario 断言（用后恢复）→ verify 失败且失败定位到 scenario stage/断言。
- 既有门禁回归：`npm run godot:gdeck:verify:fast` 通过；`gdeck doctor` 关键项全绿；`scene doctor` 基线不变。
- 确定性：core-loop 连续两次通过（记录第一次若遇 plan_drift 的 INCONCLUSIVE 与第二次 PASSED）。
- 可还原证据：config 变更 git 可回退；CLI 备份（若改）存在。
- 完成报告写入 `docs/gdeck-program/mission-reports/MB-GD6-scenario-in-verify-pipeline.md`，记录未修改玩法代码、未改 allowWrites、fast/daily 未变。

## Delegated Decisions and Unknowns

- profile 命名（`core-loop` vs 其它）、scenarios 显式数组 vs auto、verify 的 scenario stage 是否需要额外超时/帧预算配置由执行者从证据决定。
- 若 verify 的 scenario stage 对 fixtureAdapter profile 有额外校验（如 profile 必须存在于 config），记录并按现有契约处理。
- 完成本 Mission 后，使用 `$mission-brief` 生成 MB-GD7（如存在后续 backlog）或按总纲收尾；不预生成后续 brief。

## Autonomy and Approval Boundaries

- 授权：本地修改 CLI（先备份）、运行 gdeck/Godot 命令与测试、更新 `.gdeck/config.json`、在迁移分支创建本地提交、创建/更新本程序 brief 与报告。
- 需批准：下载或安装新组件、推送/PR/发布、修改总纲固定条款、将 `allowWrites`/`supplementaryEnabled` 改为 true、删除备份、破坏性 Git/文件操作。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
