# Mission Brief: Godot 原生跨城调动与战略输送形成可持续后勤闭环

## Outcome

Godot 客户端能从原生战略地图为己方武将签发跨城调动或携带金钱、粮草、后备兵的输送命令，清楚展示稳定路线、预计月份、在途状态和资源风险；对应订单能按当前 Web 产品语义确定性推进、抵达、受损、返还或安全回收，并可被后续月度编排直接消费。全过程进入生产 `GameSession`、完整状态校验和共享跨语言证据，不产生资源复制、失踪武将或依赖遍历顺序的结果。

## Context

- 长期章程、路线图和唯一恢复账本位于 `docs/mission-briefs/MB00-godot-full-migration-program.md`、`docs/migration/godot-program-roadmap.json` 与 `docs/migration/godot-program-state.json`。MB03–MB07 已建立四时期生产数据、版本化事务、原生城池/人物入口、装备与人物生命周期边界；最新完成报告是 `docs/migration/mission-reports/MB07-recruitment-captives-surrender-banishment.md`。
- Web 行为事实入口是 `src/core/strategicOrders.ts`、`src/core/strategicOrderCargo.ts`、`src/core/administration.ts`、`src/core/officerLifecycle.ts`、`src/core/diplomaticOrders.ts`、`src/core/rulesets.ts`、`src/core/validation.ts` 及其测试。当前移动交互语义见 `src/ui/CityPanel.tsx`、`docs/design/mobile-command-flow-coverage.md` 与 `docs/DEVELOPMENT_LOG.md`。
- 当前产品的调动/输送沿己方城市道路进行稳定 BFS，每段道路计一个月；签发后执行者离开驻城并占用行动，输送货物立即从源城扣除。订单完成时，调动进入目标城；输送执行一次确定性受损判定并让执行者返回安全己方城。目标易主、执行者失效、库存已满或势力失地时有明确回退、货物分摊和日志语义。
- Godot runtime validator 当前有意拒绝非空战略/外交订单，MB07 的处斩/流放也只在空订单 runtime 中验证。MB08 必须把战略订单升级为受支持的生产状态，并让人物生命周期失效路径与在途状态安全衔接，而不提前迁移外交或完整月循环。
- 固定 C 子集的入口包括 `references/vendor/baye-c-core/src/citycmd.c:TransportationDrv/MoveDrv` 与 `citycmdc.c:TransportationMake/MoveMake`。现有 Web 的多月道路、货损、软上限和回退规则含现代产品设计，只能按可追溯证据维持相应 parity 等级。

## Required Behaviors

- 调动与输送复现 Web 当前前置条件：玩家/活动势力、己方源城与目标城、在职驻城执行者、无既有战略或外交命令、未行动、足够体力、不同城市及仅经己方城市连通的路线。失败返回稳定原因，且不扣资源、体力、行动或 seed。
- 路线采用不依赖 `Dictionary` 顺序的稳定 BFS；邻接扩展、同耗时目标、订单 ID、活动订单列表及所有回退城市使用明确跨语言排序。路线与 `durationMonths/remainingMonths` 在订单创建后冻结，不因 UI 重查而漂移。
- 签发订单使用无冲突递增 ID，扣除规则集体力、占用当月行动、移除人物驻城并修复太守。输送还必须原子扣除非负安全整数货物；空货、库存不足、目标软上限风险和不安全输入均拒绝。
- 订单推进按稳定 ID 顺序处理。未到期订单只递减剩余月份；调动到期后进入仍属己方的目标城，否则返回源城或稳定己方落脚城；势力无城时按 Web 规则成为中立在野人物，且完整状态仍合法。
- 输送到期在所有结构/容量前置条件通过后才调用现有 LCG。成功入库，受损则货物全损；目标易主、目标满载、执行者失效或势力失地不误用成功 RNG，并按 Web 的优先回退与跨城安全入库规则返还/分摊货物。任何整数溢出、超软上限或无法安置必须在提交前拒绝或得到明确定义的安全结果。
- 战略订单成为完整 `GameState` runtime 契约的一部分：结构、kind、势力/人物/城市引用、冻结路线、日期、月份、货物、序号、在途人物唯一订单与驻城互斥均被校验。`Dictionary` 只作为按 ID 访问的存储，所有影响结果的处理顺序显式排序。
- 人物被俘、处斩、流放、势力失地或其他已迁移失效路径时，相关调动/输送订单终止，执行者和货物按 Web 语义安置，并修复太守、行动/发现集合与日志。外交订单仍未迁移，但 validator 和人物占用判断不得为 MB10 留下第二套冲突协议。
- 玩家命令进入 MB04 的版本化 command/result envelope、adapter 注册、幂等窗口、canonical SHA-256 与完整 next-state 校验。订单推进作为场景树外的确定性领域/application 能力暴露给后续 MB11/MB12，不由场景节点自行倒计时或修改状态。
- 应用查询是 presentation 获取可达目标、冻结路线、耗时、成本、执行者、源/目标容量、稳定默认项、货物上下限、在途订单和不可用原因的唯一规则边界。DTO 为深拷贝；Control 不实现寻路、库存、货损概率或回退规则。
- 原生交互从城池空间上下文进入，在鼠标与触摸下能完成调动和多资源输送，明确显示来源、目标、路线月份、执行者、三类货物、立即扣除与受损风险，并允许查看当前在途订单。执行、取消或拒绝后保留正确城池上下文与可读反馈。
- 扩展共享 TypeScript/Godot fixture，以有辨别力的序列覆盖直达/多段/无路、稳定同长路线、调动签发与到期、输送成功/受损、条件式 RNG、三类货物、空货/负数/非整数/不足/软上限、目标易主、执行者失效、源城失守、无城势力、ID 冲突、太守修复、人物生命周期取消、跨订单处理顺序与失败原子性。
- 更新战略后勤契约、parity matrix、Mission report 和程序账本；完成前进行架构/场景树、确定性/fixture、Android/触控三路只读审查，并清零 P0、P1 和本阶段引入的 P2。

## Constraints

- 固定使用 Godot 4.7.1 与 GDScript。`GameState`、寻路、订单、货物、RNG、校验和推进逻辑保持在场景树外；Node/Control 只负责输入、表现和应用层调度。
- 不使用 Godot 默认随机数，不依赖 `Dictionary` 遍历顺序。继续沿用显式 seed、当前 LCG、canonical JSON/SHA-256、事务回执和安全整数契约；只有 Web 对应分支实际抽数时才推进 seed。
- TypeScript 产品是本 Mission 的行为 oracle；原版兼容结论只能由固定 C 证据或可重复 fixture 支持。`references/vendor/baye-c-core/` 继续只读且不进入构建，现代多月物流语义不得误标为原设备一致。
- 保留 MB01–MB07 证据、现有 Web 产品和 `npm run check`。不得嵌入 JavaScript/TypeScript、WebView、JSBridge、浏览器或网络依赖；不得导入受限原版或来源不明素材、`.reference/`、WASM 或本地设备证据。
- 不推送、不创建 PR、不发布 APK/AAB。

## Non-goals

- 侦察与情报可见性、外交谋略订单及其月度结算；分别属于 MB09 与 MB10。
- 年月推进、城市事件、人物登场/死亡/逃脱、继承/瓦解、胜负判断及完整月末编排；属于 MB11/MB12。本 Mission 只提供可独立确定性推进的战略订单能力与证据。
- 征兵、城内兵力分配、出征与战斗物流；出征进入战术框架和战后整合 Mission。若现有路线图未为征兵/调兵单列归属，只记录缺口，不擅自扩大 MB08。
- 战术地图移动、运输动画、正式全局订单浏览器、生产存档 schema 或 AI 后勤决策。

## Evidence of Completion

- TypeScript oracle 与 Godot 4.7.1 对共享签发/推进序列的完整 result core、receipt、返回 state、before/after SHA-256、订单、人物、城池货物、日志、精确 seed 和最终 canonical state 一致；条件式 RNG 与失败原子性由能区分错误实现的正负样例固定。
- Godot 领域/应用验证覆盖稳定 BFS 与排序、安全整数/容量、在途人物与订单结构、月份递减、太守修复、货物唯一守恒、失效回退、生命周期取消及完整 next-state 校验；MB01–MB07 的恢复演练、83 路/723 项基线和四时期数据持续通过。
- 原生主场景在 1280×720 与 844×390 下通过鼠标/触摸实际签发至少一次调动和一次含多种货物的输送，能查看路线、耗时、立即资源变化与在途状态；紧凑布局无全局滚动，主要控件保持 48px 级物理目标。
- 精确 Godot 4.7.1 Android Debug APK 可离线安装启动，包扫描无 Web 运行时、tests/fixture、`builds/` 本地证据或新增权限；`npm run check`、Godot domain/application/presentation 验证、editor import 和主场景启动通过。三路最终只读审查的 P0/P1/本阶段 P2 均为零。

## Delegated Decisions and Unknowns

- 自主决定扩展现有人才面板还是建立独立后勤场景，以及在地图上表达路线/在途状态的合适原生表现；优先保证窄屏参数可读、危险资源扣除难以误触，并避免普通点城无条件构建昂贵查询。
- 自主选择订单推进进入 application 的内部命令、服务或可注入编排接口，但必须保持与玩家 command envelope 清晰分离、可由 MB11/MB12 复用且能独立 fixture 验证。
- 自主从 Web 测试与固定 C 子集选择最小但有辨别力的路线、seed、容量和失效组合；优先验证 RNG 是否调用、资源守恒与稳定回退，而非堆积相似样例。
- 当前 Web 使用 JavaScript `localeCompare` 的若干 ID/城市排序，Godot 必须为共享契约选择并记录语言无关排序；若生产数据当前无冲突，也应以合成 fixture 固定可能影响路线或结算的排序键。
- 若征兵/城内调兵在后续路线图没有明确归属，在完成报告中提出建议归属；本 Mission 不因该规划缺口扩大可观察 Outcome。

## Autonomy and Approval Boundaries

- 已授权在当前迁移分支修改 Godot 战略订单/货物/校验领域、application adapters/queries、人物生命周期衔接、原生城池与后勤交互、TypeScript oracle 适配、共享 fixture、测试和文档，运行 Godot 4.7.1/Web 检查、生成被忽略的本地产物、在已连接 MuMu 上安装调试包并创建本地检查点提交。
- 可自主进行可逆重构、增加无外部依赖的验证工具，并按证据修复本 Mission 内问题。
- 下载/安装、新依赖或外部服务、许可决定、删除历史证据、修改 MB00 固定条款、扩大到 Non-goals、破坏性操作、推送/PR/发布或其他外部写入必须请求用户批准。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
