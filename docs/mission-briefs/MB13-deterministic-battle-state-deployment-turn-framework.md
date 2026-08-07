# Mission Brief: 确定性战斗状态、部署与回合框架

## Outcome

Godot 客户端拥有一个不依赖场景树的、可校验且可保存恢复的战斗领域切片：战略命令能够以明确的战斗输入创建战斗，战斗双方和部队拥有稳定的部署状态，回合推进、当前行动方、结束条件与最小战斗 receipt 均可由显式 seed 重放。TypeScript Web oracle、Godot、连续运行与恢复后对同一语言无关 JSON fixture 得到一致的战斗状态、日志、seed 和 canonical state SHA-256。该 Mission 只建立战斗状态边界，不声称已完成地形、路径、攻击伤害、技能、战术 AI 或完整战役回接。

## Context

- 仓库为 `D:\00_Ai\Codex\sanguo-baye-web`，自治委托以 `docs/mission-briefs/MB00-godot-full-migration-program.md`、`docs/migration/godot-program-roadmap.json`、`docs/migration/godot-program-state.json` 为准；MB12 已完成，报告为 `docs/migration/mission-reports/MB12-strategic-ai-and-turn-orchestration.md`。
- Web oracle 重点入口为 `src/core/battle.ts`、`src/core/tacticalBattle.ts`、`src/core/battleRecovery.ts`、`src/core/turn.ts`、`src/game/BattleScene.ts` 以及 `src/compat/baye/` 下的 tactical state/growth 适配；相关测试是 `src/core/battle.test.ts`、`src/core/tacticalBattle.test.ts`、`src/core/battleRecovery.test.ts`、`src/compat/baye/tacticalState.test.ts` 和 `src/compat/baye/tacticalBattle.test.ts`。
- 既有 Godot 战略 GameState、应用命令 envelope、canonical JSON/SHA-256、validator、保存仓储和 fixture runner 是复用边界。战斗核心必须继续保持 RefCounted/纯数据域，Node、Control、Camera 和场景只能在后续 presentation Mission 中消费快照与派发命令。
- MB13 是 MB14–MB19 的前置：后续 Mission 将在此状态边界上加入战场地形/路径、攻击伤害、技能装备、战术 AI、原生战场表现和战役结算。

## Required Behaviors

- 定义可序列化的 Godot battle state contract，至少包含 battle id、campaign/战略来源、seed、回合索引、phase、active side、双方 faction/officer/unit roster、deployment slots、已行动集合、battle log 和 outcome/ended 标记；字段顺序和所有影响结果的集合均由显式数组或排序保证。
- 以事务命令创建战斗并验证输入：来源城/目标城、攻守势力、参与武将与初始部队必须来自合法战略快照；无效来源、重复 unit/officer、空部署、敌我同属、已结束战役或重复命令必须安全拒绝且不改变 GameState/RNG。
- 提供最小部署操作：按确定顺序添加、移动、撤下己方候选部队/武将；越界、占用、敌方 slot、重复实体、超过 roster 或已行动实体必须返回稳定错误 receipt。
- 提供最小回合框架：部署确认后进入 battle turn，严格按 side/turn/initiative 的明确顺序切换行动方；实现 `end_unit_turn`/`end_side_turn` 或等价最小命令、行动集合清理、回合上限/无可行动单位的结束 guard，并在每个事务后运行 validator。
- 为创建、部署、回合推进、重复/过期 digest、保存恢复和确定性 RNG 消耗建立语言无关 JSON fixture；TypeScript 生成 oracle expected receipt、日志、seed、完整 canonical state SHA-256，Godot runner 逐案比较。至少包含正常两回合、无效部署边界、重复命令、恢复后下一步和 battle ended guard。
- 战斗领域不得执行攻击伤害、地形寻路、技能效果、战术 AI 或随机战斗结算；这些必须以明确的后续边界/unsupported receipt 保留，避免提前发明规则。战略月循环仍可将战斗创建视为待定入口，不得破坏 MB12 的月循环 SHA。
- 可以提供最小应用层 battle session/command adapter，使测试和后续场景能够创建/读取 battle snapshot；不把 BattleState 挂到现有主场景树，不引入 WebView、TypeScript runtime、JSBridge 或浏览器依赖。

## Constraints

- 必须使用 Godot 4.7.1 official `a13da4feb` 与 GDScript；使用现有项目的显式 LCG、canonical JSON、validator 和命令 envelope，不使用 Godot 默认随机数，也不依赖 Dictionary 遍历顺序。
- 保留 TypeScript Web 版、现有 Godot 战略边界、数据路径和 `npm run check`；不得改变 oracle 只为通过 fixture。`references/vendor/baye-c-core/` 仅为只读证据。
- 不导入或提交原版受限数据/图片/字体/音频/视频/WASM、`.lib`、`dat.lib.orig`、`.reference/` 内容或许可证不明素材；不把战术参考实现直接变为应用依赖。
- 不承担完整战术迁移、正式战场美术、真实 Android 战场体验、生产多槽存档、发布签名或完整战略 UI；这些属于 MB14–MB25。
- 不提交 main、不推送、不创建 PR。组件下载/安装、改变 MB00 固定条款、许可决定和发布操作需要用户确认；允许本地验证、忽略产物和阶段性本地提交。

## Non-goals

- 不实现地形格、道路/障碍、单位移动路径、攻击/伤害/状态效果、技能/装备特殊效果、敌我战术 AI、撤退/结算和战略月循环完整战役回接。
- 不在场景树中保存权威 BattleState，不把 BattleState 作为 Node/Control 属性的隐式副本，不制作只满足截图的假战斗。
- 不为了覆盖全部旧存档而提前承诺完整 schema 迁移；只定义后续 Mission 可扩展的最小版本化战斗 contract。

## Evidence of Completion

- `godot/src/domain/tactical/`、`godot/src/application/...` 与必要 fixture/runner 具备清晰的 domain/application 边界；Godot 领域测试、应用验证、项目导入/主场景验证无脚本错误。
- TypeScript 与 Godot 至少逐案比较 battle create、deployment、turn advance、invalid/no-op、duplicate/stale、ended guard、save/restore continuation 的 receipt、日志、state SHA-256、seed、phase/turn/active side；fixture 明确标注哪些规则仍 deferred。
- 现有 `npm run check`、`npm run godot:project:verify`、`npm run godot:application-session:verify` 通过；MB12 的 250 cases/1689 assertions 不回归。
- 报告 `docs/migration/mission-reports/MB13-deterministic-battle-state-deployment-turn-framework.md` 记录 contract 版本、oracle 对照、失败边界、RNG 语义、未迁移范围、审查结果和人工复验步骤。
- 完成前派发三路只读审查：Godot 架构/场景边界、确定性 battle fixture、Android/输入边界；修复本 Mission 引入的 P0/P1/P2，再决定是否晋级 MB14。若 Android 导出模板仍缺失，只记录平台证据风险，不绕过授权安装。

## Delegated Decisions and Unknowns

- 自主决定 BattleState、Deployment、BattleCommand、validator、fixture schema、receipt DTO 和最小应用 adapter 的命名与目录，只要它们保持版本化、可序列化、无场景权威状态并与 Web oracle 对照。
- 自主读取和比对 Web `battle.ts`、`tacticalBattle.ts`、`battleRecovery.ts` 与 compat tactical tests；遇到未完成的战斗规则，明确标为 deferred，不用猜测补齐。
- 对原版证据不足的 initiative、slot 数量、默认 side 顺序或回合上限，优先采用当前 Web/modern ruleset 已有语义；若语义无法由 oracle 证明，建立 provisional fixture 和后续决策记录，不提升原版一致性等级。

## Autonomy and Approval Boundaries

- 已授权在当前迁移分支内阅读/修改仓库、运行测试、生成 fixture/忽略构建产物、使用已安装 Godot/Android 工具和创建本地阶段性提交。
- 下载/安装 Godot export template 或其他组件、破坏性 Git/文件操作、改变 MB00 固定条款、许可/素材决定、推送、PR、发布 APK/AAB 或签名需要用户明确确认。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant Web oracle and existing Godot boundaries, implement the smallest credible deterministic battle state/deployment/turn slice, validate it against fixtures and current regression suites, and document evidence and deferred rules. Continue until the outcome is credibly verified; preserve MB00 and MB12 contracts when implementation details conflict with assumptions. Do not stop at a generic design proposal.
