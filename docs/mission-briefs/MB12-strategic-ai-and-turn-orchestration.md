# Mission Brief: 原生 Godot 战略 AI 与完整月循环

## Outcome

Godot 战略客户端能够在四个时期的生产数据上运行一条完整、可保存且确定性的战略月循环：玩家阶段结束后，非玩家势力按稳定顺序完成可验证的战略决策与命令结算，月历推进依次执行既有事件、年度、人物生命周期、在途战略/外交命令和战役结局阶段，最终回到玩家阶段并提供可审计的月度摘要。相同输入、显式 seed 和命令在 TypeScript Web oracle、Godot、连续运行与恢复后得到相同结果。

## Context

- 仓库为 `D:\00_Ai\Codex\sanguo-baye-web`，长期委托和自治账本分别以 `docs/mission-briefs/MB00-godot-full-migration-program.md`、`docs/migration/godot-program-roadmap.json`、`docs/migration/godot-program-state.json` 为准；MB11 完成报告是 `docs/migration/mission-reports/MB11-calendar-events-lifecycle-succession-outcomes.md`。
- 当前 Web 行为 oracle 入口包括 `src/core/ai.ts`、`src/core/gameLoop.ts`、`src/core/turn.ts`、`src/core/playableLoop.ts`、`src/core/monthReview.ts`、`src/core/cityEvents.ts`、`src/core/annualProgression.ts`、`src/core/officerLifecycle.ts`、`src/core/outcome.ts` 及其测试。既有 Godot 领域已经具备四时期生产数据、GameSession、城市/人物/后勤/侦察/外交命令、月历事件、年度阶段、生命周期、继承和结局边界。
- MB12 的目标是把这些边界编排成一个真实可运行的战略循环，并为后续战术迁移提供稳定的战略入口；TypeScript 产品继续作为规则 oracle，不把 Web 运行时、JSBridge 或浏览器嵌入 Godot。

## Required Behaviors

- 月循环明确区分 `player`、AI/非玩家势力处理、月度结算和 `ended`/`succession` 暂停；状态在每个阶段之间均通过 GameState、事务命令和生产 validator，不能依赖场景树或隐式全局变量。
- AI 的势力、城市、人物和命令遍历均使用显式稳定排序；AI 选择、成本、有效性、随机判定和命令序号在相同 seed 下可重放。AI 能调用已经移植的内政、任命/人才、跨城调动/运输、侦察和外交命令，并在资源不足、目标失效、失地、无继承人或战役结束时原子失败或安全跳过。
- 玩家结束回合后，战略命令按固定阶段顺序推进：在途移动/运输与外交回报、城市事件、年度人物/道具阶段、生命周期、继承检查、胜负检查和月历/turn 更新。每个阶段明确是否消耗 RNG、是否改变月份和可见日志；`succession` 与 `ended` 均冻结不允许的月推进。
- 结算顺序不依赖 Dictionary 遍历顺序；城市、势力、人物、订单、日志和摘要的顺序与 Web oracle 对齐。任何跨势力归属、太守、俘虏、装备、运输 escrow、执行者回城和外交目标变化都保持 validator 合法。
- 月循环应用边界支持单次事务、确定性 receipt、前后 canonical state SHA-256、精确 seed 和可恢复快照；保存后继续执行的下一步与未保存连续执行完全一致，重复命令保持既有幂等契约。
- 原生战略界面提供“结束玩家阶段/推进月份”、当前阶段、AI/月份摘要、事件和订单反馈；长日志、继承暂停和结局状态在 1280×720、844×390 横屏触控/鼠标下不遮挡关键操作，展示层不显示情报之外的敌方实时字段。
- 共享语言无关 fixture 至少覆盖四时期、玩家无操作月、含活动订单的 AI 月、AI 命令成功/拒绝、资源不足、目标失效、继承暂停、结局终止、RNG 不消耗路径、重复执行和保存恢复；TS/Godot 比较完整结果、receipt、日志、状态 SHA 和 seed。

## Constraints

- 必须使用 Godot 4.7.1 official `a13da4feb` 与 GDScript。核心 GameState、AI、月循环、随机数、排序、校验和保存恢复不挂在 Node/Control；场景只负责输入、表现和应用层调度。
- TypeScript 当前行为、既有 ruleset、确定性 LCG、canonical JSON/SHA-256、生产数据和 MB01–MB11 契约是兼容边界。不得使用 Godot 默认随机数、依赖 Dictionary 顺序或通过改变 oracle 来使 fixture 通过。
- 保留 Web 项目可运行性和现有文件路径；`npm run check` 必须继续通过。不得导入或提交原版受限数据/素材、`.reference/` 内容、WASM、字体、音频、视频或许可证不明文件。
- 不直接提交 `main`，不推送、不创建 PR、不发布 APK/AAB；允许当前迁移分支内的本地修改、验证和阶段性提交。MB12 不承担战术战场迁移、完整生产存档 schema 或正式客户端美术。

## Non-goals

- 不迁移战术战场、战斗 AI、地形移动或战斗结算；这些属于 MB13–MB19。
- 不实现生产多槽存档、完整主菜单/战略 UI、平台性能硬化或发布签名；这些属于 MB20–MB25。
- 不借机改变 Web 规则、原版证据等级、现有生命周期默认策略或外交 provisional 成本；发现 oracle 问题时记录最小兼容修复和证据。

## Evidence of Completion

- 共享 fixture 由 TypeScript 生成并由 Godot 运行器逐案比较 result、receipt、日志、完整 canonical state SHA-256、seed、阶段/月历和活动订单闭包；覆盖四时期与至少一条多月连续月循环。
- Godot 领域/应用/validator 测试证明稳定 AI 顺序、命令原子性、RNG 消耗边界、玩家/AI/结算阶段转换、继承/结局冻结和连续与恢复下一步一致；原生输入烟测证明结束回合、月份摘要、长日志和小屏触控路径。
- `npm run godot:program-check`、`npm run godot:domain-data:check`、`npm run godot:application-session:verify`、`npm run godot:project:verify`、`npm run check` 全部通过；指定 4.7.1 能无脚本错误打开主场景。
- 重新导出的 Android Debug APK 在已连接 MuMu 离线安装启动，并至少复验 1280×720 与 844×390 的结束回合、月度摘要、继承暂停或结局路径；包审计不含 Web runtime、测试 fixture 或受限素材。
- 完成报告 `docs/migration/mission-reports/MB12-strategic-ai-and-turn-orchestration.md` 记录规则身份、fixture 数量与摘要、设备结果、审查结果、已知风险和人工复验步骤；完成前派发三路只读审查并修复 P0、P1 与本 Mission 引入的 P2。

## Delegated Decisions and Unknowns

- 自主决定 AI 选择器、月循环编排器、阶段 receipt、摘要 DTO、fixture 组织及 Godot 场景连接方式；优先复用现有 GameSession、命令 adapter、validator、MB11 结算模块和已有 presentation 测试。
- 自主调查 Web `ai.ts`、`gameLoop.ts`、`turn.ts` 的实际调用顺序、AI 可执行命令集合和 RNG 消耗，并以可复现 fixture 解决不明确处。只有发现需要改变 MB00 固定条款、外部许可或发布范围时才升级。
- 对原版未证实的 AI 评分、月份单位、日志文本或设备默认行为，沿用当前 Web/modern ruleset 语义并明确 provisional，不虚构原版兼容性。

## Autonomy and Approval Boundaries

- 已授权在当前迁移分支内阅读和修改仓库、运行测试/构建、生成被忽略产物、使用已安装 Godot/Android 工具、在已连接测试设备安装 Debug APK 和创建本地提交。
- 下载或安装组件、破坏性 Git/文件操作、改变 MB00 固定条款、素材/许可证决定、推送、PR、发布、签名或其他外部写入需要用户确认。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with the repository’s existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
