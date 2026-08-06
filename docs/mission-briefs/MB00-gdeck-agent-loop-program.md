# Mission Brief: gdeck Agent 感知闭环程序（总纲）

## Outcome

本机 Godot Flight Deck Cursor fork（CLI 与项目 addon）成为 Agent 的"感知闭环"工具：Agent 能以秒级反馈验证文件修改、以白名单只读通道观察运行中的游戏、以安全门控的结构化方式编辑场景、以可复现断言覆盖交互路径；全部新能力保持现有确定性证据链，不引入任意代码执行。

## Context

- 工具位置：CLI 在 `D:\03_Godot\04_Tools\GodotFlightDeck-Cursor`（当前 1.6.3-cursor.2，in-process 兼容模式）；项目 addon 在 `godot/addons/flight_deck/`（经 `gdeck sync-addon` 同步，git 可追踪）。本项目 Godot 工程根为 `godot/`。
- 现状能力：`doctor`/`check`/`unit`/`verify`/`evidence-index`、Editor Bridge 四层门控（core-read → core-write → supplementary → destructive+`--apply`）、`scenario`（probe 内脚本断言）、`capture`/`benchmark`/`visual-test`、`FlightDeckProbe` 运行时 autoload。
- 痛点证据：MB27 人工验收失败——静态验证全绿但运行时触控真相缺失；Agent 验证反馈环约 6 秒且无运行时观察通道；`.tscn` 文本编辑易静默破坏（缩进/类型/uid 引用）；版本漂移曾导致 addon 与 CLI 指纹失配。
- 参考对比：godot-mcp（157 tools）证明"运行时调试"对 Agent 有价值，但其 `game_eval`/任意文件 I/O 安全面与本仓库"可审计、确定性"纪律冲突；本程序以白名单只读查询 + 门控结构化编辑替代。
- 与既有委托的关系：与 MB00（Godot 完整迁移程序）**独立并行**；本程序不改变 MB00 Goal 状态，不把工具链改进写成 MB00 的完成证据；不依赖 MB28 是否结束。

## Required Behaviors

- 修改单个 `.gd` 后可在秒级获得语法/类型反馈（增量校验），全量 `check` 仍保持可用。
- 运行中的游戏可通过白名单只读命令查询节点树、节点属性、信号连接，并拉取运行期错误与日志；命令集内**无任意代码执行**；查询结果可进入证据链。
- 场景可通过结构化命令修改并支持回滚；修改前能对场景做完整性体检（ext_resource/uid/脚本引用），静默破坏在写操作前被检出。
- scenario 支持拖拽/滚轮输入注入，代表性交互场景可通过一个 verify profile 一键回归。
- 每个执行 Mission 结束时：`doctor` 全绿（含 Addon version match）、`verify:fast` 通过、CLI 与项目 addon 版本一致。

## Constraints

- 只使用 Godot 4.7.1 + GDScript；不引入 WebView、JavaScript、C#。
- 不实现任意运行时代码执行（无 `game_eval` 等价物）；运行时命令必须是只读白名单或受门控的写。
- 不削弱现有命令契约与证据链（result envelope、SHA-256、evidence-index）；不更新 visual baseline。
- 不修改游戏玩法代码（`godot/src/domain/`、`godot/src/presentation/` 下的功能实现）；只改 Flight Deck CLI 与项目 addon。
- 修改 CLI 文件前必须保留可还原备份；项目 addon 变更必须走 `sync-addon` 事务路径，且 git 可回退。
- 不 force push、不改 git config、不发布 APK/AAB；`allowWrites`/`supplementaryEnabled` 保持 false，除非用户另行批准。
- 本程序与 MB00 相互独立：任何一处不得声称完成另一处。

## Non-goals

- 不做 godot-mcp 式任意运行时执行与全文件 I/O 工具面。
- 不做 C#/.NET、网络/multiplayer、输入映射编辑器类工具。
- 不解决 MB28 的具体触控缺陷——本程序只提供工具能力，验收结论归 MB28 自己。
- 性能门禁（benchmark 进 verify）暂缓，除非出现真实性能需求。
- 不做 UI 美化、文档站点或版本发布流程。

## Evidence of Completion

- 每个执行 Mission 有可追溯 brief、完成报告与本地提交；CLI 变更以备份 + 版本号可还原，项目 addon 变更以 git 可回退。
- 每个新命令有 fixture 级演示证据：如 `probe query` 在运行中的演示场景返回真实节点数据；`scene set` 修改副本场景后 `scene doctor` 通过；`check --file` 对坏文件报错、对好文件秒级通过。
- 每个执行 Mission 结束时 `doctor` 全绿 + `verify:fast` 通过。
- 程序收尾：用户在代表性场景中确认"改-验-观-编-断"闭环成立（人工短确认，不要求逐项演示）。

## Delegated Decisions and Unknowns

- 命令命名、参数形态、probe 协议扩展细节、mission 拆分数量（6 个执行 Mission 可随证据合并/拆分，总量变化不属违约）。
- 增量校验的技术路线（headless `--check-only`、EditorScript 或其它）由执行者从证据决定。
- scenario 代表性场景的选择、profile 命名、verify profile 结构。
- 每个执行 Mission 完成后，使用 `$mission-brief` 生成下一份自包含 brief；不预生成剩余 backlog。

## Autonomy and Approval Boundaries

- 授权：本地修改 CLI（先备份）、运行 gdeck 命令与 Godot 测试、经 `sync-addon` 更新项目 addon、在迁移分支创建本地提交、创建/更新本程序的 brief 与报告。
- 需批准：下载或安装新组件、推送/PR/发布、修改 MB00 或本总纲固定条款、将 `allowWrites`/`supplementaryEnabled` 改为 true、删除备份、破坏性 Git/文件操作。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
