# Mission Brief: Godot 原生人物任命与装备管理形成完整确定性切片

## Outcome

Godot 客户端的生产 `GameSession` 能通过原生人物管理界面完成当前 Web 产品已支持的奖赏、太守任命、道具赏赐与卸下装备。玩家能够从城池进入稳定排序的人物和库存视图，理解规则集造成的任命差异、装备后的有效属性与兵种变化，并在 1280×720 和 844×390 横屏触控下安全完成操作；每次操作的状态、日志、成本、道具唯一归属和 canonical 摘要均与 TypeScript oracle 一致，presentation 不持有规则。

## Context

- 长期章程、路线图与唯一进度账本位于 `docs/mission-briefs/MB00-godot-full-migration-program.md`、`docs/migration/godot-program-roadmap.json` 和 `docs/migration/godot-program-state.json`。生产数据、应用会话及完整内政切片的既有边界见 MB03–MB05 简报、`docs/migration/godot-application-session-contract.md`、`docs/migration/godot-internal-affairs-contract.md` 和对应完成报告。
- Web 行为事实入口是 `src/core/personnelCommands.ts`、`src/core/equipment.ts`、`src/core/rulesets.ts`、`src/core/validation.ts`、`src/core/personnelCommands.test.ts` 以及当前人物/宝物 UI。四时期人物、道具、初始装备与隐藏库存已经通过 MB03 数据契约进入 Godot；道具内容的 provisional 来源状态见 `references/parity-matrix.md` 与 `references/provenance/`。
- 经典规则集采用自动太守策略，手动任命应稳定拒绝；现代规则集保留手动、持久太守。Web 当前装备契约是两个有序通用装备位；兵符消耗城池道具并改变兵种，但不占用普通装备位。奖赏和装备管理不消耗月度行动，具体金钱、忠诚、资格与上限以 Web oracle 为准。
- MB05 已把共享应用 fixture 扩展为 37 路并建立 result.state SHA、规则边界、安全整数和移动端紧凑 UI 证据。应继续扩展同一事务/验证平台，不建立旁路会话或第二套摘要协议。

## Required Behaviors

- 奖赏人物、任命太守、赏赐道具和卸下装备覆盖 Web 现有成功效果、规则集差异、成本、忠诚变化、君主特例、两个有序装备位、有效武力/智力/移动加成、兵符资格与兵种覆盖、城池库存转移、日志和安全拒绝。失败不得改变任何状态或 seed。
- 道具在隐藏库存、已发现城池库存和人物装备之间保持全局唯一归属；转移顺序明确且不依赖 `Dictionary` 遍历。重复类型的稳定派生 ID、已有初始装备和未知道具必须继续通过完整状态校验。
- 四项能力进入 MB04 的版本化 command/result envelope、显式 adapter 注册和统一原子提交边界。参数契约闭合；未知字段、错误类型、Unicode 空白标识、陈旧摘要、重复提交、ID 冲突及不可 canonical 状态沿用既有稳定语义。
- 应用查询是 UI 获取城内人物、太守、库存、装备槽、有效属性、操作可用性/原因和稳定默认选择的唯一规则边界。查询返回深拷贝 DTO，不修改状态；场景不直接调用领域命令或自行判断资格、成本、忠诚及装备效果。
- 原生人物管理交互在城池空间上下文中可发现，但不会把七项内政卡片重新塞满。玩家能用鼠标和触摸浏览人物、查看基础与有效属性、识别太守/君主/已装备道具，并完成奖赏、现代规则任命、赏赐和卸装；危险或不可逆选择需要与影响相称的确认与反馈。
- 扩展现有 TypeScript/Godot application-session fixture，代表性证据同时挑战普通装备、装备位满、有效属性门槛、三类兵符、君主与普通人物忠诚、城池库存、错误归属、经典任命拒绝、现代任命成功、返回 state SHA、失败原子性和跨命令顺序。
- 更新人物/装备契约、parity matrix、Mission report 和程序账本。完成前进行架构/场景树、确定性/fixture、Android/触控三路只读审查，并清零 P0、P1 和本阶段引入的 P2。

## Constraints

- 固定使用 Godot 4.7.1 与 GDScript。`GameState`、人物/装备规则、有效属性计算、校验和应用事务保持在场景树外；Node/Control 只负责输入、表现和调度。
- TypeScript 产品是本 Mission 的行为 oracle；原版兼容等级只能由固定 C 证据或可重复设备/fixture 比较提升。33 项道具内容在重新关联合法固定来源前继续标为 provisional，不得把现有整理表描述为已证明的原版事实。
- 保留 MB01–MB05 证据、现有 Web 产品和 `npm run check`。不得嵌入 JavaScript/TypeScript、WebView、JSBridge、浏览器或网络依赖；`references/vendor/baye-c-core/` 继续只读且不进入构建。
- 不导入受限原版或来源不明素材、`.reference/`、WASM 或本地验证产物；不推送、不创建 PR、不发布 APK/AAB。

## Non-goals

- 搜寻与登用自由人物、俘虏招降、处斩、流放、没收俘虏装备或势力继承；这些属于 MB07/MB11。
- 人物移动、输送、调兵、征兵、战略队列、侦察、外交、AI、月度生命周期或战术装备效果；这些按路线图进入后续 Mission。
- 全局人物总览、完整宝物百科、生产存档 schema、正式主菜单或最终战略 UI 重制。

## Evidence of Completion

- TypeScript oracle 与 Godot 4.7.1 对共享人物/装备事务的完整 result core、receipt、返回 state、before/after SHA-256、人物/城池/道具变化和最终 canonical state 一致；经典/现代规则、负向路径与重复/陈旧事务证明失败原子性和幂等语义。
- Godot 领域与应用验证覆盖道具唯一归属、两槽顺序、有效属性、三类兵符、忠诚上限/君主特例、库存转移、稳定候选顺序和完整 next-state 校验；MB01–MB05 的回放、37 路事务、四时期数据与恢复演练持续通过。
- 原生主场景在 1280×720 与 844×390 下通过鼠标/触摸完成人物浏览、奖赏、装备/卸装及规则集任命反馈，控件保持 48px 级物理目标，不遮断地图导航或底部状态区。
- 精确 Godot 4.7.1 Android Debug APK 可离线安装启动，包扫描无 Web 运行时、测试/fixture、本地证据或新增权限；`npm run check`、editor import 和主场景启动通过。三路最终只读审查的 P0/P1/本阶段 P2 均为零。

## Delegated Decisions and Unknowns

- 自主决定人物管理界面的场景拆分、城池入口、列表/详情导航、query DTO、领域模块与 adapter 粒度；优先保证窄屏可读、规则单一来源及后续 MB07/MB08 可复用人物选择组件。
- 自主选择最小但有辨别力的跨命令 fixture 矩阵，并从 Web 测试、规则集与固定 C 证据判断已取样、现代产品规则和 provisional 数据；证据不足时保留现有等级并记录差异。
- 自主判断兵符与普通装备在 UI 中的呈现方式，以及经典自动太守如何解释为不可手动操作；不得改变底层语义来迁就界面。

## Autonomy and Approval Boundaries

- 已授权在当前迁移分支修改 Godot 人物/装备领域规则、application adapters/queries、原生人物管理 UI、TypeScript oracle 适配、共享 fixture、测试和文档，运行 Godot 4.7.1/Web 检查、生成被忽略的本地产物、在已连接 MuMu 上安装调试包并创建本地检查点提交。
- 可自主进行可逆重构、增加无外部依赖的验证工具，并按证据修复本 Mission 内问题。
- 下载/安装、新依赖或外部服务、许可决定、删除历史证据、修改 MB00 固定条款、扩大到 Non-goals、破坏性操作、推送/PR/发布或其他外部写入必须请求用户批准。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
