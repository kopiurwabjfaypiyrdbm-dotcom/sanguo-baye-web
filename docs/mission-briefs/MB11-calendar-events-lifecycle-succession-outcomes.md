# Mission Brief: Godot 战役时间、事件与人物结局形成可恢复闭环

## Outcome

Godot 战略客户端能够让四个时期的战役按确定的月历和年度持续演进：城池灾害、人物与道具年度变化、俘虏逃脱、自然死亡、君主继承、势力瓦解及玩家胜负都通过同一套合法状态闭包发生。需要玩家拥立新君时，战役停在可保存、可恢复的原生决策点；达到胜负条件时，所有在途命令安全终止并显示明确结局。相同初始状态和 seed 在 TypeScript、Godot、连续运行与保存恢复后得到相同结果。

## Context

- 长期委托、自治恢复协议和 Mission 注册表以 `docs/mission-briefs/MB00-godot-full-migration-program.md`、`docs/migration/godot-program-state.json`、`docs/migration/godot-program-roadmap.json` 为准。直接前置证据见 `docs/migration/mission-reports/MB10-diplomacy-and-strategic-orders.md`；MB10 已建立战略/外交订单共享的原子月份边界与结束前订单终止原语，但没有实现完整事件、继承或结局编排。
- 当前 TypeScript 产品的行为入口包括 `src/core/cityEvents.ts`、`annualProgression.ts`、`officerLifecycle.ts`、`outcome.ts`、`turn.ts`、`types.ts`、`validation.ts` 及相应测试。既有产品简报 `docs/mission-briefs/city-events-and-annual-progression-v0.5.md` 与 `officer-lifecycle-and-succession-v0.7.md` 提供动机和证据线索，但本简报与当前仓库事实优先。
- 固定参考入口包括 `references/vendor/baye-c-core/src/infdeal.c:CitiesUpDataDate/RandEvents/EventStateDeal/GoodsUpDatadate/PersonUpDatadate`、`tactic.c` 的月份调用位置，以及 `citycmdd.c:KingOverDeal/KingDeadNote`。兼容等级和未决差异必须继续记录在 `references/parity-matrix.md` 与来源笔记中；固定移植配置和现代产品政策不能冒充唯一原版行为。
- Godot 已有纯领域 `GameState`、显式 LCG seed、canonical JSON/SHA-256、事务命令、生产 validator、四时期数据、人物/俘虏/装备闭包、在途命令和原生横屏战略界面。时间、事件和生命周期必须扩展这些共同边界，不建立第二套状态或场景树权威状态。

## Required Behaviors

- 月历能跨月、跨年稳定推进，年度阶段只执行一次。城池的 normal、famine、drought、flood、rebellion 状态按当前 oracle 的固定次序产生、持续、结算或恢复，并原子影响其资源、人口、民忠、防灾及日志；随机调用只发生在规定阶段，遍历城市和人物时使用显式稳定次序。
- 人物年龄、未登场人物、隐藏道具和产品支持的年度字段按证据支持的年份与城市条件更新。已经登场、发现、装备、在途、缴获、死亡或已归属的对象不能重复生成、丢失或获得第二所有者；没有可靠原版证据的初始化和登场语义保持明确的版本化产品规则。
- `lifecyclePolicy` 成为 Godot 正式运行时契约。俘虏逃脱、自然死亡及禁用死亡的安全政策与 TypeScript 一致；死亡或身份变化统一清理太守、行动占用、战略/外交订单、装备和人物引用，保留可审计死亡记录，不产生孤儿君主或非法在途人物。
- 君主失效时，非玩家势力按稳定候选规则自动恢复或合法瓦解；玩家势力有合法候选时进入 `succession` 阶段并保存完整待决信息，除选择继承人外不能继续提交普通命令或推进月份。选择结果原子恢复原阶段及必要的 AI 继续位置；无合法继承者时产生明确失败或势力终止，而不是软锁。
- 胜负判断在归属或生命周期闭包后以稳定时点执行。玩家失去全部城市、君主且无继承人时进入 defeat；所有非中立敌对势力失去城市时进入 victory。结束态固定 `phase/outcome/activeFactionId`，清除待决继承和所有战略、外交订单，安全安置执行者并留下与玩家可见性一致的日志；结束后命令、月份和 RNG 均不再变化。
- Godot validator 对 `player/ai/succession/ended`、`outcome`、`pendingSuccession`、`lifecyclePolicy`、死亡记录、城池事件和年度状态执行 closed-shape、类型、引用、唯一性与阶段关系校验。畸形嵌套值只返回稳定问题列表，不崩溃；合法待继承和结束态可以保存恢复，非法混合状态被拒绝。
- 应用层提供可重放的月历/事件/生命周期结算与继承选择边界，receipt 能区分随机事件、年度变化、死亡/逃脱、继承和结局。MB10 的订单月份协调必须被复用，不能由新的“推进”入口再次独立增加 turn 或遗漏任何活动订单。
- 原生战略界面以玩家可理解的文本和空间反馈显示当前年月、城池状态及影响、年度人物/道具消息、死亡/逃脱摘要、待继承候选和最终胜负。玩家可在横屏触摸与鼠标下完成继承选择并确认结局；信息语义不只依赖颜色、动画或 tooltip，动画不控制领域提交。

## Constraints

- 必须使用 Godot 4.7.1 official `a13da4feb` 与 GDScript。领域状态、月历、事件、生命周期、随机判定、排序、校验和保存恢复不挂在场景树中；Node/Control 只处理输入、表现和应用调度。
- 当前 TypeScript 产品是本 Mission 的行为 oracle。语言无关 fixture 必须比较 result/receipt、日志、完整 canonical state SHA-256 与精确 seed；不得使用 Godot RNG、`Dictionary` 遍历顺序、本地化排序、帧时钟或动画完成影响结果，也不得为迎合实现而弱化 oracle 或改写期望。
- 必须区分 BBK 固定证据、固定移植配置和现代可选政策。死亡开关、继承候选、事件概率、未登场人物/道具年份或外围初始化缺少证据时，保留当前明确产品语义或 provisional 标记，不虚构历史剧情、血缘或原版一致性。
- 保留 Web 产品、路径、测试和构建，`npm run check` 必须继续通过。Godot APK 不嵌入 TypeScript、JavaScript、WebView、JSBridge 或浏览器运行时。
- `references/vendor/baye-c-core/` 只读且不进入构建；不得导入或提交受限原版数据、图片、字体、音频、视频、WASM、`.reference/` 内容或许可证不明素材。合法复用继续保留来源记录。
- 不直接提交到 `main`，不推送、不创建 PR、不发布 APK/AAB。可以在当前迁移分支创建可回退的本地阶段提交。

## Non-goals

- 战略 AI 的完整行动选择、AI 发起外交及包含玩家/AI/经济/事件全部阶段的最终回合编排属于 MB12；本 Mission 交付可供该编排调用的确定性阶段和玩家继承暂停/恢复边界。
- 战术战死、战后回接和战术胜负属于 MB13–MB19；本 Mission 只保证共同生命周期原语能被后续战术结果复用。
- 婚姻、血缘、结义、演义剧情事件、完整历史继承谱系和原版对话/素材不在范围。
- 生产多槽存档及跨版本损坏恢复属于 MB20；本 Mission 只要求当前 production snapshot/restore 边界能完整保存并验证新增状态。

## Evidence of Completion

- 共享 TypeScript/Godot fixture 覆盖跨月/跨年、每类城池状态、事件无效与恢复、年度年龄、人物/道具登场去重、俘虏逃脱、死亡启用/禁用、普通人物与君主死亡、玩家/AI 继承、无继承势力瓦解、victory/defeat、结束态订单终止、连续/恢复执行和主要畸形状态；两端的完整结果、receipt、日志、state SHA 与 seed 一致。
- Godot 领域、应用、validator 和 presentation 测试独立证明稳定排序、固定 RNG 调用位置、对象唯一性、阶段守卫、继承暂停/恢复、结束态幂等及 MB10 订单协调不回退。四个时期均至少有跨年确定性回放证据；完整 48 个月 AI soak 留给 MB12。
- 指定 Godot 4.7.1 可无错误导入并从现有主场景运行；原生界面在 1280×720 与 844×390 下能显示一种城池事件或年度消息、完成一次玩家继承并展示一种结局测试场景，主要触控目标可用且不遮挡关键状态。
- Android Debug APK 由指定引擎重新导出，包内容不含 Web runtime、测试 fixture 或受限素材；MuMu 覆盖安装、离线启动和代表性新增交互，日志无脚本错误或致命异常。模拟器证据不表述为真机证据；Web `npm run check` 持续通过。
- 完成报告 `docs/migration/mission-reports/MB11-calendar-events-lifecycle-succession-outcomes.md` 记录规则身份、阶段时序、fixture/SHA/seed、保存恢复、设备结果、包审计、已知风险和人工验收步骤，并同步更新 parity/provenance 证据。
- 实施完成后进行自检，并派发三路只读审查：Godot 架构与阶段状态、确定性事件/生命周期/fixture、Android/触控与继承/结局体验。修复 P0、P1 和本 Mission 引入的 P2 后才可关闭 MB11。

## Delegated Decisions and Unknowns

- 自主决定纯领域阶段、应用协调、fixture、原生事件/继承/结局表现的具体组织，以复用当前 `GameSession`、validator、MB10 原子订单边界和小屏测试基架为原则；不得提前复制 MB12 的完整 AI 月循环。
- 自主从当前 Web oracle 与固定参考收敛事件概率、调用顺序、年龄/登场、死亡政策、继承排序和势力瓦解闭包。遇到 Web 契约自相矛盾时，以最小可复现测试和最小产品修复收敛，不能只在 Godot 端静默分叉。
- 代表性事件、继承和结局可由确定性开发/验收场景触发，不要求等待自然随机发生；这些入口不得进入正式战役状态或 APK 发布数据。
- 固定参考对年度外围数据不足时，可以保留当前可验证的现代值并准确记录；许可证或唯一产品政策选择仍需用户决定，不能由考据不足推导。

## Autonomy and Approval Boundaries

- 已授权在当前迁移分支内调查和修改仓库文件、运行测试与构建、生成被忽略的本地产物、使用已安装工具、在已连接 MuMu/测试设备安装调试包，以及创建阶段性本地提交。
- 下载或安装组件、使用新外部服务或凭据、破坏性 Git/文件操作、修改长期委托固定条款、素材许可决定、推送、PR、发布、签名身份或其他外部写入需要用户确认。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
