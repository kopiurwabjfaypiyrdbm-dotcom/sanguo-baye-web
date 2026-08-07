# Mission Brief: MB15 — 攻击、伤害、状态与部队溃退

## Mission identity

- Mission ID: `MB15`
- Program: `godot-full-migration`
- Depends on: `MB13`; consume MB14 terrain/path API when target selection requires it
- Wave: `tactical-complete`
- Branch: `codex/godot-migration-spike`
- Engine: Godot `4.7.1-stable`; language: GDScript

## Outcome

在 MB13 的战斗状态/回合合同和 MB14 的版本化战场移动之上，移植一条真实、可重放的普通攻击切片。Godot 必须能够根据单位类型、距离、地形、攻防属性、兵力、天气和现有状态判断攻击目标，生成与 TypeScript oracle 一致的预览和确定性伤害结果，并在目标兵力归零时记录溃退/失活状态而不提前实现完整战后结算。

完成标准是同一输入 JSON、显式 seed 和 snapshot 在 TypeScript 与 Godot 中得到一致的 attackable target list、preview、damage、troops/status/acted/moved 变化、experience receipt、日志、before/after SHA、错误 envelope 和不变/推进的 RNG 语义。权威规则仍然是纯领域对象，场景树只在更晚的表现 Mission 消费 receipt 和 snapshot。

## Context and evidence

先阅读并引用：

- `src/core/tacticalBattle.ts`：`getAttackableUnitIds`、`previewTacticalAttack`、`attackTacticalUnit`、`isNormalAttackTarget`、`getModernTerrainShift`、`calculateBayeBattleExperience`、状态/天气影响。
- `src/compat/baye/tacticalBattle.ts` 与 `src/compat/baye/tacticalState.ts`：攻击属性、兵种修正、地形移动/战斗替代表和状态语义。
- `godot/src/domain/tactical/battlefield.gd`、`battle_commands.gd`、`tactical_battle_session.gd`：MB14 terrain lookup、事务 envelope、移动状态和恢复边界。
- `tests/` 中 tactical battle、damage、status、save/replay 的测试与 fixture；`docs/migration/mission-reports/MB14-battlefields-terrain-pathfinding-movement.md`。
- `references/parity-matrix.md`：攻击属性、普通攻击伤害、天气/状态和战后经验的证据等级。

若 Web 没有同形状的命令 session API，允许用清楚命名的 adapter 包装领域函数；但至少一个正常攻击、一个失败攻击和一个伤害/状态结果必须直接来自真实 Web API，而不是仅由脚本重写公式。原版 C 仍是只读证据，不得成为 Godot 构建依赖。

## In scope

1. 在 `TacticalBattleState` snapshot 中建立版本化攻击结果字段，保持 MB13/14 fixture 可恢复；为单位增加攻击相关的严格类型校验和必要的 status/experience 字段。
2. 实现可攻击目标查询和普通攻击 preview：攻击范围/兵种形状、己方/敌方/存活/隐藏目标、控制区和地形/天气/状态修正必须有明确的排序和拒绝顺序。
3. 实现普通攻击事务：校验 phase、activeSide、acted、deployed、troops、目标有效性和攻击范围；复制输入、应用伤害/状态/行动标记、更新经验/日志、再校验 snapshot；失败不改变状态。
4. 保留显式 seed 语义：若 oracle 普通攻击不消费 RNG，receipt 证明 seed 不变；若某个状态/伤害分支确实消费 LCG，只按 Web 调用顺序接入，不使用 Godot 默认 RNG。
5. 明确目标兵力归零、攻击单位行动后重复攻击、隐藏目标、己方目标、越界/未知目标、stale digest、duplicate/conflicting command id、错误参数和损坏恢复的边界语义；溃退状态只表达战术单位不可行动，不执行城池/战役结算。
6. 生成 `godot/data/fixtures/tactical-battle-attack-v1.json`，包含至少 6 个正常查询/攻击结果、10 个失败或恢复边界、同 seed 的 preview/execute 对照和至少一个目标归零案例。
7. 添加 Godot 4.7.1 headless runner、TypeScript fixture/check/verify npm scripts，并保持 MB13/MB14、application、project、Web `npm run check` 通过。
8. 更新 parity matrix、Mission report、程序状态和人工复验步骤；对 `BattleState` 仍不引入 Node/Control/SceneTree 依赖。

## Explicitly out of scope

- 技能/计谋、特殊装备效果、复杂状态施加规则和战术 AI；属于 MB16/MB17。
- 撤退确认、战斗胜负、战后经验入战略 GameState、粮草结算和战役回接；属于 MB19。
- 战斗场景、Camera、Canvas/UI、动画、粒子、触控与 Android 设备验收；属于 MB18/MB22。
- 全量战术地图重制、原版资源导入、WebView/JSBridge/TypeScript runtime、Godot 默认随机数、受限原版图片/字体/音频/视频/WASM/`.lib`。

## Architecture and determinism constraints

- GameState/TacticalBattleState、攻击 preview、伤害、状态和命令均为 scene-independent `RefCounted`；UI 只消费 snapshot/receipt。
- 所有事务遵循复制→校验→应用→再校验；任何失败不能改变 state、logs、experience 或 seed。
- units、targets、attackable ids、logs、acted ids 和 experience entries 在结果/序列化前显式排序；禁止依赖 Dictionary 遍历顺序。
- canonical JSON/SHA 合同沿用 MB02–MB14；receipt 必须可定位 command id、before/after battle SHA、seedBefore/seedAfter、preview/damage 和受影响单位。
- 不把“现代替代规则”写成原版兼容断言；无法由源码或重复输出证明的地形/状态/经验语义标为 provisional，并写入 parity matrix。

## Required deliverables

- `godot/src/domain/tactical/` 的 attack preview、damage/status、validator 和 command 实现。
- `godot/src/application/tactical_battle/tactical_battle_session.gd` 的 attack command dispatch 与恢复支持。
- TypeScript oracle fixture generator、JSON fixture、Godot runner、npm verification scripts。
- `docs/migration/mission-reports/MB15-attacks-damage-status-defeat.md`。
- `references/parity-matrix.md` 的攻击/伤害/状态/经验来源、fixture hash、provisional 说明。
- 至少 20 个跨语言断言，其中 6 个正常查询/攻击、10 个失败/恢复、1 个目标归零、1 个同 seed preview/execute 对照。

## Verification gates

1. `npm run godot:tactical-battle:verify`、`npm run godot:tactical-movement:verify`、`npm run godot:project:verify`、`npm run godot:application-session:verify` 和 `npm run check` 全部通过。
2. 攻击 fixture 在 TypeScript/Godot 逐字段一致：target list、preview、damage、status/troops、acted/moved、experience、logs、SHA、error envelope、seed。
3. 从 MB13/MB14 snapshot 保存/恢复后继续攻击与失败重放一致；恶意 `armsType`、damage/status、target id、坐标、数值类型和非有限数拒绝且不改变 seed。
4. 三路只读审查：架构/场景树、确定性/fixture、Android/触控；P0/P1 必须修复，新增 P2 必须写入报告并指向 MB16/18/19。
5. 本 Mission 不触及 project/export/presentation 时不要求重新 APK；若修改入口或输入，必须按现有基线重新跑双横屏尺寸检查。

## Completion and handoff

仅当上述门禁、三路审查和报告完成后，才可把 MB15 标记 completed。完成时把 fixture/report/commit 写入 `godot-program-state.json`，创建下一个满足依赖的 Mission Brief（优先 MB16），并在 `nextAction` 写明下一步；不得推送或创建 PR。若攻击公式无法在 GDScript 中保持字节稳定，记录可复现 blocker 与切换方案，不静默扩大范围。

