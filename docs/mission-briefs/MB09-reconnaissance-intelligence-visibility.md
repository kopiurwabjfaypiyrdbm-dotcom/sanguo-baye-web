# Mission Brief: 原生 Godot 侦察、情报快照与可见性边界

## Outcome

Godot 战略客户端拥有一条可实际操作、可保存恢复且与当前 TypeScript 产品确定性一致的侦察闭环：玩家从己方城市派出武将侦察非己方城市，支付当前规则身份规定的资源和行动成本，获得带观察时间的人物与城市情报快照；未侦察、已侦察和己方信息在原生地图及城池交互中清晰区分，旧快照不会泄露目标之后的实时变化。

## Context

- 仓库位于 `D:\00_Ai\Codex\sanguo-baye-web`。长期委托、自治恢复协议和 Mission 边界分别以 `docs/mission-briefs/MB00-godot-full-migration-program.md`、`docs/migration/godot-program-state.json`、`docs/migration/godot-program-roadmap.json` 为准；MB08 的直接前置证据见 `docs/migration/mission-reports/MB08-movement-transport-strategic-logistics.md`。
- 当前 Web 行为 oracle 是 `src/core/reconnaissance.ts`、`src/core/reconnaissance.test.ts`、`src/core/campaignNavigation.ts`、`src/core/validation.ts`、`src/core/rulesets.ts` 及相关 UI 测试。可见性产品边界见 `docs/design/mobile-campaign-navigation.md` 与 `docs/HANDOFF.md`。
- 经典成本的固定证据入口包括 `references/vendor/baye-c-core/src/baye/order.h`、`citycmd.c:ReconnoitreDrv`、`citycmdc.c:ReconnoitreMake` 和 `citycmdb.c` 的命令分派；`references/parity-matrix.md` 决定能声明的兼容等级。Web 的持久情报快照和可见性策略是现代产品语义，不能仅因成本或命令入口有 C 证据而提升为原设备一致。
- Godot 已有纯领域 `GameState`、事务式 command envelope、规则身份成本、canonical JSON/SHA-256、生产校验器、最小保存恢复、38 城原生地图与移动端空间城池菜单。侦察必须接入这些既有边界，而不是另建旁路状态或场景树规则。

## Required Behaviors

- 侦察只能在玩家阶段从己方城市发起；目标是非己方城市，执行者必须是驻扎在来源城的己方在职武将，未行动、未被其他活动命令占用，并满足当前 ruleset 的体力与金钱成本。候选结果和任何影响状态的集合具有明确、跨语言一致的稳定顺序。
- 成功侦察是单次原子事务：扣除来源城金钱与执行者体力、登记本月行动、写入目标城在当前 turn/year/month 的完整情报快照并追加可核对日志。当前 Web oracle 不为侦察抽取随机数，因此成功、拒绝、重复命令和保存恢复都不得改变 seed；任何拒绝不得提交部分状态。
- 快照固定执行时观察到的城市经济、后备兵、治理、防御、太守、在职人物 ID 集合、人数与总兵力。人物集合显式排序，汇总值与名单自洽；再次侦察同一城市会以新的合法观察覆盖旧快照。快照创建后，目标城市资源、驻将或归属变化不能反向改写旧报告。
- `intelReports` 成为 Godot 生产 runtime 状态的一部分，并由 shape 与关系校验完整约束。报告必须引用合法城市，记录键与 `cityId` 一致，观察 turn/calendar 不在未来，数值、可选字段、人物引用、重复项和字段集合满足跨客户端存档契约；损坏输入被明确拒绝而不污染会话。
- 可见性查询只向表现层提供玩家当下有权知道的信息：己方城显示实时状态；未侦察敌城只显示公开名称与当前公开归属；已侦察敌城显示保存的快照、观察年月和陈旧提示。已知人物目录可以使用报告中保存的人物身份与当时位置，但不得读取其之后的实时位置或属性来更新旧情报。
- 原生战略地图与贴近节点的城池交互提供清楚的“未知 / 已侦察快照 / 己方实时”视觉层级、侦察来源/目标/执行者选择、成本与禁用原因、执行反馈和观察时间。利用 Godot 原生绘制、Tween、Shader 或粒子表现一次轻量侦察扫描与节点反馈，同时保持信息语义不依赖颜色、动画完成或渲染帧率。
- 横屏触摸与鼠标交互在 1280×720、844×390 下可完成代表性侦察并查看报告，主要触控目标保持移动端可用，面板不遮挡关键状态且不会因打开敌城详情泄露实时资源或人物。

## Constraints

- 必须使用 Godot 4.7.1 official `a13da4feb` 与 GDScript。领域状态、侦察规则、可见性判定、排序、校验和保存恢复不挂在场景树中；Node/Control 只处理输入、表现和应用层调度。
- TypeScript 产品是本 Mission 的行为 oracle；相同 command、规则身份和输入状态必须由语言无关 fixture 对比 result、receipt、完整 canonical state SHA-256、成本、行动、日志与不变 seed。不得使用 Godot RNG、`Dictionary` 遍历顺序、渲染时钟或本地化排序影响结果。
- 保留现有 Web 产品及路径，`npm run check` 必须继续通过。Godot APK 不嵌入 TypeScript、JavaScript、WebView、JSBridge 或浏览器运行时。
- `references/vendor/baye-c-core/` 只读且不进入构建；不得导入或提交受限原版数据、图片、字体、音频、视频、WASM、`.reference/` 内容或许可证不明素材。合法资产继续保留来源记录。
- 不直接提交到 `main`，不推送、不创建 PR、不发布 APK/AAB。可以在当前迁移分支创建可回退的本地阶段提交。

## Non-goals

- 外交谋略命令及其情报目标锁定属于 MB10；月度情报刷新或战略 AI 使用情报属于 MB12。
- 完整全局导航器、生产多槽存档和存档 schema 迁移分别留给 MB21 与 MB20；本 Mission 只保证当前生产 GameState 中的情报可验证保存恢复。
- 战场侦察、战争迷雾、逐单位视野、正式美术与全量动画不在本委托范围。

## Evidence of Completion

- 语言无关 fixture 覆盖经典与现代成本、成功快照、覆盖旧报告、稳定人物名单、无 RNG、所有主要拒绝和失败原子性；TypeScript 与 Godot 对 command result、receipt、日志、完整 state 与 canonical SHA-256 一致。
- Godot 领域、应用、表现和输入测试从独立角度证明快照不可变、保存载入等价、损坏报告拒绝、未侦察无泄漏、旧报告不追踪实时变化、触控选择与反馈。指定 Godot 4.7.1 可无错误导入并从现有主场景运行，Web `npm run check` 通过。
- Android Debug APK 由指定引擎重新导出，包内容不含 Web runtime、测试 fixture 或受限素材；在 MuMu 至少覆盖安装并离线启动，1280×720 与 844×390 均实际验证侦察入口、执行反馈、报告查看和未知信息遮蔽，日志无脚本错误或致命异常。模拟器证据不表述为真机证据。
- 完成报告 `docs/migration/mission-reports/MB09-reconnaissance-intelligence-visibility.md` 记录规则身份、fixture 与 SHA 证据、保存恢复、设备结果、可见性边界、包审计、已知风险和人工验收步骤；`references/parity-matrix.md` 保留 C 证据与现代快照语义的等级差异。
- 实施完成后进行自检，并派发三路只读审查：Godot 架构与场景树、确定性规则与 fixture、Android/触控与信息可见性。修复 P0、P1 和本 Mission 引入的 P2 后才可关闭 MB09。

## Delegated Decisions and Unknowns

- 自主决定领域模块、adapter/query、面板和视觉反馈的具体组织，以复用现有 GameSession、城池空间卡片和 presentation 测试基架、保持小屏可读及杜绝信息泄露为原则。
- 自主调查并固定 Web validator 对 `intelReports` 的完整实际契约；若发现 Web 接受的旧式可选字段与 Godot closed-shape 原则冲突，应通过共享 fixture 和明确迁移边界解决，不得静默缩窄合法产品状态。
- 原版侦察展示细节、持久期限和人物名单语义缺乏足够设备证据时，继续标记 provisional 或现代产品语义；本 Mission 不为追求“更像原版”而偏离当前可运行 oracle。

## Autonomy and Approval Boundaries

- 已授权在当前迁移分支内调查和修改仓库文件、运行测试与构建、生成被忽略的本地产物、使用已安装工具、在已连接 MuMu/测试设备安装调试包，以及创建阶段性本地提交。
- 下载或安装组件、使用新外部服务或凭据、破坏性 Git/文件操作、修改长期委托固定条款、素材许可决定、推送、PR、发布、签名或其他外部写入需要用户确认。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
