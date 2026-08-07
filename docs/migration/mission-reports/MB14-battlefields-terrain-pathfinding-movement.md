# MB14 完成报告：战场、地形、寻路与移动

## 结论

MB14 已在 MB13 的独立战斗状态之上完成一条可重放的战场移动切片。Godot 4.7.1/GDScript 从同一份 TypeScript oracle fixture 读取 12×8 结构化战场，验证地形、六兵种移动成本、占用和敌方控制区，按固定 tie-break 产生可达集合与路径，并通过事务命令移动单位。移动前后、保存恢复后继续执行和失败事务均保持 canonical battle SHA 与显式 seed 契约。

本 Mission 仍不包含攻击、伤害、技能、战术 AI、撤退、战后结算或战斗表现；`BattleState` 和寻路器没有挂到 Node/Control。

## 交付内容

- `godot/src/domain/tactical/battlefield.gd`：版本化地形网格生成/校验、terrain lookup、边界/占用/控制区、确定性 Dijkstra reachable/path/cost。默认网格为 12×8；fixture 可覆盖为小网格。
- `godot/src/domain/tactical/battle_validator.gd`：对可选 `terrainContractVersion: 1`、tiles 顺序、坐标、terrain id、六兵种 cost/passability 进行严格校验；MB13 无 terrain 的旧 fixture 仍兼容。
- `godot/src/domain/tactical/battle_commands.gd`：`move_unit` 事务，校验 phase、activeSide、deployed、acted/moved、占用、可通过性和移动力；receipt 包含路径、成本、剩余移动力、before/after SHA 和不变 seed。
- `godot/src/application/tactical_battle/tactical_battle_session.gd`：调度 `move_unit`，沿用 duplicate/stale/command-id conflict envelope。
- `scripts/generate-godot-tactical-battle-movement-fixture.ts` 与 `godot/data/fixtures/tactical-battle-movement-v1.json`：由 Web `createTacticalBattle`、`createStructuredBattlefield`、`getReachableTiles`、`getTacticalPath`、`getTacticalPathCost` 与 `MODERN_TERRAIN_MOVE_COSTS` 生成的语言无关 oracle fixture；事务 envelope 仍由独立 adapter 包装，因为 Web 当前没有同形状的命令 session API。
- `godot/tests/tactical_battle_movement_runner.gd` 与 `scripts/run-godot-tactical-battle-movement-verification.mjs`：固定 Godot 4.7.1 headless runner；`package.json` 增加 `godot:tactical-movement:{generate,check,verify}`，并纳入 `npm run check`。

## 确定性合同

地形单元按 `y`、`x` 排序，方向顺序固定为右、左、下、上。寻路候选依次比较总成本、步数、`y`、`x`、父节点 `y`、父节点 `x`；输出 reachable 再按 `y`、`x` 排序。所有 units、deployment、logs 和 acted ids 在序列化前使用显式排序，不依赖 Dictionary 遍历顺序。移动命令不消耗 RNG，fixture 逐案证明 `seedBefore == seedAfter`。

地形 cost 直接投影当前 Web 的现代替代表；这证明跨客户端产品语义，不声称已恢复 BBK 设备地形 ABI。原版 C 参考仍只留在只读 `references/vendor/baye-c-core/`，没有进入 Godot 构建依赖。

## Fixture 对照与边界

Fixture：`godot/data/fixtures/tactical-battle-movement-v1.json`，SHA-256：`cb4797f6dad3998ad07622331d014a51be7adb5ced8a4607e12055440a9e8d60`。

- 正常序列：确认部署、攻击方移动、结束单位回合、结束攻击方回合，共 4 步；生产 `Commands.create` 现在也直接生成同一版本化地形网格。
- 查询：攻击方 reachable/path、阻挡路径、守方 reachable、小网格同成本 path tie-break 和 reachable，共 6 案。
- 直接 Web API 对照：真实 `getReachableTiles/getTacticalPath/getTacticalPathCost` 的攻击方路径查询 1 案；事务 envelope 由本地 adapter 按 MB13 session 契约重放。
- 边界：部署阶段移动、stale digest、占用格、敌方单位、阻挡地形、重复命令、command-id conflict、移动后再次移动、小数坐标、原地移动、整数越界、超过移动力，共 12 案。
- 恢复/损坏：回合切换后 snapshot restore 并继续移动；小数 terrain 坐标、非正 cost、cost/passability 不一致、缺失 terrain contract version、fractional armsType、字符串 mobility 均拒绝恢复。

Godot runner 与 TypeScript oracle 逐字段比较 factory 创建结果、snapshot、receipt、路径、cost、remaining mobility、日志、SHA、错误 envelope 和 seed，共 54 项断言通过；跨语言断言超过 Mission 要求的 20 项。直接 Web path API 的结果与 Godot 投影快照一致，事务步骤则以 adapter 证明命令 envelope 和状态变化。

## 验证证据

| 检查 | 结果 |
|---|---|
| Godot 引擎 | `4.7.1.stable.official.a13da4feb` |
| `npm run godot:tactical-battle:verify` | 通过；MB13 12 steps/19 boundary，70 assertions |
| `npm run godot:tactical-movement:verify` | 通过；factory integration、4 steps/12 boundary/6 query + 1 direct Web API case，54 assertions |
| `npm run godot:project:verify` | 通过；domain 211、presentation/input 212、editor import 和主场景启动均通过 |
| `npm run godot:application-session:verify` | 通过；250 transaction cases、1689 assertions |
| `npm run check` | 通过；program self-test、4 periods、MB13 70 assertions、MB14 54 assertions、47 Web test files/378 passed/4 skipped、TypeScript/Vite build |
| 受限内容审计 | 本 Mission 未新增原版图片、字体、音频、视频、WASM、`.lib`、`dat.lib.orig` 或 `.reference` 构建依赖 |

Godot headless 的 root certificate warning 与既有环境一致，不是本 Mission 引入的失败；未下载或安装组件。Android APK 不需要重新导出：本 Mission 只新增领域/fixture runner，不触及 project/export/presentation；移动端战斗视图和触控仍留给后续 Mission。

## 审查与剩余风险

完成代码后必须运行三路只读审查：架构/场景树、确定性/fixture、Android/触控与移动端体验。P0/P1 必须修复；本 Mission 预期的 P2 是尚无真实战场视图、设备触控战斗交互和战后战略回接，统一留给后续 Mission，不把领域切片误报为完整战术移植。

## 人工复验步骤

1. 在 Godot 4.7.1 打开 `godot/project.godot`，确认主场景仍为 `res://scenes/presentation/strategy_screen.tscn`。
2. 运行 `npm run godot:tactical-movement:verify`，确认 fixture 重生成、Godot headless 54 assertions 和不变 seed 均通过。
3. 查看 movement fixture 的 `terrainContractVersion`、`tiles`、`queryCases`、`boundaryCases`、`restoredContinuation`，确认 38 城战略/MB13 状态未被替换，battle state 仍可独立恢复。
4. 运行 `npm run check`，确认 Web 版仍是验收 oracle；不要把 WebView、JSBridge 或受限原版素材加入 Godot 工程。
