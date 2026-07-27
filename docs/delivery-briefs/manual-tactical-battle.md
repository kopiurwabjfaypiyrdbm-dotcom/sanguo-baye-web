# Delivery Brief: 玩家可亲自完成一场战术战斗并返回连续战役

## Outcome

玩家在战略战役中参与进攻或防守时，可以选择亲自指挥，在现代 Web 战场上完成基础移动、普通攻击、待命和敌方回合，得到明确胜负后将伤亡、粮草、武将状态与城池归属可靠地写回战略地图并继续游玩。玩家也可以选择快速结算，非玩家势力之间的战斗不打断月度推演。

## Context

- 本项目以步步高电子词典版《三国霸业》为规则和体验基线，产品推进优先，原版行为通过固定 C 参考源码和可重复输出逐步恢复。
- 当前四时期、38 城战略战役、人事与内政命令、战略 AI、月度推进和存档已经可用；`src/core/battle.ts` 仍会立即完成自动结算，尚无战术状态和可操作战场。
- 原版战场入口、参数和战后处理以 `references/vendor/baye-c-core/src/citycmdd.c`、`Fight.c`、`FightSub.c`、`FgtCount.c` 与 `FgtPkAi.c` 为主要事实源。当前兼容证据与不确定性以 `references/parity-matrix.md` 为准。
- `src/compat/baye/tacticalBattle.ts` 已包含经过参考样本验证的攻防、普通伤害、兵种克制、地形修正和战略自动战斗公式，但尚未接管可玩流程。
- 架构、存档和许可边界见 `docs/HANDOFF.md`、`docs/design/compatibility-policy.md`、`AGENTS.md` 与 `CONTRIBUTING.md`。

## Required Behaviors

- 合法出征先形成不修改战略状态的战斗会话；手动战斗或快速结算完成后，只能以一次、原子化的结果更新当前战役。月份、随机种子、参战武将或城池归属已经变化的陈旧结果必须被拒绝。
- 玩家参与的战斗支持选择己方可行动单位、查看移动与攻击范围、移动、普通攻击、待命、结束本方阶段以及观察基础敌方 AI 行动。单位不能越界、重叠、重复行动、攻击非法目标或在兵力耗尽后继续行动。
- 战术核心保持纯 TypeScript、不可变状态更新和确定性随机；React 与 Phaser 只收集意图和呈现结果，不复制合法性、伤害、胜负或战后结算规则。
- 战场至少表达攻守双方、基础地形、目标城池格、兵力、粮草、战斗日和行动状态。普通攻击使用已经差异验证的原版兼容公式；尚未验证的初始化、移动或 AI 规则必须明确保持可替换的临时实现。
- 全军覆没、关键目标被占领或粮草耗尽能够结束战斗。结果正确处理参战兵力、剩余粮草、行动状态、败方撤退、太守补位、城池归属、日志、随机种子和战役胜负，并且通过现有完整性校验。
- 玩家可以在进入战场前选择亲自指挥、快速结算或取消。AI 对 AI 继续快速结算；玩家被 AI 进攻时不得静默跳过玩家已经选择的手动防守。
- 首轮采用战前与战后存档边界，不保存进行中的战术状态。刷新或退出未完成战斗后能够回到未被破坏的战前自动存档；战后保存能够正常续玩。
- 战斗场景可以反复进入和退出，不残留 Phaser 场景、事件监听器、计时器或额外开发服务器，不造成持续 CPU 异常。

## Constraints

- 保留现有快速结算、四时期剧本、战略 AI、月度推进、胜负判定和版本化存档能力；战术功能不得要求重新选择或打包原版 `.lib`。
- 每项原版一致性结论必须在 `references/parity-matrix.md` 中定位到固定参考文件、函数或可重复夹具；测试通过本身不能作为原版一致性声明。
- 不提交原版二进制、地图资源数组、图片、字体、音频、视频、WASM、未获许可文档或 `.reference/` 中未列入允许清单的文件。
- 现代化界面可以改变信息布局、输入方式、缩放和反馈表现，但不能在未记录的情况下改变已经验证的规则语义。

## Non-goals

- 本阶段不交付完整战术、技能、异常状态、天气、单挑、动画、战场地图全集或严格逐帧复现。
- 不同时扩展外交、历史事件、人物关系、道具装备、俘虏处置、全量美术生产或移动端专项适配。
- 不要求进行中的战斗可以保存和恢复；若未来加入，必须另行升级存档模型和迁移逻辑。

## Evidence of Completion

- 核心测试独立覆盖战斗创建不修改战略状态、移动与攻击合法性、原版普通伤害接线、阵营切换、基础 AI、确定性、三类胜负条件、陈旧/重复结果拒绝以及战后完整性。
- 集成测试证明玩家进攻胜败、玩家防守胜败、快速结算和 AI 对 AI 均能返回有效战略状态，并且存档前后不丢失城池、人物、粮草、行动状态、日志或随机种子。
- 浏览器中从随应用发布的时期剧本完成至少一场手动进攻和一场手动防守；连续进入多场战斗后地图、场景生命周期和 CPU 使用保持正常。
- `npm run check` 通过，生产构建成功，现有测试无回归；`references/parity-matrix.md` 与实际接入的兼容规则、临时规则和后置范围一致。

## Delegated Decisions and Unknowns

- 战术状态的文件拆分、场景组织、战场尺寸、第一批现代化占位图形和控制细节由执行者依据现有 React/Phaser 生命周期、可测试性和后续扩展成本决定。
- 原版地图数据若无法在许可边界内进入发布包，首个切片可以使用来源明确的结构化测试战场；应保持地图提供器可替换，并将其标记为现代临时内容。
- 原版移动、部署、粮草消耗或 AI 细节在事实源中仍不清楚时，执行者可以采用小而确定、可解释、可替换的规则，不得阻塞完整可玩闭环，也不得将其声明为已验证兼容。
- 若手动防守需要把 AI 月度推进改为可暂停流程，执行者可以调整应用编排，但必须保持非玩家回合确定性并防止重复执行。

## Autonomy and Approval Boundaries

- 可自主读取和修改本仓库文件、只读研究已入库或用户提供的本地参考资料、运行测试与构建、启动单个本地开发服务器并进行浏览器回归。
- 可自主新增来源明确的代码生成图形、结构化测试地图和本地测试夹具，但不得越过仓库许可约束或复制受限制资源。
- 推送、创建 PR、外部发布、安装产生系统级影响的工具、破坏性文件操作、引入来源或许可证不清的资产，以及扩大到非目标游戏系统，需要用户明确确认。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
