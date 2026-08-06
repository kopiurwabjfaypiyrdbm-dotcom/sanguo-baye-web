# Mission Brief: Godot 原生内政命令形成完整确定性经济切片

## Outcome

Godot 客户端的生产 `GameSession` 能在原生战略地图与空间城池菜单中完成当前 Web 产品的完整内政命令组：开垦、招商、治理、出巡、交易、宴请和掠夺。每项命令均通过应用事务边界执行并产生与 TypeScript oracle 相同的资源、人物、行动标记、日志、seed 和 canonical state 结果；玩家可以仅凭 Godot UI 查看稳定可用性、填写必要参数、确认危险行为并理解执行结果，而 presentation 不持有或重写规则。

## Context

- 长期章程、路线图与权威账本位于 `docs/mission-briefs/MB00-godot-full-migration-program.md`、`docs/migration/godot-program-roadmap.json` 和 `docs/migration/godot-program-state.json`。MB04 的生产会话、事务协议、审查结论与 Android 证据见 `docs/mission-briefs/MB04-production-application-game-session.md`、`docs/migration/godot-application-session-contract.md` 和 `docs/migration/mission-reports/MB04-production-application-game-session.md`。
- Web 规则事实入口是 `src/core/cityCommands.ts`、`src/core/rulesets.ts`、`src/core/equipment.ts`、`src/core/validation.ts` 与 `src/ui/cityCommandCatalog.ts`；`src/core/cityCommands.test.ts` 是既有产品证据。原版线索以 `references/vendor/baye-c-core/src/citycmd.c`、`citycmdb.c`、`baye/order.h` 和 `references/parity-matrix.md` 为准，只读且不进入构建。
- MB04 已建立纯 GDScript 领域命令、显式 adapter 注册表、版本化 command/result envelope、稳定 query 边界、13 路 TypeScript/Godot fixture 和 256 条有序幂等窗口。主场景当前只开放真实开垦；生产保存仍明确禁用至 MB20。

## Required Behaviors

- 开垦、招商、治理、出巡、交易、宴请和掠夺覆盖 Web 产品现有的成功效果、成本、上限、规则集身份、有效属性、行动消耗、日志及所有安全拒绝。命令拒绝不能消耗 seed、资源、体力、行动名额或写日志。
- 需要随机数的内政命令严格复用当前显式 RNG 算法和调用次数；不需要随机数的命令不得推进 seed。命令执行顺序、执行者/目标候选顺序、参数错误和查询结果均不依赖 `Dictionary` 遍历顺序。
- 每项命令注册到 MB04 的统一事务入口并使用闭合、版本化参数契约。未知字段、错误类型、非有限数、非安全整数、Unicode 空白标识、陈旧摘要、重复提交和 command ID 冲突继续稳定拒绝或按既定幂等语义返回。
- 应用查询成为 UI 获取城池内政命令目录、可用性、原因、稳定默认值和候选人的唯一规则边界。查询只返回表现所需的深拷贝 DTO，不改变状态，也不让场景直接调用领域命令。
- 原生空间城池菜单能在鼠标与触摸下访问全部内政命令。快速命令保持轻量；交易可输入方向与安全数量，宴请可选择合法目标，掠夺必须有明确危险确认。成功、拒绝和资源变化在 1280×720 与 844×390 横屏均可读且不遮断地图基本导航。
- 扩展 MB02/MB04 的语言无关 fixture，而不是建立第二套摘要或 runner。代表性序列必须同时挑战随机命令、无随机命令、参数化交易、目标人物、危险命令、上限/资源不足、已行动人物、失败后继续、重复/陈旧事务和跨命令顺序；TypeScript 与 Godot 对完整结果和最终状态一致。
- 更新规则/应用契约说明、parity matrix、Mission report 和程序账本。完成前进行架构/场景树、确定性/fixture、Android/触控三路只读审查，并清零 P0、P1 和本阶段引入的 P2。

## Constraints

- 固定使用 Godot 4.7.1 与 GDScript。`GameState`、规则、命令、校验、RNG 和应用事务保持在场景树外；Node/Control 只负责输入、表现和调度。
- TypeScript 产品是本 Mission 的行为 oracle；原版兼容等级只能由可追溯 C 证据或可重复原设备/fixture 比较提升。不得为通过对照而弱化校验或改写预期迎合错误实现。
- 保留 MB01–MB04 证据、现有 Web 产品与 `npm run check`。不得嵌入 JavaScript/TypeScript、WebView、JSBridge、浏览器或网络依赖；vendor C 继续只读。
- 不导入受限原版或来源不明素材、`.reference/`、WASM 或构建产物；不推送、不创建 PR、不发布 APK/AAB。

## Non-goals

- 月度/季度/年度经济结算、灾害发生、体力自然恢复和日历推进；这些属于 MB11。
- 搜寻、登用、奖赏、任命、装备、俘虏、流放、征兵、调兵、移动、输送、侦察、外交、出征、AI 或战术规则。
- 生产存档、多槽位、Web 存档导入、正式主菜单或最终战略 UI 重制。

## Evidence of Completion

- TypeScript oracle 与 Godot 4.7.1 对共享内政序列的每个 result envelope、receipt、seed、资源、人物、行动列表、日志、before/after SHA-256 和最终 canonical state 完全一致；负向与幂等路径证明状态不被意外提交。
- Godot 领域/应用测试覆盖七项内政命令的边界、上限、数值安全、规则集成本、有效人物属性、稳定候选顺序和事务原子性；历史 MB01–MB04 fixture/replay、四时期数据验证、恢复演练与统一工程验证持续通过。
- 原生主场景在 1280×720 与 844×390 下通过鼠标/触摸完成各类内政交互，空间菜单、参数输入、危险确认、结果反馈、拖动与缩放不互相破坏；精确 Godot 4.7.1 Android Debug APK 可离线安装启动且无 Web 运行时或新增权限。
- `npm run check`、Godot editor import、主场景启动、包内容/来源扫描通过。三路最终只读审查的 P0/P1/本阶段 P2 均为零。

## Delegated Decisions and Unknowns

- 自主决定七项规则的文件拆分、共享内政基类/工具、adapter 数量、查询 DTO、fixture 分片和 UI 控件结构；优先保持每项命令可独立验证、后续 AI 可复用同一应用/领域边界。
- 自主从 Web 测试与固定 C 证据判断哪些行为是已取样、现代产品规则或有意安全限制，并据实更新 parity matrix；证据不足时保持现有等级和 provisional 表述。
- 自主选择最小但有辨别力的跨命令序列与 Android 人工路径。若现有 Web 行为本身存在矛盾，先用回归测试固定事实并记录差异，不擅自改变产品语义。

## Autonomy and Approval Boundaries

- 已授权在当前迁移分支修改 Godot 领域内政规则、application adapters/queries、战略地图内政 UI、TypeScript oracle 适配、共享 fixture、测试和文档，运行 Godot 4.7.1/Web 检查、生成被忽略的本地产物、在已连接 MuMu 上安装调试包并创建本地检查点提交。
- 可自主进行可逆重构、增加无外部依赖的验证工具，并按证据修复本 Mission 内问题。
- 下载/安装、新依赖或外部服务、许可决定、删除历史证据、修改 MB00 固定条款、扩大到 Non-goals、破坏性操作、推送/PR/发布或其他外部写入必须请求用户批准。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
