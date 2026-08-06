# Mission Brief: Godot 原生人才登用与俘虏处置形成完整确定性闭环

## Outcome

Godot 客户端的生产 `GameSession` 能通过原生城池交互完成人才搜寻、已发现人才登用，以及本城俘虏的招降、释放、处斩和流放；玩家也能流放在职人物并安全没收其装备。所有随机调用、身份转换、忠诚、体力、金钱、行动占用、道具回收和日志均与 TypeScript 产品一致，失败保持原子性，界面能清楚解释概率性尝试和不可逆处置。

## Context

- 长期章程、路线图和唯一恢复账本位于 `docs/mission-briefs/MB00-godot-full-migration-program.md`、`docs/migration/godot-program-roadmap.json` 与 `docs/migration/godot-program-state.json`。生产数据、事务会话、完整内政及人物装备边界见 MB03–MB06 简报、契约与完成报告。
- Web 行为事实入口是 `src/core/personnelCommands.ts`、`src/core/captiveCommands.ts`、`src/core/officerLifecycle.ts`、`src/compat/baye/officerLifecycle.ts`、`src/core/rulesets.ts`、`src/core/validation.ts` 及其测试。当前移动交互约束记录在 `docs/design/mobile-command-flow-coverage.md`、`docs/DEVELOPMENT_LOG.md` 和 Web 城池命令界面。
- 搜寻可能无收获、发现或直接登用人才、发现道具、取得金钱或粮草；显式登用只面向本城已发现的在野人物。俘虏招降使用有效智力、人物性格、忠诚与规则集成本，并具有条件式随机调用次数；释放不占行动。处斩、流放和非君主装备没收具有不可逆后果，其中流放目的地依赖显式排序后的 38 城和一次 RNG 调用。
- 俘虏状态必须保留中立归属、原势力、羁押势力和羁押城；装备在人物、城池库存及死亡回收之间保持唯一所有权。势力继承、月度逃脱和战斗产生俘虏属于后续生命周期/战术闭环，本 Mission 只消费合法初始俘虏状态。
- MB06 已将共享 application-session fixture 扩展到 56 路、589 项 Godot 断言，并建立可复用人物管理入口与 query DTO。应继续扩展同一事务、摘要和 UI 调度边界，不建立旁路状态或第二套随机协议。

## Required Behaviors

- 人才搜寻与显式登用复现 Web 当前前置条件、体力与行动成本、确定性随机分支、发现集合变化、资源软上限、道具库存转移、成功忠诚生成、失败结果和日志；任何影响选择的候选集合必须显式稳定排序。
- 俘虏招降复现经典/现代规则集成本、有效智力门槛、忠诚削减、性格抗性、成功忠诚重置及精确 RNG 调用顺序。成功清除俘虏元数据并转为本势力在职人物；失败仍合法消耗成本和行动，但不得产生未定义的归属状态。
- 释放、处斩和流放覆盖本城合法俘虏；流放同时覆盖本城在职非君主人物。处斩回收全部装备并记录死亡元数据；流放取消相关行动/在途状态、清零兵力并成为目标城在野人物；释放成为羁押城已发现在野人物。君主保护、身份、城池归属和待继承/终局约束由领域统一执行。
- 没收装备延续 Web 的单件回收、非玩家君主忠诚惩罚、君主特例、RNG 推进和不占月度行动语义，并与 MB06 的普通卸装形成清晰、不可混淆的命令边界。
- 所有能力进入 MB04 的版本化 command/result envelope、显式 adapter 注册和统一完整状态校验。参数错误、未知字段、Unicode 空白、陈旧摘要、重复 request、ID 冲突及非法 next-state 保持既有稳定语义；结构或领域失败不推进 seed、不改变状态。
- 应用查询是 presentation 获取本城已发现人才、合法执行者、俘虏、装备、成本、稳定默认选择、可用性/原因和风险摘要的唯一规则边界。DTO 为深拷贝且顺序稳定，场景不自行计算概率、资格、忠诚、目的地或回收结果。
- 原生交互复用城池空间上下文与人物管理语言，使玩家在鼠标和触摸下能发现搜寻/登用及俘虏入口、理解当前目标与执行者、确认处斩/流放/没收等危险操作，并在执行或取消后保留正确上下文与反馈。
- 扩展现有 TypeScript/Godot application-session fixture，以代表性序列挑战搜寻各类结果、显式登用成败、招降各 RNG 分支、有效智力与性格、经典/现代成本、释放、处斩装备回收、在职/俘虏流放、稳定城市目的地、没收特例、失败原子性及跨命令身份转换。
- 更新人才/俘虏契约、parity matrix、Mission report 和程序账本。完成前进行架构/场景树、确定性/fixture、Android/触控三路只读审查，并清零 P0、P1 和本阶段引入的 P2。

## Constraints

- 固定使用 Godot 4.7.1 与 GDScript。`GameState`、随机分支、人物生命周期、装备回收、校验和事务保持在场景树外；Node/Control 只负责输入、表现和应用层调度。
- 不使用 Godot 默认随机数，不依赖 `Dictionary` 遍历顺序。完全沿用显式 seed、现有 LCG、canonical JSON/SHA-256 和事务回执契约；随机调用只在 Web 对应前置条件通过后发生。
- TypeScript 产品是本 Mission 的行为 oracle；原版兼容结论只能由固定 C 证据或可重复 fixture 支持。`references/vendor/baye-c-core/` 继续只读且不进入构建，未证明的搜索/生命周期细节继续标记为已取样或 provisional。
- 保留 MB01–MB06 证据、现有 Web 产品和 `npm run check`。不得嵌入 JavaScript/TypeScript、WebView、JSBridge、浏览器或网络依赖；不得导入受限原版或来源不明素材、`.reference/`、WASM 或本地设备证据。
- 不推送、不创建 PR、不发布 APK/AAB。

## Non-goals

- 战斗中俘虏生成、战后城市易主、装备战利品与手动战场结算；这些进入战术与战后 Mission。
- 月度俘虏逃脱、自然死亡、战死政策、君主继承、势力瓦解和终局判定；这些属于 MB11 及后续整合。
- 人物移动、输送、征兵调兵、侦察、外交谋略、AI、月度编排、生产存档和全局人物浏览器。
- 改写 Web 当前概率、处斩语义或提供新增的俘虏交换/赎金系统。

## Evidence of Completion

- TypeScript oracle 与 Godot 4.7.1 对共享事务的完整 result core、receipt、返回 state、before/after SHA-256、精确 seed、资源/行动/人物/装备变化和最终 canonical state 一致；条件式 RNG 调用和失败原子性有可区分的正负样例。
- Godot 领域与应用验证覆盖稳定候选/城市排序、在野/在职/俘虏/死亡转换、羁押元数据、发现集合、装备唯一回收、太守与在途状态修复、君主保护及完整 next-state 校验；MB01–MB06 的恢复演练、56 路基线事务和四时期数据持续通过。
- 原生主场景在 1280×720 与 844×390 下通过鼠标/触摸实际完成至少一次人才获取尝试、一次招降成败路径和一次危险俘虏处置；确认、取消、错误原因、结果日志和返回城池上下文可读，主要控件保持 48px 级物理目标。
- 精确 Godot 4.7.1 Android Debug APK 可离线安装启动，包扫描无 Web 运行时、测试/fixture、本地证据或新增权限；`npm run check`、editor import 和主场景启动通过。三路最终只读审查的 P0/P1/本阶段 P2 均为零。

## Delegated Decisions and Unknowns

- 自主决定在 MB06 人物面板上扩展还是拆分人才/俘虏场景，以及城池入口、查询 DTO 和领域模块的合理粒度；优先保证窄屏可读、危险操作难以误触和后续 MB08/MB11 可复用。
- 自主从 Web 测试、固定 C 子集与共享 fixture 选择最小但有辨别力的 seed/人物/装备组合；应以实际 RNG 调用序列而非覆盖数量为判断依据。
- 自主判断“处斩”在技术样片中的非血腥文本反馈和确认强度；不得弱化其状态后果，也不得引入受限原版表现资产。
- 若生产四时期没有适合所有分支的现成合法俘虏，可在语言无关 fixture 中构造通过完整校验的最小状态，并为原生交互提供可重复的本地测试入口；不得将测试专用俘虏注入正式时期数据。

## Autonomy and Approval Boundaries

- 已授权在当前迁移分支修改 Godot 人才/俘虏/生命周期领域规则、application adapters/queries、原生城池与人物交互、TypeScript oracle 适配、共享 fixture、测试和文档，运行 Godot 4.7.1/Web 检查、生成被忽略的本地产物、在已连接 MuMu 上安装调试包并创建本地检查点提交。
- 可自主进行可逆重构、增加无外部依赖的验证工具，并按证据修复本 Mission 内问题。
- 下载/安装、新依赖或外部服务、许可决定、删除历史证据、修改 MB00 固定条款、扩大到 Non-goals、破坏性操作、推送/PR/发布或其他外部写入必须请求用户批准。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
