# Mission Brief: MB-GD3 场景完整性体检（scene doctor）

## Outcome

Agent 能在修改前对 Godot 项目全部 `.tscn` 做完整性体检：ext_resource 路径/类型引用断裂、uid 失配、sub_resource id 冲突、节点定义异常被检出，且坏场景在 Godot 加载层被确认（而非仅静态猜测）；体检报告人读 + JSON 双形态输出。

## Context

- 程序总纲：`docs/mission-briefs/MB00-gdeck-agent-loop-program.md`；MB-GD1（check --file + verify --json）、MB-GD2（probe query + watch）已完成，报告在 `docs/gdeck-program/mission-reports/`。
- CLI 位置：`D:\03_Godot\04_Tools\GodotFlightDeck-Cursor`（1.6.3-cursor.2，in-process 兼容模式）。
- 现状事实（已核实）：
  - 项目有 **17 个 `.tscn`**（`godot/scenes/presentation/`），**0 个 `uid://` 引用**（全部 path= 形式）；静态扫描 39 条 `ext_resource` 引用当前全部有效（干净基线）。
  - Godot 4.7.1 headless 可通过 `SceneTree._initialize()` + `load()` 批量加载场景（MB-GD1 的 runner 模式已验证），实测 17 场景全 OK 耗时 **1.8s**；缺资源时 Godot 输出 `ERROR: Resource file not found` 且 `load()` 返回 null（MB-GD2 watch 演示已实证）。
  - `.tscn` 为文本格式：`[gd_scene load_steps=N format=3]` 头、`[ext_resource type=... path=... id=...]`、`[sub_resource type=... id=...]`、`[node name=... type=... parent=...]` + 缩进属性行；静态正则可做快速层，Godot load 做权威层。
  - 现有 `gdeck check` 只校验 `.gd` 语法，不检查场景引用；`gdeck editor inspect` 依赖编辑器运行。
  - 项目验证门禁 `npm run godot:gdeck:verify:fast` 与 `doctor` 当前全绿。

## Required Behaviors

- **命令形态**：`gdeck scene doctor [project] [--json]`（或等价形态，由执行者定；需注册 `scene` 命令并加 actions 或独立命令）。
- **静态层**（纯 Node，不启动 Godot，秒级）：
  - `ext_resource` 的 `path=` 存在性（相对 `res://`）；`type=` 与目标资源扩展名合理性（如 Script/.gd、Texture2D/.png|.webp、Theme/.tres）。
  - `sub_resource` id 唯一性；`load_steps` 与实际资源数一致性（不一致报 warning）。
  - `node` name 在同级唯一、`parent` 引用存在；节点属性行缩进/未知键报 warning 级问题。
- **加载层**（Godot headless，复用 MB-GD1 SceneTree runner 模式）：`load()` 每个 `.tscn`，失败（null 或输出 ERROR 模式）记为 broken，输出 Godot 错误原文。
- **报告**：人读清单（每场景 OK/broken/warning + 详情）+ `--json` 结构化（schemaVersion、toolVersion、scanned/broken/warning 计数、按场景分组的 findings）；退出码 0=全 OK，1=有 broken。
- **确定性**：同一项目多次运行结果一致；不修改任何场景/资源文件（只读体检）。
- **回归**：`gdeck doctor` 全绿 + `npm run godot:gdeck:verify:fast` 通过；项目 addon 与 CLI 版本一致。

## Constraints

- 只改 Flight Deck CLI 与项目 addon（如需）；不修改游戏玩法代码与任何 `.tscn`/资源文件。
- 只读体检：不写场景、不生成基线、不改 `.gdeck` 之外的任何文件。
- 修改 CLI 文件前保留可还原备份；不引入新组件/依赖；不 force push、不改 git config、不发布；`allowWrites`/`supplementaryEnabled` 保持 false。
- 静态层不得把"现代规则"误报为 broken；warning 与 broken 严格分级。

## Non-goals

- 不做场景编辑（属 MB-GD4 scene set）。
- 不做视觉/布局审查（渲染层问题不属于本体检；视觉基线属 visual-test 范畴）。
- 不做 .tres/.gd 的全量体检（只覆盖场景引用的目标资源存在性）。
- 不修改或迁移 uid（`uid://` 迁移是独立决策，不属本 Mission）。

## Evidence of Completion

- 演示证据（fixture 级）：对当前项目 17 场景运行，全部 OK（与已核实基线一致，1.8s 级）；临时制造坏场景（复制一个场景并改坏 ext_resource path / sub_resource id 冲突 / node parent 缺失，用后删除），确认静态层与加载层都检出且分级正确。
- 报告证据：人读与 `--json` 输出样例记录；broken 场景的 Godot 错误原文透传。
- 边界演示：空目录（无场景）、无权限/不存在项目路径给出明确错误；大场景不崩溃。
- 回归证据：`gdeck doctor` 关键项全绿；`npm run godot:gdeck:verify:fast` 通过。
- 可还原证据：CLI 备份文件存在。
- 完成报告写入 `docs/gdeck-program/mission-reports/MB-GD3-scene-doctor.md`，记录未修改玩法代码、未改 allowWrites、未改任何 .tscn。

## Delegated Decisions and Unknowns

- 命令形态（`scene` 命令 + `doctor` action vs 独立 `scene-doctor`）、报告 schema 字段、静态层 warning 规则集由执行者决定，与既有输出风格一致。
- 静态层与加载层的关系（先静态后加载 vs 只加载）；是否缓存 `load_steps` 校验为 warning。
- 加载层 runner 的实现位置（CLI 工具树 `godot/` 下新增 vs 扩展 check runner）；超时与输出截断策略。
- 完成本 Mission 后，使用 `$mission-brief` 生成 MB-GD4 brief；不预生成后续 backlog。

## Autonomy and Approval Boundaries

- 授权：本地修改 CLI（先备份）、运行 gdeck/Godot 命令与测试、必要时经 `sync-addon` 同步项目 addon、在迁移分支创建本地提交、创建/更新本程序 brief 与报告。
- 需批准：下载或安装新组件、推送/PR/发布、修改总纲固定条款、将 `allowWrites`/`supplementaryEnabled` 改为 true、删除备份、破坏性 Git/文件操作。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
