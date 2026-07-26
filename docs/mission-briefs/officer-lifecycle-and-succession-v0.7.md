# Mission Brief: 人物与君主拥有完整、可恢复的生命周期

## Outcome

人物不再只在驻城、在野与俘虏之间循环；处斩、流放、没收、逃脱、战死或自然死亡、装备转移、君主继承和势力终结形成一致的战略后果，玩家与 AI 都能处理这些结果，任意保存重载后不会出现失效君主、重复人物、丢失装备或不可继续的战役。

## Context

- 当前 Alpha 已有在职、在野、未登场、俘虏、招降、释放、战后经验和势力失城后的人员释放，但死亡、处斩、流放、没收、装备缴获和君主继承仍未完成。
- `references/vendor/baye-c-core/src/citycmdb.c:KillMake/BanishMake/LargessMake`、`citycmde.c:ConfiscateMake`、`citycmdd.c:FightResultDeal/HoldCaptive/LostEscape/KingOverDeal/KingDeadNote`、`infdeal.c:PersonUpDatadate` 与 `attribute.h` 是本阶段第一事实源。
- 固定移植核心具有可配置的年龄增长与战死开关，且部分死亡代码在不同路径中被禁用或注释；本项目必须把采用的生命周期政策显式化，不能伪装成唯一原版行为。
- 本阶段复用前序命令队列、年度年龄、外交归属与既有战斗结果原子回写；真实基线以 `docs/HANDOFF.md`、`references/parity-matrix.md` 和来源记录为准。

## Required Behaviors

- 玩家可以对合法人物执行处斩、流放和没收；目标身份、君主保护、城市、行动、装备与成本约束由核心统一判断，并显示明确后果与禁用原因。
- 俘虏的招降、释放、逃脱、处斩和装备处理互斥且原子；同一人物或物品不会被多次处置、重复生成或遗留在错误城市。
- 战斗死亡、年龄死亡或明确禁用死亡的战役政策是版本化状态的一部分；死亡会安全处理驻城、太守、在途命令、装备、俘虏和日志。
- 君主失效时能够按有证据支持且可解释的规则产生继承人，或在无合法继承时结束/瓦解势力；玩家需要选择时具有可保存、可恢复的决策点。
- 势力灭亡、策反、劝降、君主死亡和最后一城易主共享同一套城市、人物、俘虏、命令和胜负闭包，不因触发路径不同产生不同非法状态。
- 装备在赏赐、没收、流放、俘虏、死亡、处斩和战后缴获之间保持唯一所有权；AI 能进行基本的装备回收、俘虏处置和继承恢复。
- 人物年龄、忠诚、性格、原所属和身份只在有证据支持的规则中影响概率；确定性随机在存档前后保持一致。
- 新生命周期状态、待决继承、物品归属和政策进入迁移、完整性校验、损坏数据拒绝、月报和长期回归。

## Constraints

- 必须区分 BBK 原版、固定移植配置和现代可选政策；死亡或继承差异要版本化并记录，不得用单一临时分支冒充原版。
- 人物关系、婚姻、血缘和完整历史继承谱系没有固定证据时不进入范围；继承以战役可继续、人物合法和证据边界为准。
- 生命周期变化只能通过核心原子操作完成；UI、战术场景和 AI 不直接拼装归属、装备或死亡状态。
- 不得绕过现有战斗状态守卫、人物唯一驻扎、太守修复、在途命令、胜负和存档校验。
- 以小型纵向增量推进；相关测试持续通过，稳定检查点运行 `npm run check`、浏览器验收，并经过规则/状态、UI/存档、证据/许可证三个只读审查视角和修复闭环。
- 遵守 `AGENTS.md`；不推送、不发布、不执行外部写入或破坏性操作，不引入许可证不明资产、资源或 GPL 实现。

## Non-goals

- 不实现婚姻、亲族、结义、完整人物关系网或演义剧情继承。
- 不在本阶段扩展原版全量战术技能、地图或 AI。
- 不以血腥表现或原版对话资产作为处斩、死亡和战后处置的完成条件。

## Evidence of Completion

- `npm run check` 通过；处斩、流放、没收、逃脱、死亡开关、装备唯一性、君主继承、无继承势力终结、迁移与确定性具有自动化覆盖。
- 回归覆盖同一人物从战败被俘到招降/释放/逃脱/处斩的互斥路径，太守或君主死亡，在途人物失效，装备缴获，以及多种势力灭亡触发方式。
- 四时期长期战役能跨越人物年龄变化和多次势力终结，不出现无效君主、孤儿人物、重复道具、无法推进或错误胜负。
- 浏览器实际完成至少一种俘虏最终处置、一次装备回收，以及一次君主继承或无继承终局；保存重载后决策与结果一致，控制台无应用错误。
- 三个独立只读审查视角完成，所有 P0/P1 和本阶段引入的 P2 已修复或有可信非阻塞说明。
- README、交接、一致性矩阵和来源记录清楚说明死亡默认值、可选模式、原版证据与未实现人物关系范围。

## Delegated Decisions and Unknowns

- 执行者依据固定移植配置、原版路径和现有产品体验选择默认死亡政策；若多种政策都合理，应实现显式、版本化的战役选项而非隐藏分支。
- 继承候选排序、玩家决策的暂停点和 AI 自动继承由执行者选择，优先保证证据可解释、存档可恢复和战役不会软锁。
- 装备在逃脱、流放、战死和处斩中的转移细节存在版本差异时，可保留清晰命名的兼容或现代规则，但必须维持唯一所有权。
- 不完整的年龄死亡证据可以通过可关闭政策隔离；不得为追求考据而阻塞处置与继承闭环。

## Autonomy and Approval Boundaries

- 可自主修改仓库、只读研究固定参考、运行测试/构建/长期推演、复用单个本地开发服务器、执行浏览器验收、更新文档、创建本地检查点提交，并派发只读子智能体审查。
- 可自行修复生命周期、归属、装备、AI、UI、存档和文档问题，只要保持既定政策边界。
- 若必须由用户选择唯一默认死亡体验、需要扩展人物关系、执行外部发布/写入、采用不明资产、产生费用或进行不可逆操作，应暂停请求确认。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
