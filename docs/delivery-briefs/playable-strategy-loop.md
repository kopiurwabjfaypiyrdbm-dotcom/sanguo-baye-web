# Delivery Brief: 城市经营、出征与月度推进形成首个可玩闭环

## Outcome

玩家能够从当前战略地图完成一次有意义且可重复的游戏循环：选择己方城池和执行武将，进行城市经营或征兵，向相邻敌对城池出征并看到自动战斗结果，随后结束月份并观察 AI 行动、资源结算和年月推进。该循环同时适用于内置演示剧本和本地载入的原版时期 1 数据。

## Context

- 项目目标是复刻步步高电子词典版《三国霸业》，当前重心是“解析、验证和现代化呈现”，但产品推进优先于长期考据。
- 原版时期 1 数据导入、君主切换、战略地图和城池详情已接通；城市命令与“结束本月”仍是不可操作的预览状态。
- 现有纯 TypeScript 核心已经提供确定性战斗、基础 AI、月度增长、日志和状态校验。权威边界见 `docs/design/compatibility-policy.md`、`references/parity-matrix.md` 以及 `src/core/`、`src/data/legacyScenario.ts`。
- 原始 `.lib` 文件只作为用户本地参考数据使用，不进入仓库；浏览器端载入是既有的兼容边界。

## Required Behaviors

- 玩家命令只作用于当前玩家势力拥有的城池；界面明确呈现可执行武将、相邻敌对目标、资源不足或条件不满足的原因。
- 开垦与征兵会消耗明确的资源或武将体力并产生可见、可验证的状态变化；数值不得越过已知上限或形成负资源。
- 出征使用驻扎在出发城、拥有兵力与体力的玩家武将，目标必须是相邻敌对城池；战斗结算后城池归属、兵力、武将位置、地图、详情和日志保持一致。
- 结束本月会完成非玩家势力的基础行动、全局月度结算和年月推进，并将控制权恢复给玩家；处理期间不得允许重复提交命令。
- 同一状态与随机种子产生同一结果。内置演示剧本和原版时期 1 转换状态在完成代表性循环后仍通过现有状态校验。
- 中立城池可以成为攻击目标，但中立势力不获得独立 AI 回合；本地原版资源的载入方式及“不提交原始资源”边界保持不变。

## Constraints

- 规则和状态变化归属纯 TypeScript 核心层，React/Phaser 只负责交互与呈现，不在 UI 中复制领域规则。
- 遇到尚未确认的原版数值时，可以采用小而明确、确定性、易替换的临时规则，并在兼容性资料中标明状态；仅在阻塞可玩闭环时追加原版考据。
- 保持现有数据模型、不可变状态更新、确定性随机数和状态校验约定。
- 不提交原版 `.lib`、第三方仓库副本或来源不明的美术资源。

## Non-goals

- 本阶段不追求所有原版城市命令、数值与逐步操作完全一致。
- 不实现手动战斗、完整外交、人才系统、存档、胜负结算、全部历史时期或完整 AI 策略。
- 不进行全面美术重制、移动端深度适配或包体性能专项优化。

## Evidence of Completion

- 自动化测试从核心层覆盖经营、征兵、非法命令、出征和月度推进，并验证状态不变量与确定性。
- 在浏览器中分别使用内置剧本和本地原版时期 1 数据完成代表性操作，确认地图、城池面板、日志和年月同步更新。
- `npm test`、`npm run build` 与差异检查通过；兼容性资料能区分已验证的原版行为与当前临时产品规则。

## Delegated Decisions and Unknowns

- 经营与征兵的暂定消耗、收益公式，以及单次出征选择一名还是多名武将，由执行者依据“简单、可解释、确定性、以后易替换”为原则决定。
- 命令界面采用内联控件、抽屉或轻量弹层均可，优先保证当前桌面布局中的操作清楚，并避免遮挡战略地图的主要反馈。
- AI 在本阶段可继续复用已有的单次自动出征策略；只有实际试玩暴露严重阻塞时才调整其节奏或阈值。

## Autonomy and Approval Boundaries

- 可自主读取和修改本仓库文件、运行本地测试/构建/开发服务器，并使用用户已提供的本地参考仓库和 `.lib` 做只读验证。
- 不得提交、复制或发布原版受版权保护的资源；不得执行破坏性文件操作、外部发布、推送或产生费用的操作，除非得到用户明确确认。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
