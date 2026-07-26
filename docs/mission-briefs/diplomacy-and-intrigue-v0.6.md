# Mission Brief: 外交谋略成为长期战役中的可用战略路径

## Outcome

玩家和战略 AI 不必只靠内政与攻城扩张；离间、招揽、策反和劝降能够利用武将能力、忠诚、情报、资源与执行时间改变人物或势力归属，并在成功、失败、目标失效与保存重载后保持清晰、确定和合法。

## Context

- 当前 Alpha 有搜索登用、俘虏招降、侦察和军事扩张，但没有原版外交菜单的可玩闭环。
- `references/vendor/baye-c-core/src/baye/order.h`、`citycmd.c:AlienateDrv/CanvassDrv/CounterespiongeDrv/InduceDrv`、`citycmdc.c` 与 `tactic.c:ComputerTacticDiplomatism` 是本阶段第一事实源。
- 固定参考中的“反间”生成函数为空壳，朝贡被注释；结盟、婚姻和条约也不是当前证据支持的硬性原版范围。
- 本阶段应复用前序 `strategic-orders-and-logistics-v0.4` 的跨月命令不变量，以及 `city-events-and-annual-progression-v0.5` 的月份、人物登场和情报状态；真实基线仍以 `docs/HANDOFF.md` 与 `references/parity-matrix.md` 为准。

## Required Behaviors

- 离间可以在合法目标上影响敌将忠诚；招揽可以争取敌方普通武将；策反可以围绕敌方太守产生经证据支持的归属或城市后果；劝降可以针对敌方君主并处理势力级结果。
- 每项谋略明确执行武将、目标、来源城市、成本、耗时、成功/失败结果和完整日志；执行中武将遵守统一命令占用规则。
- 目标死亡、被俘、移动、改变势力、失去太守身份、势力灭亡或战役结束时，命令安全完成、改写或失效，不产生重复人物、无主城市、失效君主或资源复制。
- 随机调用位置、范围、取模、比较方向和概率边界优先与固定参考一致；正式游戏使用版本化确定性随机，保存前后和相同命令重放得到相同结果。
- 谋略目标与反馈遵守情报边界；玩家不会因打开命令界面免费获得全部敌城动态状态，UI 对已知信息、不确定结果和禁用原因作清晰区分。
- 战略 AI 能根据人物忠诚、君主性格、邻接压力、资源和机会成本有限度地使用谋略，也能在人物流失或策反后恢复太守、城市和后续计划。
- 所有归属变化复用核心人物、势力、城市与胜负不变量；UI 不自行修改忠诚或归属。
- 新状态和结果进入版本化存档、迁移、校验、月报和长期回归。

## Constraints

- 只交付固定参考中有实质行为的外交谋略；反间、朝贡、结盟、婚姻、人物关系网和现代条约不因菜单名称而自动进入范围。
- 兼容概率与状态转换进入 `src/compat/baye/` 或有清晰证据边界的核心规则；缺失资源常量可以采用可替换临时值，但必须标注。
- 策反与劝降可能触发城市易主或势力灭亡，必须使用既有原子归属、太守、君主、俘虏、在途命令和胜负处理，不能建立旁路。
- 以可玩的纵向增量推进；相关测试持续通过，稳定检查点运行 `npm run check`、浏览器验收，并经过规则/状态、UI/存档、证据/许可证三个只读审查视角和修复闭环。
- 遵守 `AGENTS.md`；不推送、不发布、不执行外部写入或破坏性操作，不导入许可证不明原版资产、资源或 GPL 实现。

## Non-goals

- 不实现联盟、停战、婚姻、朝贡、完整人物关系或大规模历史剧情。
- 不在本阶段完成战死、处斩、继承和装备缴获；谋略触发的既有势力灭亡规则必须保持合法。
- 不把现代概率提示做成无条件精确成功率泄露。

## Evidence of Completion

- `npm run check` 通过；四类谋略的成功、失败、成本、耗时、目标失效、归属闭包、迁移与确定性均有自动化覆盖。
- 长期回归覆盖玩家和 AI 使用谋略、目标在命令期间变化、策反导致太守或城市变化、劝降导致势力结束，以及保存重载后的同结果。
- 浏览器从已知情报选择目标，实际完成至少一次成功和一次失败或失效的谋略，并能从日志、人物、城市和势力界面核对结果；控制台无应用错误。
- 四时期的 AI 战役不会因外交循环、同月重复目标、无效君主、孤儿命令或频繁归属震荡而卡死。
- 三个独立只读审查视角完成，所有 P0/P1 和本阶段引入的 P2 已修复或有可信非阻塞说明。
- 一致性矩阵、来源记录、README 与交接文档准确说明哪些谋略已验证、哪些数值临时、哪些所谓外交能力并非固定原版范围。

## Delegated Decisions and Unknowns

- 执行者可依据现有情报系统决定目标发现、概率预览与失败反馈的现代化呈现；优先防止信息泄露并让玩家理解风险。
- 原版外交 `TimeCount`、资源成本或 U8 回绕存在版本差异时，应保留证据明确的兼容分支或版本化现代规则，不自动猜测。
- 策反成功后的城市、驻将和在途命令处理应从固定参考与现有状态不变量综合确定；选择必须保证原子性和长期战役稳定。
- AI 的谋略频率和机会阈值由执行者通过确定性长期回归调节，避免压倒军事与经营循环。

## Autonomy and Approval Boundaries

- 可自主修改本仓库、只读研究固定参考、运行测试/构建/长期推演、复用单个本地开发服务器、执行浏览器验收、更新文档、创建本地检查点提交并派发只读子智能体审查。
- 可自行修复发现的规则、状态、AI、UI、存档与证据问题，只要不引入未确认外交系统或改变许可证政策。
- 需要联盟等范围扩张、外部发布/写入、来源不明资产、费用、不可逆操作或兼容政策变更时必须请求用户确认。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
