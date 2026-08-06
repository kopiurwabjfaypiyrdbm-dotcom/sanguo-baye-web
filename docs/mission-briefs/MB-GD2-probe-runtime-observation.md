# Mission Brief: MB-GD2 probe 运行时只读观察

## Outcome

Agent 能在 Godot 游戏进程运行期间，通过白名单只读查询获取节点树、节点属性与信号连接，并能实时观察到运行期错误与日志流；全程无任意代码执行，查询结果与观察流可进入证据链。

## Context

- 程序总纲：`docs/mission-briefs/MB00-gdeck-agent-loop-program.md`；上一执行 Mission MB-GD1 已完成（`check --file` 秒级校验 + `verify --json` 失败摘要），报告在 `docs/gdeck-program/mission-reports/MB-GD1-cli-fast-feedback-layer.md`。
- CLI 位置：`D:\03_Godot\04_Tools\GodotFlightDeck-Cursor`（1.6.3-cursor.2，in-process 兼容模式）。
- 现状事实（已核实）：
  - `FlightDeckProbe`（`godot/addons/flight_deck/runtime_probe.gd`）是 autoload，**仅响应启动时 `--gdeck-*` 参数**（capture/report/scenario/seed/frames/benchmark），驱动 scenario runner 与性能采样，退出时写 report JSON 到磁盘；**没有**节点树/属性/信号查询能力，**没有**游戏内 push_error/push_warning 收集。
  - CLI 的 `runSync` 是阻塞式进程捕获（`gdeck.mjs` 的 `runProject` 直接 `runSync(godot, ['--path', project, ...])`），stdout/stderr 在进程结束后才可读；**没有**流式转发路径。
  - Godot 的 `print`/`push_error` 输出天然进入进程 stdout/stderr，CLI 侧可逐行解析标注；probe 侧有 `_bounded_diagnostic_value`（值边界化）可复用为查询结果的上限语义。
  - 既有安全基线：`command_requested` 信号与 `issue_command` 允许场景/适配器响应命令，但 probe 自身无任意调用能力；`allowWrites=false`。
  - 项目验证门禁 `npm run godot:gdeck:verify:fast` 与 `doctor` 当前全绿。

## Required Behaviors

- **查询（query）**：通过一个命令（如 `gdeck run --query <json>` 或 `gdeck probe query` 子命令，形态由执行者定）向运行中的游戏提交白名单只读查询清单，支持至少：按节点路径读属性、节点树（带深度限制）、信号连接列表、group 成员。结果写入 probe report 的 `queries` 字段并由 CLI 以人读与 `--json` 两种方式呈现。
- **只读约束**：查询只调用 `get`/遍历类只读 API，禁止 `set`、`call`、`eval`、场景修改；结果经边界化（数量/深度/字符串长度上限，复用 `_bounded_diagnostic_value` 语义）。
- **确定性**：查询结果绑定运行参数（seed、frames、启动场景）；随机行为通过 seed 复现，报告含 `seed`/`frames`/`toolVersion`/`schemaVersion`。
- **观察（watch）**：提供一个非阻塞流式命令（如 `gdeck probe watch` 或 `gdeck run --watch`），逐行转发游戏 stdout/stderr，`push_error` 行（`ERROR:`/`SCRIPT ERROR:`/`FATAL:` 模式）显式标注；超时或游戏退出后结束，退出码反映游戏失败（非 0 或错误模式匹配）。
- **证据**：查询结果与观察流均可作为独立证据文件引用（路径与内容可审计）；不改变既有 verify/report 发布路径。
- **回归**：`gdeck doctor` 全绿 + `npm run godot:gdeck:verify:fast` 通过；项目 addon 与 CLI 版本一致。

## Constraints

- 只改 Flight Deck CLI 与项目 addon（probe）；不修改游戏玩法代码（`godot/src/` 功能实现）。
- 不实现任意运行时代码执行（无 `eval`/`call_method` 等价物）；查询必须是只读白名单。
- 修改 CLI 文件前保留可还原备份；项目 addon 变更走 `sync-addon` 事务路径且 git 可回退。
- 不引入新组件/依赖下载；不 force push、不改 git config、不发布；`allowWrites`/`supplementaryEnabled` 保持 false。
- 观察通道只覆盖 gdeck 启动的桌面/headless 进程；不宣称覆盖 Android 真机运行时（属设备矩阵范畴）。

## Non-goals

- 不做运行时写操作、节点创建/删除、方法调用（属后续编辑能力评估，本 Mission 只读）。
- 不做交互式 REPL 或 TCP 常驻通道（保持启动参数 + 报告/流式输出的确定性模型）。
- 不收集游戏内部历史日志文件；只观察进程 stdout/stderr 流。
- 不做 scenario 能力扩展（拖拽/滚轮注入属 MB-GD5）。

## Evidence of Completion

- 演示证据（fixture 级）：用项目现有场景（如 `main_menu.tscn`）运行查询，`query` 输出与 `gdeck editor inspect/tree`（编辑器只读通道）对同一节点路径的结果一致；查询清单含属性/树/信号/group 四类。
- watch 演示：临时测试脚本在运行中触发 `push_error`（用后删除，不残留），watch 实时捕获并标注错误行；无错误运行不误报。
- 边界演示：超长字符串/深节点树被截断而非崩溃；非法查询（不存在路径、越界参数）给出明确错误。
- 回归证据：`gdeck doctor` 关键项全绿；`npm run godot:gdeck:verify:fast` 通过。
- 可还原证据：CLI 备份文件存在；addon 变更经 sync-addon 且 git 可回退。
- 完成报告写入 `docs/gdeck-program/mission-reports/MB-GD2-probe-runtime-observation.md`，记录未修改玩法代码、未改 allowWrites。

## Delegated Decisions and Unknowns

- 命令形态（`run --query` vs `probe query` 子命令；`run --watch` vs `probe watch`）、查询清单 JSON 协议、report `queries` 字段 schema 由执行者决定，与既有输出风格一致。
- 查询项上限、深度上限、字符串截断的默认值；是否复用 `runProfileGodot` 的隔离目录能力。
- watch 的流式实现（Node `spawn` 逐行解析 vs 其它），超时默认值与退出码映射。
- 完成本 Mission 后，使用 `$mission-brief` 生成 MB-GD3 brief；不预生成后续 backlog。

## Autonomy and Approval Boundaries

- 授权：本地修改 CLI（先备份）、运行 gdeck/Godot 命令与测试、必要时经 `sync-addon` 同步项目 addon、在迁移分支创建本地提交、创建/更新本程序 brief 与报告。
- 需批准：下载或安装新组件、推送/PR/发布、修改总纲固定条款、将 `allowWrites`/`supplementaryEnabled` 改为 true、删除备份、破坏性 Git/文件操作。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
