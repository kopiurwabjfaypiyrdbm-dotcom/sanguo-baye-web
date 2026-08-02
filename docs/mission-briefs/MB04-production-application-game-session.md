# Mission Brief: Godot 生产 GameSession 成为唯一应用层战役事务入口

## Outcome

Godot 客户端拥有可持续扩展的生产应用层 `GameSession`：它能从 MB03 目录启动任一时期和合法玩家候选，持有唯一权威 `GameState`，通过统一命令事务入口执行现有真实开垦命令，并以稳定结果/摘要对外暴露状态变化。当前原生主场景改用该生产会话后仍可正常运行时期 1 的 38 城样片、点选与开垦；后续战略规则 Mission 可以注册新命令而无需让场景直接读取数据、调用领域实现或替换状态。

## Context

- 长期章程、路线图与权威账本分别为 `docs/mission-briefs/MB00-godot-full-migration-program.md`、`docs/migration/godot-program-roadmap.json` 和 `docs/migration/godot-program-state.json`。MB03 的数据边界、四时期摘要和审查结论见 `docs/migration/godot-domain-data-contract.md` 与 `docs/migration/mission-reports/MB03-production-domain-data-contract.md`。
- `godot/src/application/game_session/game_session.gd` 是 MB01 的样片会话：它直接读取 `godot/data/period-1.json`，公开开垦专用方法并使用样片存档。`godot/src/application/game_session/production_data_repository.gd` 已能加载并验证 MB03 四时期目录；`godot/src/domain/commands/develop_farming_command.gd`、`godot/src/domain/game_state/` 和 `godot/src/domain/validation/` 是当前纯领域边界。
- MB02 的 canonical JSON、SHA-256、回放协议和 runner 是跨语言事务证据入口。现有主场景、Android 横屏/触控、MB01 v1 fixture 和最小存档仍是必须保留的回归基线。

## Required Behaviors

- 生产会话在场景树外拥有并封装唯一 `GameState`；调用者只能取得深拷贝快照、只读查询结果或稳定事务结果，不能取得或修改内部字典/状态引用。
- 会话通过 MB03 catalog 启动时期 1–4，并接受该时期目录中明确列出的玩家候选。玩家选择必须确定性地设置 `playerFactionId`、`activeFactionId` 和唯一 `isPlayer` 标记，不消耗 RNG；未知时期、未知候选或损坏数据必须在建立会话前失败且不留下半初始化状态。
- 定义语言无关、可版本化的应用命令 envelope 与结果 envelope。当前至少支持 `develop_farming`，包含足够的命令身份、参数、成功/失败、领域 receipt、前后 state SHA-256 和当前快照证据；未知版本、未知命令、缺失/错误参数必须稳定拒绝。
- 每个命令以事务方式运行：从同一个 before state 校验并执行，只有完整 next state 通过验证后才一次替换会话状态。失败、异常、摘要错误或重复/陈旧前置摘要不得改变状态、seed、日志或行动列表；错误列表和结果形状可重复。
- 命令分派属于 application 层，领域命令保持纯 `RefCounted` 且不依赖场景、IO、系统时间、默认 RNG 或表现状态。分派不能把命令规则复制到 UI，也不能用 `Dictionary` 遍历顺序决定结果。
- 提供稳定的会话查询能力，足以让当前战略场景取得时期信息、选中城池详情、命令可用性和默认执行者，而不让 presentation 直接遍历权威状态来重新实现合法性。查询不得改变状态。
- 当前主场景改由生产 `GameSession` 默认启动时期 1 的一个明确候选，继续显示完整地图并执行开垦。MB01 v1 数据、fixture、回放和最小存档入口保留为兼容证据，不被删除或伪装成生产会话格式。
- 对同一时期、候选、seed 和命令序列，TypeScript oracle、Godot 直接连续执行、失败后重试以及会话快照恢复演练得到相同 canonical 结果。将本 Mission 的 command/result envelope 接入 MB02 验证平台，不建立第二套摘要算法。
- 更新架构说明、parity matrix、Mission report 和程序账本，使新进程可以唯一恢复到 MB05；完成前运行三路只读审查并修复所有 P0、P1 和本阶段引入的 P2。

## Constraints

- 固定使用 Godot 4.7.1 与 GDScript。`GameSession`、`GameState`、命令分派和查询不能成为 Node、Autoload 或场景树权威对象；Node/Control 只持有应用会话并转发输入/表现结果。
- 保持显式 seed、MB02 canonical 协议、事务式命令和完整状态校验；不得使用 Godot 默认 RNG、系统时间、帧序或隐式集合顺序生成权威结果。
- 保留 Web 产品作为 oracle，保留 MB01/MB02/MB03 证据和当前 Android/Windows 工程能力；不移动 Web 目录、不扩大到新的战略规则、不删除样片存档。
- Godot 不得嵌入 TypeScript/JavaScript、WebView、JSBridge、浏览器运行时或网络依赖。vendor C 继续只读且不进入应用构建。
- 不导入受限原版/未知许可素材、`.reference/` 内容、WASM 或构建产物；不推送、不创建 PR、不发布 APK/AAB。

## Non-goals

- 移植新的城池、人物、外交、月循环、AI 或战术规则；完整开局 UI 和正式存档 schema 分别属于后续 Mission。
- 在本 Mission 完成多会话、联网、撤销/重做、后台模拟、生产多槽存档或 Web 存档导入。
- 删除 MB01 专用 API/fixture，或为了统一接口改写已经固定的历史证据。

## Evidence of Completion

- Godot 4.7.1 无界面测试证明四时期的每个合法玩家候选均能构造有效生产会话，玩家/活动势力唯一正确，启动不消耗 seed；非法时期、候选和损坏 envelope 安全失败。
- 共享 JSON fixture 证明生产命令 envelope 的成功、领域拒绝、未知命令、错误类型、陈旧 before 摘要和重复提交行为；TypeScript 与 Godot 的 success/error、receipt、seed、前后摘要及最终状态一致。
- 事务测试证明所有失败路径前后摘要相同，成功只提交一次；快照深拷贝、查询纯度、显式命令顺序和错误顺序具有负向覆盖。
- 当前 Godot 主场景、38 城地图、鼠标/触摸输入、选中反馈与开垦流程通过回归；MB01/MB02 runner、四时期数据验证、领域/表现测试、编辑器导入和主场景 headless 启动均通过。
- `npm run check` 持续通过；来源/包内容扫描无受限素材或浏览器运行时。三路最终只读审查（应用/领域/场景边界、事务确定性/fixture、Android/触控回归）P0/P1/P2 清零。

## Delegated Decisions and Unknowns

- 自主决定命令注册表、dispatcher、query service、结果错误码和会话 factory 的文件边界；优先让后续 MB05–MB11 只新增领域命令/适配器，而不修改 presentation 与状态所有权契约。
- 自主决定当前主场景默认使用时期 1 的哪位明确候选，但选择必须写入测试/文档并保持稳定；不得依赖 catalog/Dictionary 的偶然首项。
- 自主决定重复提交采用显式 command id、before 摘要乐观并发门或两者组合。必须证明同一用户意图不会被意外应用两次，并避免引入系统时间或随机 UUID。
- 可以保留 MB01 `execute_develop_farming` 作为薄兼容适配器，也可以让现有场景改用通用 `execute_command`；历史 fixture 和行为证据必须继续可运行。
- 本 Mission 只要求内存快照恢复演练。若现有样片 save repository 无法无歧义承载 v2，保留其 v1 用途并记录生产存档留给 MB20，不要在此扩大 schema。

## Autonomy and Approval Boundaries

- 已授权在当前迁移分支修改 Godot application/session/command/query 边界、当前 presentation 调度、共享 fixture、TS oracle 适配、测试和文档，运行 Godot 4.7.1/Web 检查并创建本地检查点提交。
- 可自主进行可逆重构和兼容适配，不需为内部文件组织、错误码、命令注册机制或测试分片暂停。
- 新依赖/下载、许可判断、删除历史证据、修改 MB00 固定条款、扩大到 MB05 规则、破坏性操作、推送/PR/发布或外部写入需要用户批准。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
