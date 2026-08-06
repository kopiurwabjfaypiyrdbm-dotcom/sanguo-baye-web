# MB13 完成报告：确定性战斗状态、部署与回合框架

## 结论

MB13 已完成一个独立于场景树的 GDScript 战斗领域切片。它从 period 1 的真实战略快照创建攻守双方的最小战斗状态，提供稳定的部署槽、部署确认、单位结束行动、阵营回合切换、战斗日推进、结束 guard、事务 receipt、canonical state SHA-256 和 snapshot 恢复。TypeScript oracle 与 Godot 对同一 JSON fixture 逐案一致。

这不是完整战术战场迁移：地形、寻路、攻击伤害、技能、战术 AI、撤退、战后结算和战略战役回接明确留给 MB14–MB19。

## Contract 与实现

- `godot/src/domain/tactical/battle_state.gd`：`contractVersion: 1` 的 `RefCounted` 快照包装；权威状态不挂在 Node/Control 上。
- `godot/src/domain/tactical/battle_validator.gd`：校验 battle id、战略来源、seed、回合/日期、phase/status/outcome、双方 roster、单位槽、部署数组、行动集合、日志和 guard；部署数组和单位槽双向核对，拒绝重复实体/槽位、越界部署和缺失部署项。
- `godot/src/domain/tactical/battle_commands.gd`：复用 `GameState`、period 1 邻接关系和真实驻城武将；确定性生成 battle id、攻守排序、west/east/north/south 部署位置、battlefield key/template、有效装备属性、守城后备兵和 guard。创建/部署/回合命令均复制输入、运行 validator，不推进 LCG；创建拒绝 strategic ended/pending succession；结束 defender 回合时只推进 battle day，保持来源 `strategicTurn` 不变，超过 `maxDays` 进入 `defender-won`/`day-limit`；当前阵营无存活部队时进入显式 no-units outcome。
- `godot/src/application/tactical_battle/tactical_battle_session.gd`：最小命令 envelope、显式版本字段、expected battle SHA、exact duplicate cache（状态已推进时返回当前 snapshot）、conflicting command id/stale digest 拒绝，以及经过 validator 的 `from_snapshot` 恢复后继续执行。
- `godot/tests/tactical_battle_runner.gd`：跨语言 runner；`scripts/run-godot-tactical-battle-verification.mjs` 固定使用 Godot 4.7.1。

MB13 的 `guard.strategicFingerprint` 使用 canonical JSON SHA-256 的版本化合同，避免依赖 Web 内部 FNV/stable-serialize 实现；这保持跨语言可复现，完整 Web 战斗结果 guard 适配留在后续战斗结算 Mission。

## Fixture 对照

文件：`godot/data/fixtures/tactical-battle-v1.json`，由 `scripts/generate-godot-tactical-battle-fixture.ts` 从 `createProductionSessionState(1, 1)`、`createTacticalBattle` 生成并校验。

- 真实输入：period 1、曹操势力、濮阳 `city-12` → 邺 `city-11`、`officer-1`、20 粮；守方 roster 按兵力/统率/id 稳定排序。
- 正常序列 12 步：创建、移动部署、撤下、重新部署、确认部署、攻方单位/阵营回合、守方五单位回合/阵营回合、恢复后继续。
- 边界 19 案：部署越界、敌方阵地、过期 digest、重复命令、ended guard、真实 day-limit、无存活部队结束、敌方单位部署/撤下权限、重复部署、占用槽、非法 envelope、缺失 commandId、非字符串 expected SHA、非对象 parameters、command-id conflict、推进后 duplicate 和小数坐标；另有 malformed snapshot、版本/尺寸/部署槽/guard encoding/ongoing day-limit/双方归零恢复 guard，以及 TypeScript `createTacticalBattle` 的零守军歼灭胜利创建对照。
- 独立创建覆盖：真实 Web `createTacticalBattle` 投影的双装备有效属性案例、城市后备兵案例；装备参与者的 `equipmentKey`/item bonuses 和 unit effective force/intelligence/mobility 均逐字段对照。为避免 JSON NUL 解析差异，MB13 合同将 Web 的 NUL-delimited equipment key 投影为显式 `equipmentKeyEncoding: pipe-v1`，后续完整战斗结果再单独证明原始 FNV 合同。
- Godot runner：70 assertions passed；创建与每个事务都比较 receipt、before/after battle SHA、完整 battle snapshot、日志、phase/status/outcome、来源 `strategicTurn`/battle `day`、activeSide 和不变的 seed。命令 envelope 对 `commandId`、expected SHA、参数字典和部署坐标做显式类型/整数校验；canonical 摘要失败不会降级为空字符串，非字符串对象键和恶意字符串字段也会稳定返回 validation issue 而不是引擎异常。
- RNG 语义：MB13 创建与部署/回合框架不消耗 RNG，`seedBefore == rngSeed`；攻击/技能随机结算不是本 Mission 的行为。

## 验证证据

| 检查 | 结果 |
|---|---|
| Godot 引擎 | `4.7.1.stable.official.a13da4feb` |
| `npm run godot:tactical-battle:verify` | 通过；TypeScript fixture 12 steps/19 boundary cases，Godot 70 assertions（含双装备/后备兵/零守军结束创建/恶意恢复拒绝/小数坐标/envelope 类型边界/canonical-invalid 输入/恶意字符串字段） |
| `npm run godot:project:verify` | 通过；Godot domain 211 assertions、presentation 212 assertions、编辑器导入和主场景启动通过 |
| `npm run godot:application-session:verify` | 通过；MB12 基线 250 transaction cases、1689 assertions 未回归 |
| `npm run check` | 通过；Web 47 test files、378 passed、4 skipped，TypeScript/Vite build 通过 |
| 受限内容审计 | 本 Mission 未新增原版图片、字体、音频、视频、WASM、`.lib`、`dat.lib.orig` 或 `.reference` 构建依赖 |

Godot headless 日志中的 root certificate/build-tools warning 与既有环境一致，不影响脚本、fixture、导入或主场景验证；未下载或安装组件。

## 审查与风险

初次三路只读审查发现并已修复以下 P1/P2：战略 ended/pending succession guard、装备有效属性与 guard、恢复入口 validator、roster/acted/deployment/phase 不变量、部署阵营权限、来源 turn 与 battle day 混用、无部队死锁、Dictionary 键排序、推进后的 duplicate snapshot、显式 command envelope version、参数整数边界、canonical failure 显式返回、后备兵、零守军 Web outcome 和真实 day-limit fixture 覆盖。最终复审在这些修复后重新执行：

1. 架构/场景树：P0=0、P1=0、P2=0；确认 battle state、commands、session 均为 scene-independent RefCounted，未将权威状态复制到表现节点，恶意 snapshot 类型门控不会触发脚本错误。
2. 确定性/fixture：P0=0、P1=0、P2=0；确认显式排序、canonical SHA、duplicate/stale/ended/day-limit/no-units guard、装备/后备兵/来源 guard、恢复序列和零 RNG 消耗；selector 的 MB12 后续 focused coverage 不属于本 Mission。
3. Android/触控：P0=0、P1=0、P2=1；确认 MB13 没有改变 MB12 APK 的入口/触控边界；真实战场表现、Android tactical view 和战后战略回接留到后续 Mission。

本阶段残余风险为 P2：暂无真实战场视图、真实设备战斗交互和战后战略提交；`strategicFingerprint` 继续使用 MB13 版本化 canonical SHA 合同（完整战斗结果与 Web FNV 的兼容适配留给结算 Mission），攻击伤害和地形规则必须在后续 Mission 通过新的 oracle fixture 证明，不能把本切片误称为完整战斗迁移。部署/回合的 TypeScript 预期是明确的 contract adapter：创建快照直接由 Web `createTacticalBattle` 产生；Web 当前没有部署命令 API，因此部署 envelope 和最小 turn contract 在 fixture adapter 中逐案定义，并以实际 Web tactical state 的字段和 guard 作为输入证据。

## 人工复验步骤

1. 在 Godot 4.7.1 打开 `godot/project.godot`，确认主场景仍为 `res://scenes/presentation/strategy_screen.tscn`。
2. 运行 `npm run godot:tactical-battle:verify`，确认 fixture 生成校验和 Godot 70 assertions 均通过。
3. 查看 `godot/data/fixtures/tactical-battle-v1.json`，确认输入城市、参战武将、deployment、logs、day/turn/activeSide 和 SHA 字段存在且稳定。
4. 在后续 MB14 实现战场场景前，不要把本 Mission 的 `BattleState` 作为 Node 属性或假战斗 UI；继续以 `TacticalBattleSession.from_snapshot` 做恢复/调试入口。
