# MB16 完成报告：兵种、计谋、装备修正与特殊效果

## 结论

MB16 在 MB15 的战斗状态、地形、普通攻击和事务合同之上完成了一个真实 Web 计谋切片。Godot 4.7.1/GDScript 现在可以从同一份语言无关 JSON fixture 查询 `rally`（激励）的可用性、友军目标排序和预览，并通过事务命令应用兵力恢复、异常清除、行动恢复、技能点消耗、经验、日志、收据和显式 LCG seed。核心仍是 scene-independent `RefCounted`；场景树没有承载 `GameState` 或战斗规则。

本 Mission 同时固定了一个真实装备管线案例：Web 侧从 `GameState.officers[officer-1].equipmentItemIds = ['item-13']` 经 `createTacticalBattle` 投影 +10 intelligence，使 rally 从智力 60 的不可用状态变为智力 70 的可用状态；Godot runner 又从生产 `GameSession` 装备同一物品，经 `TacticalBattleCommands.create` 直接验证 effective intelligence、skill points 和 guard equipment provenance。该案例证明跨客户端的装备派生输入契约，不宣称装备目录本身已达到原版 ABI 一致。

## 交付内容

- `godot/src/domain/tactical/battle_skill.gd`：`rally` 定义、技能点/智力/状态门槛、友军范围与稳定排序、恢复预览和显式 LCG helper。
- `godot/src/domain/tactical/battle_commands.gd`：`use_skill` 事务；复制→校验→应用→再校验，扣除技能点，恢复兵力，清除 `confused`/`stone-array`，恢复目标行动资格并写入经验、日志和 receipt。
- `godot/src/domain/tactical/battle_validator.gd`：可选 `skillPoints`/`maxSkillPoints` 的严格整数范围和上限关系；生产单位投影保留技能点、兵种和装备派生的有效 force/intelligence/mobility。
- `godot/src/application/tactical_battle/tactical_battle_session.gd`：`use_skill` command dispatch、参数类型门控和既有 stale/duplicate/conflict 语义。
- `scripts/generate-godot-tactical-battle-skill-fixture.ts`、`godot/data/fixtures/tactical-battle-skill-v1.json`：真实 Web APIs 生成的 rally、三候选稳定排序、真实 `item-13` 装备智力修正、自我施放、恢复继续和 11 类事务/损坏边界。
- `godot/tests/tactical_battle_skill_runner.gd`、`scripts/run-godot-tactical-battle-skill-verification.mjs` 与 `package.json`：纳入 `npm run check` 的 Godot 4.7.1 headless runner。
- MB13–MB15 fixture 已按新增技能点字段重生成，旧验证继续保持绿色。

## 确定性与 fixture 对照

Fixture：`godot/data/fixtures/tactical-battle-skill-v1.json`。TS generator 非写入模式会比较磁盘 canonical SHA，防止 fixture 漂移；写入模式只由当前 Web oracle 重生成。

- `rally` 的 Web 预览和 Godot 预览逐字段一致：成功率 100%、恢复 30 兵力、技能点成本 20、天气/地形/兵种倍率保持中性；100% 成功仍按 Web 规则消费一次 LCG，seed `48641 → 373686124`。
- 执行结果包含 actor/target、preview、恢复量、经验、seed 前后值、before/after battle SHA、日志和 `actedUnitIds`；目标处于混乱且已行动时，成功后状态恢复为 normal、`moved/acted` 清除并从 acted 集合移除。
- 装备修正案例从合法生产 `GameState` 装备 `item-13` 后重建战斗：无装备的 intelligence 60/不可用，装备后的 intelligence 70/可用，Web 预览为 91；Godot 同时用 production `GameSession` 与 `TacticalBattleCommands.create` 验证 intelligence 70、skillPoints 61 和 guard 中的 `item-13` provenance，再消费相同有效属性快照。Godot 不读取原版素材或浏览器运行时。
- 自我施放案例把 actor 兵力降至 70，验证 `targetUnitId == unitId` 时扣点、行动标记和恢复不会被旧 target 字典覆盖。
- 边界覆盖错误阶段、技能点不足、已行动/沉默、越距/未知目标、未知技能、stale digest、malformed target id、重复与 command-id 冲突，以及技能点上界/超过 max/status 损坏恢复。

Godot runner 共通过 54 项断言（技能可用性、Web cost→id 技能列表排序、三目标排序、普通与装备修正预览、生产装备 factory 投影、成功执行、自我施放、恢复、11 个边界、恶意 restore、原始兵力类型门控和部署阶段查询门控）。MB13/MB14/MB15 仍分别通过 70/54/56 项断言。

## 验证证据

| 检查 | 结果 |
|---|---|
| Godot 引擎 | `4.7.1.stable.official.a13da4feb` |
| `npm run godot:tactical-skill:verify` | 通过；11 boundary，54 assertions |
| `npm run godot:tactical-battle:verify` | 通过；70 assertions |
| `npm run godot:tactical-movement:verify` | 通过；54 assertions |
| `npm run godot:tactical-attack:verify` | 通过；56 assertions |
| `npm run godot:application-session:check` | 通过；250 transaction cases |
| `npm run check` | 通过；program self-test、4 periods、47 Web test files/378 passed/4 skipped、TypeScript/Vite build |
| 受限内容审计 | 本 Mission 未新增原版图片、字体、音频、视频、WASM、`.lib`、`dat.lib.orig` 或 `.reference` 构建依赖 |

headless 运行仍会输出既有的 root certificate store warning；没有下载或安装组件。MB16 只触及领域、校验、fixture 和 runner，没有改变 project/export/presentation，因此 Android APK 和触控复验继续由 MB18/MB22 负责。

## 审查与剩余风险

MB16 最终审查需覆盖架构、确定性 fixture、Android/触控影响三路。当前实现有意只支持 `rally`，其余 Web 计谋目录、战术 AI、原生战场表现、战后结算和战略回接均未提前扩张。装备修正案例是有效属性快照证据，不提升 provisional 装备目录的原版证据等级。

## 人工复验步骤

1. 使用 Godot 4.7.1 打开 `godot/project.godot`，确认主场景仍能启动且核心状态不挂在场景树。
2. 运行 `npm run godot:tactical-skill:verify`，确认 fixture canonical 对照、38 项断言、技能点边界、异常清除和装备智力修正。
3. 查看 `godot/data/fixtures/tactical-battle-skill-v1.json` 的 `webOracle`、`equipmentModifierCase`、`success`、`restoredContinuation` 和 `boundaryCases`，核对 seed、receipt、日志与 SHA。
4. 运行 `npm run check`，确认 Web 版继续作为规则 oracle；不要将 WebView、JSBridge 或受限原版素材加入 Godot 工程。
