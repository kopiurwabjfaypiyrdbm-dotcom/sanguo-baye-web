# Mission Brief: 《三国霸业》完整迁移为 Godot 原生客户端

## Outcome

在保留现有 Web 产品作为可运行产品、规则 oracle 和回退基线的同时，《三国霸业》拥有以 Godot 4.7.1 和 GDScript 独立实现的完整原生客户端。四个时期均可在 Android 手机横屏和 Windows 上从开局持续游玩至明确结局，战略、战术、AI、事件、人物生命周期、存档和客户端流程功能完整；相同规则输入与 seed 具有可重复、可审计的跨客户端结果。Godot 客户端不依赖浏览器、WebView、TypeScript 或 JavaScript 运行时，并具备形成发布候选的工程、设备、许可与测试证据。

## Context

- 仓库为 `D:\00_Ai\Codex\sanguo-baye-web`。项目约束与规则证据入口见 `AGENTS.md`、`README.md`、`docs/HANDOFF.md`、`references/parity-matrix.md`、`references/provenance/`、`src/core/`、`src/compat/baye/`、`src/data/` 和 `src/game/`。
- `docs/mission-briefs/godot-migration-spike.md` 定义的首个技术样片已经完成；结果与风险见 `docs/migration/godot-spike-report.md`。当前 Godot 工程位于顶层 `godot/`，已验证时期 1 的 38 城地图、确定性开垦 fixture、最小存档、Godot 4.7.1 Android Debug 导出及 MuMu 横屏运行。
- 正式迁移语言已确定为 GDScript，当前不考虑 C#。第一优先平台是 Android 手机横屏全屏，Windows 是次要正式平台；Godot Web 不是目标。
- 完整迁移是一个有限、可验证的长期项目。后续工作由仓库内路线图、机器可读状态账本和即时生成的单项 Mission Brief 驱动；对话记忆或上下文摘要不得成为唯一进度来源。

## Required Behaviors

- 四个时期的数据、开局选择、战略地图、全部产品规则、战术战斗、战略与战术 AI、月度和年度推进、事件、人物生命周期、外交、情报、胜负结局及战后回接形成完整可玩闭环。
- Godot 领域状态、规则、确定性随机数、校验、命令和存档模型独立于场景树；场景与节点只承担输入、表现和应用层调度。模拟结果不依赖渲染帧率、物理帧、动画时长、`Dictionary` 遍历顺序或 Godot 默认随机数。
- 每个迁移规则切片都以当前 TypeScript 产品为 oracle，通过语言无关 fixture、显式 seed、canonical state 或等价稳定证据验证；原版兼容结论继续按 `references/parity-matrix.md` 的证据等级管理，不把现代临时行为误称为原版一致。
- 正式客户端具备可演进的存档、多槽位、自动保存、原子替换、损坏恢复和版本迁移；保存、载入与确定性重放不会改变权威结果。是否提供 Web 存档导入由证据和产品边界决定，但 Godot 存档不得伪装成 Web envelope。
- Android 与 Windows 上的完整客户端流程、触摸与鼠标键盘输入、安全区、返回/暂停、休眠恢复、性能和长时稳定性具有可重复验证；Android APK 离线启动且不包含 Web 运行时。
- 长期推进始终可以从仓库状态恢复：执行者先读取本简报、程序状态账本、当前 Mission Brief、最近完成报告、Git 状态和规定证据，再决定动作。完成一个 Mission 后，执行者更新证据与账本、创建本地提交、使用 `$mission-brief` 只生成下一份自包含简报，并在后续执行步骤中继续，不能把单个 Mission 完成误判为本委托完成。
- 本简报的 Outcome、Constraints、Non-goals 和最终完成证据不得由执行者自行放宽、删除或替换；路线、拆分数量与实现可以随证据调整，但任何总目标变更必须由用户明确批准并留下决策记录。

## Constraints

- 必须使用 Godot 4.7.1 和 GDScript；不得引入 C#、WebView、JSBridge、嵌入式 TypeScript/JavaScript 或浏览器运行时作为 Godot 客户端实现。
- 保留现有 Web 客户端、文件路径、测试和构建能力，直至用户另行决定；不得为了简化迁移而删除、搬迁或降低 Web oracle 覆盖。
- `references/vendor/baye-c-core/` 只作为只读规则证据，不成为应用构建依赖；不得复制许可证不兼容实现。
- 不导入或提交 `dat.lib.orig`、`.lib`、原版或来源不明图片、字体、音频、视频、WASM、生成的嵌入资源数组、`.reference/` 内容或许可证不明素材。合法复用必须保留来源记录。
- 不直接提交到 `main`，不推送、不创建 PR、不发布 APK/AAB，除非用户以后明确授权。长期工作可以在迁移分支创建可回退的阶段性本地提交。
- 不得通过跳过失败测试、删除验收证据、弱化校验、改写 fixture 期望以迎合错误实现，或把模拟器结果表述为实体设备结果来取得表面完成。

## Non-goals

- 逐像素复制旧 Web UI、把网页嵌入 Godot、Godot Web 导出，或在没有独立许可和用户授权的情况下发布游戏或受限内容。
- 在缺乏原版证据时承诺所有现代规则与 BBK 设备逐结果一致；此类未知继续以 provisional、差异验证或有意变化记录。

## Evidence of Completion

- 四个时期均有从开局到胜负结局的人工可玩证据和确定性自动 soak；战略与战术 parity matrix 的目标范围完成，所有保留差异具有明确证据和产品决策。
- TypeScript oracle、Godot 领域测试、fixture/replay、存档迁移与恢复、非法状态拒绝、长战役和批量战斗测试共同证明规则完整性；现有 Web `npm run check` 持续通过。
- Godot 4.7.1 可无错误导入并从主场景运行；Android 和 Windows 构建、安装、启动、输入、暂停/恢复、升级和长时稳定性通过规定设备矩阵，且包内容与权限审查无 Web 运行时或受限素材。
- 正式存档覆盖槽位、自动保存、原子写入、损坏恢复和所有已发布 schema 的升级测试；同一命令序列在连续执行、重放及存档恢复后得到相同 canonical state。
- 每个 Mission 有可追溯简报、完成报告、本地提交和验证记录；最终由架构、确定性、战略规则、战术规则、存档、移动端体验、许可来源与发布工程等独立只读视角审查，所有 P0、P1 和迁移引入的 P2 清零。
- 形成完整迁移报告和发布候选判断，明确仍保留的产品差异、实体设备覆盖、许可状态与人工验收步骤；只有上述证据全部成立才能结束长期 Goal。

## Delegated Decisions and Unknowns

- 在不改变 Outcome 和 Constraints 的前提下，自主维护动态路线图、依赖关系、Mission 数量、纵向切片边界、内部架构和测试工具。以一个新执行者能够独立交付并验证单一结果为拆分原则，预计总量可随证据在约 22–28 份 Mission 间调整。
- 自主选择下一个无阻塞且最能降低全局风险的 Mission；优先建立可复用的确定性验证和状态恢复能力，再扩大规则广度。遇到非关键阻塞时可记录并推进另一项已满足依赖的 Mission，不得静默绕过约束。
- 结构化时期数据再分发、未知原版行为、实体设备差异和未来 Web 存档导入属于需要证据收敛的风险。可以完成内部实现和审计，但不得代替用户作出许可、发布或重大产品取舍。

## Autonomy and Approval Boundaries

- 已授权在当前迁移分支内进行只读调查、创建和修改完整迁移所需的仓库文件、运行测试与构建、生成被忽略的本地产物、使用已安装工具、在已连接模拟器/测试设备上安装调试包，以及创建阶段性本地提交。
- 已授权在每个 Mission 证据闭环后更新程序账本、生成下一份 Mission Brief 并继续执行，无需为正常本地实现、测试失败修复或可逆重构逐次确认。
- 下载/安装组件、使用新外部服务或凭据、破坏性 Git/文件操作、修改本简报固定条款、数据与素材许可决定、推送、PR、发布、签名身份、商店配置及其他外部写入必须请求用户批准。
- 只有最终证据全部满足，或所有安全可执行 Mission 都被同一个需要用户决定或外部状态变化的条件阻塞时，才可以停止长期推进并交还用户。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
