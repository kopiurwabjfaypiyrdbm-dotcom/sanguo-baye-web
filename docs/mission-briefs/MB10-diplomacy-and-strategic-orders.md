# Mission Brief: 原生 Godot 外交谋略与跨月战略命令闭环

## Outcome

Godot 战略客户端拥有与当前 TypeScript 产品确定性一致的外交谋略闭环：玩家依据当回合有效情报，从己方城市派遣武将执行离间、招揽、策反或劝降；命令以可验证、可保存的跨月状态运行，并在成功、失败、目标失效、出发城易主或势力变化后原子结算。人物、城市、势力、俘虏及在途命令始终保持合法，原生横屏界面不会泄露情报之外的敌方实时属性。

## Context

- 仓库位于 `D:\00_Ai\Codex\sanguo-baye-web`。长期委托、自治恢复协议和 Mission 注册表分别以 `docs/mission-briefs/MB00-godot-full-migration-program.md`、`docs/migration/godot-program-state.json`、`docs/migration/godot-program-roadmap.json` 为准；直接交接证据见 `docs/migration/mission-reports/MB09-reconnaissance-intelligence-visibility.md`。
- 当前 Web 行为 oracle 是 `src/core/diplomaticOrders.ts`、`src/core/diplomaticOrders.test.ts`、`src/compat/baye/diplomacy.ts`、`src/compat/baye/diplomacy.test.ts`、`src/core/rulesets.ts`、`src/core/validation.ts` 以及人物、势力、俘虏和战略命令的既有闭包。产品证据边界见 `references/diplomacy-notes.md` 与 `references/parity-matrix.md`。
- 固定参考入口包括 `references/vendor/baye-c-core/src/baye/order.h`、`citycmd.c:AlienateDrv/CanvassDrv/CounterespiongeDrv/InduceDrv` 与相应 `citycmdc.c:*Make`。随机比较顺序、整数宽度和主要成功结果有固定证据；运行时成本表、`TimeCount` 在现代月循环中的单位及规范化状态闭包仍包含产品决策，不能笼统提升为原设备一致。
- Godot 已有纯领域 `GameState`、显式 LCG seed、事务式 command envelope、规则身份成本、canonical JSON/SHA-256、生产 validator、保存恢复、情报快照、跨城战略命令和原生城市空间菜单。外交必须进入这些共同边界，不建立场景树状态、独立随机源或旁路归属模型。

## Required Behaviors

- 四类命令都明确来源城、执行武将、情报中锁定的目标人物、规则身份成本、创建时间和剩余月份。执行者必须合法驻城、未行动且没有其他活动命令；签发一次性原子扣费、扣体力、离城占用、登记行动、分配稳定序号并记录可见日志，拒绝不提交部分状态或消耗 RNG。
- 玩家只能从当前 turn 的侦察报告及其中保存的人物 ID 选择敌方目标。目标列表和禁用反馈不得通过排序、文本或查询 DTO 泄露实时忠诚、智力、位置或未报告人物；旧报告、缺少人物名单的兼容报告及目标已经变化的情报不能继续锁定目标。
- 命令按数字序号稳定结算。合法目标才执行固定参考支持的随机调用序列、无符号整数宽度、严格比较方向与对话占位 RNG 消耗；相同状态、命令和 seed 在 TypeScript、Godot、连续运行及保存恢复后得到相同结果和最终 seed。目标失效、优势条件失效或执行者状态改变的路径不误耗随机数。
- 离间只降低合法普通敌将忠诚；招揽把成功目标原子转入执行方并重置忠诚；策反使合法非君主太守及其城池形成有效新势力；劝降只在城池优势条件成立时吸收目标君主势力。所有成功闭包复用既有太守、失地人物、俘虏羁押/解放、在途命令终止、势力序列和校验不变量，不产生重复人物、孤儿君主、无效归属或资源复制。
- 结算后执行者优先返回仍属原势力的来源城，否则使用稳定后备城；所属势力失去全部城市时安全转为在野。战役结束或相关势力被吸收时，所有外交及受影响战略命令按稳定顺序安全终止并留下与玩家可见性相符的日志。
- `diplomaticOrders` 与 `nextDiplomaticOrderSerial` 成为 Godot 正式 runtime 状态，由 closed-shape 和关系 validator 约束记录键、序号、类型、引用、创建时间、持续时间、成本、活动武将唯一性及与当前 turn/calendar 的一致性；畸形状态被明确拒绝而不崩溃或污染会话。
- 原生战略交互提供四类谋略、来源、执行者、目标、成本、预计回报时间、禁用原因、进行中状态与结算反馈。信息语义不依赖颜色或动画；Godot 原生空间连线、节点反馈、Tween、Shader 或粒子可表现派遣与回报，但动画不控制领域提交。
- 横屏触摸与鼠标在 1280×720、844×390 下可完成代表性签发、查看在途状态和结算反馈；主要触控目标可用，长人物/势力文本不会遮挡关键状态，敌方实时敏感字段不进入 presentation 缓存或场景节点。

## Constraints

- 必须使用 Godot 4.7.1 official `a13da4feb` 与 GDScript。领域状态、外交规则、随机判定、排序、校验和保存恢复不挂在场景树中；Node/Control 只处理输入、表现和应用层调度。
- TypeScript 产品是本 Mission 的行为 oracle；语言无关 fixture 必须比较命令结果、receipt、日志、订单、人物/城市/势力闭包、完整 canonical state SHA-256 与精确 seed。不得使用 Godot RNG、`Dictionary` 遍历顺序、本地化排序、渲染时钟或动画完成影响结果。
- 规则身份成本以当前 Web `rulesets.ts` 为跨客户端契约；固定参考缺少的运行时表和现代一月持续时间必须如实标注。不得为迎合实现而改写 oracle、fixture 期望或证据等级。
- 保留现有 Web 产品及路径，`npm run check` 必须继续通过。Godot APK 不嵌入 TypeScript、JavaScript、WebView、JSBridge 或浏览器运行时。
- `references/vendor/baye-c-core/` 只读且不进入构建；不得导入或提交受限原版数据、图片、字体、音频、视频、WASM、`.reference/` 内容或许可证不明素材。合法资产继续保留来源记录。
- 不直接提交到 `main`，不推送、不创建 PR、不发布 APK/AAB。可以在当前迁移分支创建可回退的本地阶段提交。

## Non-goals

- 战略 AI 发起谋略及完整月循环编排属于 MB12；本 Mission 只保证可供后续 AI 调用的确定性领域与应用接口。
- 反间空壳、朝贡、联盟、停战、婚姻、人物关系网及现代条约不在本委托范围。
- 完整事件、继承与结局编排属于 MB11；生产多槽存档、完整战略导航和正式美术分别属于 MB20、MB21 及后续客户端 Mission。

## Evidence of Completion

- 共享语言无关 fixture 覆盖四类命令的签发与月度结算、经典/现代成本、成功/失败、固定 RNG 调用位置、序号 9/10 次序、装备后的有效智力、情报过期、目标或势力变化、出发城易主、失地执行者、策反建势力、劝降吸收、俘虏和在途命令闭包、保存恢复及主要非法输入；TypeScript 与 Godot 的 result、receipt、日志、完整 state SHA 和 seed 一致。
- Godot 领域、应用、validator、presentation 和输入测试独立证明原子性、稳定排序、closed-shape、防情报泄露、合法归属闭包、命令占用与移动/外交互斥、无随机失效路径及小屏触控。指定 Godot 4.7.1 可无错误导入并从现有主场景运行，Web `npm run check` 通过。
- Android Debug APK 由指定引擎重新导出，包内容不含 Web runtime、测试 fixture 或受限素材；在 MuMu 至少覆盖安装并离线启动，1280×720 与 844×390 均实际验证谋略入口、情报目标、签发、在途状态和结算反馈，日志无脚本错误或致命异常。模拟器证据不表述为真机证据。
- 完成报告 `docs/migration/mission-reports/MB10-diplomacy-and-strategic-orders.md` 记录规则身份、fixture/SHA/seed、归属闭包、保存恢复、设备结果、包审计、已知风险和人工验收步骤；`references/diplomacy-notes.md` 与 `references/parity-matrix.md` 同步固定证据、现代闭包和 provisional 数值的准确等级。
- 实施完成后进行自检，并派发三路只读审查：Godot 架构与场景树、确定性外交规则与 fixture、Android/触控与情报可见性。修复 P0、P1 和本 Mission 引入的 P2 后才可关闭 MB10。

## Delegated Decisions and Unknowns

- 自主决定领域模块、共享归属闭包、adapter/query、在途模型、面板和视觉反馈的具体组织，以复用当前 GameSession、MB08 战略命令、MB09 可见性 DTO 和小屏 presentation 测试基架为原则。
- 自主调查并固定 Web validator 与外交结算的完整实际契约，包括动态反叛势力复用、俘虏、旧势力在途人物和日志可见性；发现 Web contract 自相矛盾时以可复现测试和最小产品修复收敛，不能在 Godot 端静默分叉。
- 原版运行时成本、时间单位、对话文本和部分异常闭包证据不足时，保留 ruleset/现代产品语义或 provisional 标记；不为追求未经证实的“原版感”改变当前可运行 oracle。

## Autonomy and Approval Boundaries

- 已授权在当前迁移分支内调查和修改仓库文件、运行测试与构建、生成被忽略的本地产物、使用已安装工具、在已连接 MuMu/测试设备安装调试包，以及创建阶段性本地提交。
- 下载或安装组件、使用新外部服务或凭据、破坏性 Git/文件操作、修改长期委托固定条款、素材许可决定、推送、PR、发布、签名或其他外部写入需要用户确认。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
