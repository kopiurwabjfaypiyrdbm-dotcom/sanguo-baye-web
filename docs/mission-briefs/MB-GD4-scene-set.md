# Mission Brief: MB-GD4 headless 场景结构化编辑（scene set）

## Outcome

Agent 无需打开 Godot 编辑器即可对 `.tscn` 做结构化修改（节点属性设置，含 JSON 类型化值），每次写操作前自动快照、失败可回滚，默认 dry-run 预览、`--apply` 才落盘；`scene doctor` 可作为修改后的完整性门禁。

## Context

- 程序总纲：`docs/mission-briefs/MB00-gdeck-agent-loop-program.md`；MB-GD1（check --file / verify --json）、MB-GD2（probe query / watch）、MB-GD3（scene doctor）已完成，报告在 `docs/gdeck-program/mission-reports/`。
- CLI 位置：`D:\03_Godot\04_Tools\GodotFlightDeck-Cursor`（1.6.3-cursor.2，in-process 兼容模式）。
- 现状事实（已核实）：
  - `scene_scan_runner.gd`（MB-GD3）已提供 headless 加载全部场景的权威校验通道；`scene doctor` 可作编辑后门禁。
  - **技术路线已实测可行**：headless `load() → instantiate() → set() → PackedScene.pack() → ResourceSaver.save()` 全链路可写 .tscn（临时副本验证 EDIT_OK）。
  - **三个已验证的陷阱**（实测证据）：
    1. 值必须 JSON 类型化传递——字符串 `"false"` 经 `set()` 被转换为 `true`（非空字符串为真）；CLI 侧须解析 JSON 并按目标属性类型传值。
    2. `instantiate()` 的节点必须 `free()`，否则退出报 "resources still in use at exit"。
    3. `ResourceSaver.save()` 会**规范化重写**整个 .tscn（Godot 保存风格，可能重排属性/补 unique_id）；这是结构化编辑的固有语义，需在报告与文档中声明，不视为损坏。
  - 安全基线：`allowWrites=false` 属 Editor Bridge 策略，与 headless 文件写通道无关；本项目无"headless 项目写"先例，需为本 Mission 建立门控（建议：默认 dry-run 预览、`--apply` 才写，与 bridge destructive 的 `--apply` 哲学一致）。
  - 项目验证门禁 `npm run godot:gdeck:verify:fast` 与 `doctor` 当前全绿；`scene doctor` 基线 0 broken / 1 warning（main_menu load_steps 已知偏差）。

## Required Behaviors

- **命令形态**：`gdeck scene set <scene> <node-path> <property> <json-value> [--apply]`（或等价形态，由执行者定；挂在既有 `scene` 命令的 actions 上，与 `doctor` 平级）。
- **默认 dry-run**：不落盘时输出"将要写入的 diff 预览"（目标节点/属性/旧值/新值 + 保存将重写整个文件的提示）；`--apply` 才真正写文件。
- **JSON 类型化**：值从 JSON 解析（bool/number/string/Color/Vector 等基本类型），禁止把字符串强转；目标属性存在性检查（复用 MB-GD2/MB-GD3 的 `get_property_list()` 经验，无 `has_property`）。
- **快照与回滚**：每次 `--apply` 前把目标 .tscn 复制为时间戳快照（`.gdeck/snapshots/`）；保存失败或后续 `scene doctor` 检出 broken 时，打印恢复指引并保留快照；提供 `scene restore <snapshot-path>`（或等价）恢复命令。
- **编辑后门禁**：`--apply` 成功后自动运行 `scene doctor`（或提示运行）确认该场景不再 broken；doctor 基线中的既有 warning（main_menu load_steps）不作为失败。
- **只写目标场景**：不触碰其他文件；场景内节点仅做属性 set（本次范围），节点创建/删除/重排不入范围。
- **回归**：`gdeck doctor` 全绿 + `npm run godot:gdeck:verify:fast` 通过；项目 addon 与 CLI 版本一致。

## Constraints

- 只改 Flight Deck CLI 与项目 addon（如需）；不修改游戏玩法代码。
- 默认不落盘：任何写都必须显式 `--apply`；快照不得删除（除非用户批准）；不自动修改 `allowWrites`/`supplementaryEnabled`。
- 修改 CLI 文件前保留可还原备份；不引入新组件/依赖；不 force push、不改 git config、不发布。
- 演示与验证**只针对副本场景**（`.gdeck/` 或临时副本），不修改仓库内任何真实 .tscn；真实场景写入仅限用户明确要求且批准的场景。
- 保存的规范化重写（unique_id、属性重排）属于预期行为，不得把该差异当作错误回滚。

## Non-goals

- 不做节点创建/删除/重排序/信号接线（若后续需要，单独评估）。
- 不做资源（.tres）编辑、不做实例化子场景的参数覆盖。
- 不做 Editor Bridge 写通道扩展（allowWrites 维持 false）。
- 不修改或迁移 uid。
- 不做批量编辑 DSL（一次一个属性/一个场景）。

## Evidence of Completion

- 演示证据（fixture 级，全部在副本场景上）：`scene set` 修改副本场景的 bool/string/number 属性，`--apply` 后重新 `load()` 验证值类型正确（尤其 bool false 不被字符串化）；dry-run 不产生文件变化（mtime/hash 对比）。
- 快照/回滚演示：对副本场景 apply 后故意制造坏值（如把 `visible` 设成非法类型）触发失败路径，确认快照存在且可恢复（restore 后与原始 hash 一致）。
- 门禁演示：apply 一个会 broken 的修改（如 ext_resource path 破坏不在本 Mission 能力内，可用"属性值非法导致 doctor 报错"等效场景），确认 doctor 拦截与恢复指引。
- 回归证据：`gdeck doctor` 关键项全绿；`npm run godot:gdeck:verify:fast` 通过；`scene doctor` 基线不变（0 broken / 1 warning）。
- 可还原证据：CLI 备份文件存在；快照目录结构与内容可列出。
- 完成报告写入 `docs/gdeck-program/mission-reports/MB-GD4-scene-set.md`，记录未修改任何真实 .tscn、未改 allowWrites。

## Delegated Decisions and Unknowns

- 命令形态细节（`scene set` vs `scene edit`、node-path 语法）、快照目录命名、`scene restore` 形态由执行者决定，与既有输出风格一致。
- 属性值支持的类型集合（bool/number/string/Color/Vector2 等）与 JSON 表示映射；未知类型报错还是透传。
- 编辑 runner 的实现位置（新增 `godot/scene_edit_runner.gd` vs 扩展 scene_scan_runner）；保存前是否自动 `free()` 实例。
- 是否把"编辑后自动 doctor"做成 `--verify` 开关（默认开）由执行者决定。
- 完成本 Mission 后，使用 `$mission-brief` 生成 MB-GD5 brief；不预生成后续 backlog。

## Autonomy and Approval Boundaries

- 授权：本地修改 CLI（先备份）、运行 gdeck/Godot 命令与测试、在副本/临时场景上做编辑演示、必要时经 `sync-addon` 同步项目 addon、在迁移分支创建本地提交、创建/更新本程序 brief 与报告。
- 需批准：对仓库内真实 .tscn 执行 `--apply`、下载或安装新组件、推送/PR/发布、修改总纲固定条款、将 `allowWrites`/`supplementaryEnabled` 改为 true、删除快照/备份、破坏性 Git/文件操作。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
