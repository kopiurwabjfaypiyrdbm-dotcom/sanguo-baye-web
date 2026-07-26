# Mission Brief: 战略命令具有可恢复的跨月执行与后勤深度

## Outcome

玩家和战略 AI 可以围绕道路距离、武将占用时间与城市资源进行持续数月的调度决策；移动、输送和主要原版城市命令不再是彼此孤立的即时按钮，而是形成可查看、可保存、会完成或安全失效的战略命令体系。

## Context

- 本仓库是步步高电子词典版《三国霸业》的现代 Web 重写；当前功能完整 Alpha 的能力、验证基线和缺口以 `docs/HANDOFF.md`、`README.md` 与 `references/parity-matrix.md` 为准。
- 当前武将以 `actedOfficerIds` 表示月内占用，调动仅限相邻己城且即时完成；原版 `references/vendor/baye-c-core/src/baye/order.h` 的 `OrderType`、`citycmd*.c` 与 `PublicFun.c:SearchRoad` 表明部分命令具有队列、目标和时间语义。
- 当前已有开垦、征兵、分配、搜寻、赏赐、侦察、调动和出征；招商、治理、出巡、交易、宴请、输送与掠夺尚未形成可玩闭环。
- 兼容声明、代码分层、参考与许可证边界由 `AGENTS.md`、`CONTRIBUTING.md` 和 `docs/design/compatibility-policy.md` 约束。

## Required Behaviors

- 跨月命令是版本化战役状态的一部分；执行武将、来源、目标、负载、创建时间、剩余时间和失效状态在保存重载后保持一致。
- 在职武将必须且只能驻城或绑定一条有效的执行中命令；在途或忙碌武将不能重复行动、守城、出征或同时出现在城市队列。
- 玩家和 AI 可以按道路连通性调动武将，并在己方城市之间输送金钱、粮草与后备兵；资源在创建、在途、抵达、取消或失效时不复制、不丢失、不变负。
- 城市经营至少补齐招商、治理、出巡、交易、宴请与掠夺，使商业、防灾、民忠、人口、体力、忠诚和资源转换产生清晰可见的战略取舍。
- 太守离城、目标易主、势力灭亡、君主在途和连续 AI 守城等边界都有确定且可恢复的处理，不会卡住月度推进。
- UI 显示执行中命令、路线或目标、负载、剩余时间、预计完成时间与禁用/失效原因；核心层决定合法性，UI 只收集意图和呈现结果。
- 新的 AI 行为遵守与玩家相同的资源、武将占用、道路和命令数量约束，并保持确定性。
- 持久状态变化包含旧存档迁移、完整性校验、损坏数据拒绝和相同存档同命令同结果的回归。

## Constraints

- 固定 MIT C 参考是命令结构、道路与原版语义的第一事实源；资源表或运行时常量缺失时可使用隔离、可替换的临时规则，但不得宣称原版一致。
- 可玩领域状态进入 `src/core/`，有独立证据支持的兼容算法进入 `src/compat/baye/`；React 不复制命令合法性、成本、距离或结算规则。
- 保持不可变状态更新、确定性随机、版本化存档与完整操作后的状态校验。
- 以可玩的纵向增量推进；每个稳定增量运行相关测试，阶段检查点运行 `npm run check`，浏览器验证真实流程，并在修复后接受规则/状态、UI/存档、原版证据/许可证的独立只读审查。
- 不推送、不发布、不执行外部写入或破坏性操作，不导入原版 `.lib`、字体、图片、音视频、WASM、GPL 离线实现或许可证不明资料。

## Non-goals

- 本阶段不交付外交谋略、完整灾害与年度登场、人物死亡继承或原版全量战术。
- 不以逐像素复刻原版命令菜单为目标；现代界面可以分组、解释和预览命令。
- 不为命令系统引入云存档、账号、多人联机或通用任务编排框架。

## Evidence of Completion

- `npm run check` 通过；新增命令、路线、状态闭包、迁移、损坏数据和确定性测试覆盖代表性成功与失败路径。
- 四时期至少各连续运行 36 个月，并覆盖每 6 个月保存重载、一城弱势君主、长途移动、资源输送、目标易主和势力灭亡。
- 浏览器完成“创建跨月调动或输送—结束月份—保存重载—抵达并核对状态”的流程，并实际执行新增城市命令；控制台没有应用错误。
- 三个独立只读审查视角完成，所有 P0/P1 和本阶段引入的 P2 均修复或有可信的非阻塞说明。
- `README.md`、`docs/HANDOFF.md`、`references/parity-matrix.md` 与 `references/provenance/` 准确记录新增能力、兼容证据、临时规则和下一阶段依赖。

## Delegated Decisions and Unknowns

- 执行者可根据现有状态不变量选择命令、位置和在途状态的具体建模方式；优先保证人物唯一归属、战斗可恢复性和未来外交复用。
- 原版 `TimeCount` 的时间单位、队列阶段和资源扣除时点应先用固定 C 参考和可重复夹具确定；证据不足且阻塞产品增量时，采用小而显式的现代规则并记录替换点。
- 是否允许取消、何时退款、路线如何展示以及相同距离的路径选择由执行者依据确定性、玩家可理解性和未来兼容成本决定。
- 存档 schema 版本号与增量拆分由执行者按实际兼容影响决定，不预设实现顺序。

## Autonomy and Approval Boundaries

- 可自主读取和修改本仓库、只读研究已入库参考、运行测试和构建、复用单个本地开发服务器、执行浏览器验收、更新文档、创建小型本地检查点提交，并派发只读子智能体审查。
- 可自行修复测试、浏览器和审查发现，只要修复不扩大本阶段产品范围或改变许可证/兼容政策。
- 只有需要外部写入或发布、采用许可证不明资产、改变顶层兼容政策、产生费用、执行不可逆操作或在多个实质不同产品方案间必须由用户取舍时才暂停请求确认。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
