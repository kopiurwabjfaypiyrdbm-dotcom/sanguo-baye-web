# Mission Brief: 城池与人物按可验证的月份和年份持续演进

## Outcome

四时期战役不再只是资源按固定公式增长；城池会经历可治理的饥荒、旱灾、水灾和暴动，人物年龄、未登场武将与隐藏道具会随年份推进，玩家和 AI 能理解并应对这些变化，长期战役在保存重载后仍保持确定、合法和可恢复。

## Context

- 当前功能完整 Alpha 已有季节税收、粮食收获、人口增长、军粮消耗、体力恢复和长期回归，但完整月份顺序、灾害状态、年度人物/道具更新与开局资源仍是临时实现；以 `docs/HANDOFF.md` 和 `references/parity-matrix.md` 为真实基线。
- `references/vendor/baye-c-core/src/infdeal.c:CitiesUpDataDate/RandEvents/EventStateDeal/GoodsUpDatadate/PersonUpDatadate` 与 `tactic.c:ConditionUpdate` 是本阶段第一事实源。
- 原版时期数据已经转换为四套 38 城、200 人物记录的结构化剧本；未登场人物被保留，但真实出现年份、城市和四时期外围初始化仍未完整接入。
- 本阶段应建立在 `docs/mission-briefs/strategic-orders-and-logistics-v0.4.md` 的战略命令能力之上；若前阶段的实际实现与预期不同，应适配其公开不变量而不是复制第二套状态模型。

## Required Behaviors

- 城池具有正常、饥荒、旱灾、水灾和暴动等持久状态；状态的产生、持续、恢复与资源、人口、民忠、防灾和驻军影响保持确定并对玩家可见。
- 治理、出巡、粮食后勤和相关 AI 决策能预防或缓解城池事件，事件不会只是一条无交互日志。
- 月度推进以一个明确、经过证据记录的顺序处理命令完成、AI、税收、收获、人口、军粮、体力、城池事件、日历、人物和道具更新；同一状态不会因 UI 路径不同而改变顺序。
- 人物年龄按年度推进；未登场人物只在满足有证据支持的年份与城市条件后进入合法的在野或可搜索状态，不提前、重复或丢失。
- 道具按有证据支持的年份和城市进入隐藏库存；已发现、已装备、在途、缴获或已消耗道具不会被年度更新重复生成。
- 四时期初始兵力、粮草、人物年龄与其他外围初始化尽可能用固定参考或可重复夹具替换现有临时值；无法确认的字段保持明确的临时规则。
- AI 能识别粮荒、灾害和即将发生的后勤风险，使用与玩家相同的治理、出巡、交易或输送能力进行应对。
- 事件、年度演进、随机种子、在途命令和所有受影响状态完整保存；旧存档迁移与损坏数据拒绝覆盖新增字段。

## Constraints

- 只把固定 C 源码、锁定结构数据或可重复参考输出支持的结论标为原版兼容；不得从未验证技术文档或 GPL 离线实现复制规则。
- 人物死亡、君主继承和完整战后处置由后续生命周期委托负责；本阶段的年龄增长不能静默删除人物。
- 随机事件保留原版调用位置、范围、取模和比较方向；正式游戏继续遵守 `docs/design/compatibility-policy.md` 的版本化确定性随机策略。
- 规则放在核心或兼容层，UI 只呈现事件、后果、操作与禁用原因；不能通过 UI 特判修复状态问题。
- 以小而可玩的纵向增量推进；阶段内持续运行相关测试，稳定检查点运行 `npm run check`、浏览器验收和三个独立只读审查视角，并修复本阶段发现。
- 遵守 `AGENTS.md` 的许可证边界；不推送、不发布、不导入原版二进制、资产、资源数组或许可证不明资料。

## Non-goals

- 不实现外交谋略、君主继承、战死/处斩或原版全量战术。
- 不把未经固定参考确认的演义剧情、婚姻和历史事件脚本当作原版硬需求。
- 不要求复现 BBK 设备的未知随机数逐次序列。

## Evidence of Completion

- `npm run check` 通过；月度阶段顺序、每类城池状态、治理恢复、年度年龄、人物/道具登场、迁移、重复生成拒绝和确定性具有自动化覆盖。
- 四时期至少各运行 48 个月，跨越多个年度更新，并定期保存重载；弱势一城君主在灾害与后勤压力下仍可确定推进或合法失败。
- 浏览器实际经历至少一种城池事件，显示其后果，并由玩家通过治理、出巡或后勤完成一次可观察恢复；另验证一次年度人物或道具出现。
- AI 能在长期回归中对灾害或粮荒采取合法行动，不出现资源负数、人物重复、道具复制、事件永不恢复或月份卡死。
- 规则/状态、UI/存档、证据/许可证三个只读审查视角完成，所有 P0/P1 和本阶段引入的 P2 已修复或有可信非阻塞说明。
- 项目交接、一致性矩阵和来源记录能让新协作者区分已验证月度规则、临时初始化和未确认历史内容。

## Delegated Decisions and Unknowns

- 执行者根据固定 C 行为决定城市状态的数据模型、事件日志粒度和月度流水线拆分；优先保证原子结算、确定性和未来外交/生命周期复用。
- 人物与道具登场资源不足时，可使用被忽略的本地参考生成最小可重复夹具，但不得提交原始资源或可替代其分发的数据转储。
- 原版外围开局初始化若在合理时限内仍无证据，可保留公平、对称且版本化的现代值，并准确记录，而不是阻塞事件闭环。
- UI 如何预告风险、汇总月报和呈现防灾概率由执行者按玩家可理解性决定。

## Autonomy and Approval Boundaries

- 可自主修改仓库、只读研究许可参考、运行测试/构建/长期推演、复用单个本地开发服务器、执行浏览器验收、更新文档、创建本地检查点提交，并派发只读子智能体审查。
- 可自行修复发现的状态、迁移、AI、UI 与文档问题，只要不扩展到未确认历史剧情或改变许可证政策。
- 外部写入/发布、来源不明资产、不可逆操作、费用或必须由用户选择的死亡/历史内容政策需要确认。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
