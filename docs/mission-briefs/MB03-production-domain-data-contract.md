# Mission Brief: 四时期生产领域数据契约可由 Godot 独立加载与验证

## Outcome

Godot 4.7.1/GDScript 客户端拥有可长期演进的生产领域数据契约：仓库内四个时期的可再分发数据都能从同一版本化 schema 生成、独立加载、完整校验并构造不依赖场景树的初始 `GameState`；TypeScript oracle 与 Godot 对每个时期得到相同的实体集合、显式顺序、关系图、规则身份、初始 seed 和 canonical 状态摘要。当前时期 1 技术样片继续运行，后续战略规则 Mission 可以在此契约上增量实现，而无需再次改变基础数据形状。

## Context

- 完整迁移章程、路线图和当前账本分别为 `docs/mission-briefs/MB00-godot-full-migration-program.md`、`docs/migration/godot-program-roadmap.json`、`docs/migration/godot-program-state.json`。MB01 的 38 城样片见 `docs/migration/godot-spike-report.md`；MB02 的跨语言摘要/回放平台见 `docs/migration/mission-reports/MB02-deterministic-migration-verification-platform.md`。
- 当前 `godot/data/period-1.json` 是 `dataContractVersion: 1` 的技术样片导出，包含时期 1 的完整 Web `GameState` 加样片元数据；`godot/src/domain/validation/game_state_validator.gd` 明确拒绝尚未迁移的状态语义。它能支撑一条开垦命令，却不是四时期、长期存档和全部规则共同依赖的正式边界。
- Web 权威数据由 `src/data/generated/baye-periods.json`、`src/data/bundledScenarios.ts`、`src/data/legacyScenario.ts`、`src/core/types.ts`、`src/core/validation.ts` 与 `src/core/rulesets.ts` 解释。任何原版一致性结论仍必须遵循 `references/parity-matrix.md` 和 `docs/design/compatibility-policy.md` 的证据等级。
- MB02 已提供 `canonical-json-v1`、`safe-integer-or-decimal-6-v1`、SHA-256、受控初态引用和两端独立 runner。本 Mission 应扩展其数据/fixture 能力，不另造摘要协议。

## Required Behaviors

- 定义一个生产用途、版本化、语言无关的 Godot domain data envelope；明确区分数据契约版本、运行时/存档 schema、规则集身份、时期目录、单时期初态、实体显式顺序、来源/使用限制和完整性摘要。未知版本、未知规则身份、缺字段、额外破坏性字段或错误类型必须可定位地拒绝。
- 从现有合法 Web 数据生成时期 1–4，不手工维护第二份权威内容。四时期必须逐一验证城市、道路、势力、人物、道具、兵种、初始日历、玩家候选、显式 RNG seed 以及 Web `createBundledScenario` 初始化所需的全部语义；任何影响结果的 record/set 必须按明确领域顺序导出，不能依赖对象或 `Dictionary` 遍历顺序。
- Godot 以纯 `RefCounted` loader/validator 构造权威 `GameState`，不依赖 Node、浏览器、场景树、系统时间、默认 RNG 或网络。`Node`/场景只可选择时期、传递用户选择并调度应用层。
- 解决当前 `dataContractVersion: 1` 收窄校验与生产契约的关系：保留可复验的 MB01 兼容入口，新增正式契约迁移/适配边界，或以有版本门的向后兼容方式升级；不得静默扩大旧 fixture 的含义。
- 四时期各自建立共享 JSON fixture 和 canonical 初态摘要。TypeScript 从 Web oracle 生成并验证；Godot 独立加载同一数据、执行结构与关系校验、核对摘要。至少证明对象键重排不影响摘要，而显式语义顺序变化会被校验或摘要捕获。
- 校验器覆盖跨实体关系：城市道路双向性、owner/faction/ruler/officer/city 引用、人物状态与所属、装备和隐藏/已发现道具唯一性、兵种引用、势力顺序与活动势力、玩家候选、日志/命令序列以及 seed/安全数值域。验证顺序稳定，错误列表顺序可重复。
- 提供一个位置无关的仓库命令，能检查生成物是否与 Web oracle 一致，再用 Godot 4.7.1 headless 批量验证四时期；受控数据只有显式 generate 命令可以重写，普通 check 不得自行刷新期望值。
- 当前主场景继续默认打开时期 1 的 38 城样片；不得在本 Mission 扩展完整开局 UI。可以为后续应用层暴露时期目录/加载 API，并用无界面 smoke 证明四时期都能创建有效 `GameState`。
- 更新数据契约文档、provenance/使用限制、parity matrix、程序账本和 MB03 Mission report，使新上下文能唯一恢复到下一 Mission。

## Constraints

- 固定使用 Godot 4.7.1 与 GDScript；不引入 C#、TypeScript/JavaScript runtime、WebView、JSBridge 或网络依赖到 Godot。
- `GameState` 和验证/加载逻辑保持场景树外的纯领域对象。所有随机字段必须显式；不得调用 Godot 默认 RNG。所有影响状态或摘要的集合必须显式排序。
- 保留 Web 产品、现有目录、MB01 主场景、旧 fixture、MB02 回放和 Android 已验证能力；不把仓库迁入 `web/`，不做大规模 Web 路径调整。
- `references/vendor/baye-c-core/` 继续只读且不进入应用构建。不得导入或提交 `dat.lib.orig`、原版或许可不明图片/字体/音视频、WASM、`.reference/` 内容；合法现有数据与资产必须保留来源和使用限制。
- 不推送、不创建 PR、不发布 APK/AAB。安装依赖、修改 MB00 固定条款、许可结论、破坏性操作或扩大到 MB04 应用层会话需要用户批准。

## Non-goals

- 移植新的战略命令、完整月循环、AI、战术规则、生产存档、完整开局/战略 UI 或正式美术。
- 把四时期全部可玩；本 Mission 只交付它们的生产数据边界、初始状态构造和验证证据。
- 重做 Web 数据源、改变当前规则数值，或提升没有新增 C/设备证据的原版一致性等级。

## Evidence of Completion

- 版本控制中存在四时期生产数据及 schema 文档；受控生成命令的 check 模式证明没有漂移，generate 后再次 check 得到相同内容。
- TypeScript 与 Godot 4.7.1 报告相同的 4 个时期 ID、逐时期实体/道路数量、初始 seed、玩家候选和 canonical 摘要；Godot 能为每个时期构造并完整验证纯领域 `GameState`。
- 自动负向测试至少覆盖未知契约版本、错误规则身份、单向道路、悬空人物/道具/兵种引用、重复或乱序语义 ID、错误初态摘要和受限数值域；失败非零、包含时期/字段路径且顺序稳定。
- `npm run check`、MB02 `npm run godot:migration-check`、新的四时期数据检查、Godot 领域测试、Godot 4.7.1 编辑器导入及主场景 headless 启动全部通过。
- 版本控制/来源扫描确认没有新增构建产物或受限素材；三路只读审查（架构/场景树、数据确定性/契约、Android/现有样片回归）修复全部 P0、P1 和本 Mission 引入的 P2。
- `docs/migration/mission-reports/` 记录 schema 决策、四时期摘要/计数、命令输出、审查结论、已知限制与 MB04 选择依据；权威账本能在独立进程恢复为 MB04 或明确阻塞。

## Delegated Decisions and Unknowns

- 自主决定 envelope 拆分方式（目录 + 单时期文件或等价结构）、schema 文件/文档形式、loader API、生成器模块边界、fixture 分片和检查命令名称；优先小文件、可审计 diff、稳定排序和后续按时期延迟加载。
- 自主决定哪些 Web `GameState` 字段属于生产初态、哪些是可推导索引或样片元数据；任何省略必须在 schema 文档中给出重建规则，并由双端测试证明不会改变 canonical 权威状态。
- 若四时期现有数据包含 `safe-integer-or-decimal-6-v1` 无法表达的合法值，不得静默舍入；先记录值与用途，再选择升级摘要数字域或把非状态展示数据移出权威摘要，并保留跨语言向量。
- 若当前 GDScript validator 无法一次覆盖 Web 完整 schema，可分层为 envelope、scenario 与 cross-reference validator；但交付时四时期必须全部通过同一生产入口，不能以“后续再校验”替代。

## Autonomy and Approval Boundaries

- 已授权在当前迁移分支内读取权威 Web 数据与证据，修改本 Mission 所需的生成脚本、Godot 纯领域 loader/validator、合法 JSON 数据、测试、文档和 npm 命令，运行 TypeScript/Godot 4.7.1 检查，并创建本地检查点提交。
- 不需要为可回退的 schema 组织、排序规则、测试夹具、错误格式或 loader 设计暂停；必须为新增依赖/下载、许可判断、删除/重写 Web 权威数据、修改 MB00、推送/PR/发布或进入 MB04 请求批准。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
