# Mission Brief: MB-GD1 CLI 快速反馈层

## Outcome

本机 gdeck CLI（Cursor fork）支持对单个 `.gd` 文件的秒级语法/类型校验，且 verify 失败摘要可输出机器可读 JSON；Agent 修改一个文件后能在约 1 秒内确认对错，并在失败时程序化定位到 stage/文件/行号。

## Context

- 程序总纲：`docs/mission-briefs/MB00-gdeck-agent-loop-program.md`（本 Mission 是其第一个执行切片；本程序与 Godot 迁移程序独立并行）。
- CLI 位置：`D:\03_Godot\04_Tools\GodotFlightDeck-Cursor`（当前 1.6.3-cursor.2，in-process 兼容模式，经 `bin\gdeck-cursor.cmd` 调用）。
- 现状事实（已核实）：
  - `checkProject`（`cli/gdeck.mjs` 约 2143 行）执行 `godot --headless --path <project> --editor --quit` 全项目导入校验；本项目实测约 6 秒，Agent 高频小改时反馈环过慢。
  - `verify` 的失败摘要 `printVerificationFailureDigest` 只输出人读文本/Markdown，无结构化 JSON 输出；报告 JSON 已含 stage 级信息，但失败定位粒度与机器可读契约未定义。
  - 项目验证门禁：`npm run godot:gdeck:verify:fast`（check + unit 自动发现）当前全绿；`doctor` 全绿（addon 1.6.3-cursor.2 与 CLI 匹配）。
  - Godot 4.7.1 headless 支持 `--check-only` 相关能力；具体单文件校验技术路线未定，属委托决策。

## Required Behaviors

- `gdeck check --file <相对或绝对路径>`（或等价命令形态）只校验目标 `.gd`：好文件秒级通过；坏文件返回错误，输出含文件路径与行号（机器可读）。
- 对项目外文件、非 `.gd` 文件、不存在的文件给出明确错误，不得静默通过或误伤。
- 全量 `check`（无 `--file`）行为保持不变：仍全项目导入校验，退出码与输出契约不变。
- `verify` 增加结构化失败输出（如 `--json` 或独立报告字段）：包含失败 stage、目标、文件、行号、消息；文本摘要与 Markdown 报告保持可用。
- 现有证据契约不削弱：result envelope、SHA-256、evidence-index 行为不变；新输出不得绕过或改写既有报告发布路径。
- 回归：`gdeck doctor` 全绿 + `npm run godot:gdeck:verify:fast` 通过；项目 addon 与 CLI 版本一致。

## Constraints

- 只改 Flight Deck CLI（及必要时的项目 addon 同步路径）；不修改游戏玩法代码（`godot/src/` 下的功能实现）。
- 修改 CLI 文件前必须保留可还原备份（如 `.bak-<version>` 副本）；不 force push、不改 git config、不发布。
- 不引入新组件/依赖下载；GDScript/Node 现有工具链内完成。
- `allowWrites`/`supplementaryEnabled` 保持 false；不执行任何破坏性 editor 操作。

## Non-goals

- 不做运行时观察通道（属 MB-GD2 probe query/watch）。
- 不做场景编辑或场景体检（属 MB-GD3/MB-GD4）。
- 不优化全量 `check` 本身的耗时（保持契约稳定）；不做并行化、缓存等架构改造。
- 不改变 unit 发现机制与 `verify --profile` 结构。

## Evidence of Completion

- 演示证据（fixture 级）：对仓库内一个好 `.gd` 与一个临时坏 `.gd` 分别运行新命令，记录通过/失败输出（含文件、行号）与耗时（秒级）；坏文件用例执行后删除，不残留。
- 契约证据：全量 `check` 前后输出对比（无 `--file` 时行为不变）；`verify` 的结构化输出样例记录到报告。
- 回归证据：`gdeck doctor` 关键项全绿；`npm run godot:gdeck:verify:fast` 通过。
- 可还原证据：CLI 修改前备份文件存在且可列出。
- 完成报告写入 `docs/migration/` 或本程序约定位置（如 `docs/gdeck-program/`，不存在则创建），并在报告尾部记录"未修改游戏玩法代码、未改变 allowWrites"。

## Delegated Decisions and Unknowns

- 命令形态（`check --file` 参数 vs `check-file` 子命令）、JSON schema 字段命名由执行者决定，需与既有输出风格一致。
- 单文件校验技术路线（headless `--check-only`、临时 EditorScript、其它）由执行者从 Godot 4.7.1 实际行为证据决定；若该路线在 Windows 上有已知缺陷，记录并选择可工作方案。
- 是否把 `--file` 接入 verify profile 由证据决定（本次不强制）。
- 完成本 Mission 后，使用 `$mission-brief` 生成 MB-GD2 brief；不预生成后续 backlog。

## Autonomy and Approval Boundaries

- 授权：本地修改 CLI（先备份）、运行 gdeck/Godot 命令与测试、必要时经 `sync-addon` 同步项目 addon、在迁移分支创建本地提交、创建/更新本程序 brief 与报告。
- 需批准：下载或安装新组件、推送/PR/发布、修改总纲固定条款、将 `allowWrites`/`supplementaryEnabled` 改为 true、删除备份、破坏性 Git/文件操作。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
