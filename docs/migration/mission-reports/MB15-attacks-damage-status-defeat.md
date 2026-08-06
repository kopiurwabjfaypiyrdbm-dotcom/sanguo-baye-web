# MB15 完成报告：攻击、伤害、状态与部队溃退

## 结论

MB15 在 MB13 的独立战斗状态与 MB14 的版本化 12×8 战场之上完成了普通攻击技术样片。Godot 4.7.1/GDScript 现在可以从同一份语言无关 JSON fixture 查询攻击目标、生成地形/兵种/属性修正后的预览，并通过事务命令应用确定性伤害、行动标记、经验 receipt 与日志。普通攻击沿用 Web 当前规则：显式 seed 不消费，遁甲使用 Web 的 0.65 减伤，目标兵力归零只表达战术单位溃退，不提前执行 MB19 的战略战后结算。

`BattleState`、攻击公式和命令均为 scene-independent `RefCounted`；场景树没有承载核心状态，也没有引入 TypeScript、WebView、JSBridge、浏览器运行时或受限原版素材。

## 交付内容

- `godot/src/domain/tactical/battle_attack.gd`：可攻击目标排序、普通攻击形状、hidden 邻接规则、地形 shift、f32/U16 攻防与伤害公式、dunjia 减伤；成功 preview 只返回 Web 公开字段，错误返回稳定 error envelope。
- `godot/src/domain/tactical/battle_commands.gd`：`attack_unit` 事务；校验 battle phase、ongoing、activeSide、兵力、目标阵营/存活/范围，应用 moved/acted、`actedUnitIds`、兵力、经验、日志并复校验 snapshot；不消费 RNG。
- `godot/src/domain/tactical/battle_validator.gd`：force/intelligence/level 0..255、armsType 0..5、mobility 0..8、八种战术状态 allowlist；战斗阶段允许部队离开初始部署区，部署阶段仍严格检查阵地。
- `godot/src/application/tactical_battle/tactical_battle_session.gd`：`attack_unit` dispatch 与参数校验，继续提供 stale/duplicate/conflicting command id 事务语义。
- `scripts/generate-godot-tactical-battle-attack-fixture.ts`、`godot/data/fixtures/tactical-battle-attack-v1.json`：由真实 Web `getAttackableUnitIds`、`previewTacticalAttack`、`attackTacticalUnit` 生成；包含普通攻击、目标归零、dunjia、恢复继续和 11 类失败/命令边界。
- `godot/tests/tactical_battle_attack_runner.gd`、`scripts/run-godot-tactical-battle-attack-verification.mjs` 与 `package.json`：固定 Godot 4.7.1 headless runner，纳入 `npm run check`。

## 确定性与状态合同

攻击目标先过滤存活敌军、普通攻击形状与 hidden 距离，再按兵力、单位 id 排序。攻击属性和伤害按 Web 的现代替代表执行 f32/U16 截断；`experienceGains`、`actedUnitIds`、deployment、logs 均在快照结果中显式排序。每个成功 receipt 都携带 command id、before/after battle SHA、preview、damage、troopsAfter、experienceGained、seedBefore/seedAfter；fixture 证明 seed 前后一致。

Godot 命令采用复制→校验→应用→再校验。失败的 phase、目标、范围、stale digest、重复/冲突 command id、错误参数和损坏 snapshot 不改变 battle、日志、经验或 seed。目标兵力为零时保留 `status: ongoing`（目标不是主将的当前 fixture），仅写入“目标溃退”日志；完整胜负、撤退确认、粮草和战略结算继续留在 MB19。

## Fixture 对照与边界

Fixture：`godot/data/fixtures/tactical-battle-attack-v1.json`；SHA-256：`a50f6f9272b5ec2679f6747fac33b8dcaa683ab80173c92ee3c8a70aec71f9e4`。

- Web oracle 直接覆盖 `getAttackableUnitIds`、`previewTacticalAttack`、`attackTacticalUnit`；普通攻击造成 19 伤害，目标由 100 降到 81，经验增加 3，seed 保持 `48641`。
- 目标归零案例以 10 兵力重放，结果兵力钳制到 0，经验/日志/行动标记/摘要一致。
- `dunjia` 案例固定 12 伤害（普通伤害经 0.65 修正），仍不消费 RNG。
- 恢复案例从初始 snapshot 新建 session 后继续执行同一命令；边界包含 wrong phase、真实 Web API 未知目标失败、未知/己方/越距目标、stale digest、duplicate、command-id conflict、已行动攻击者、hidden 远距目标、malformed target id、未部署攻击者和未部署目标，共 12 案。
- 恶意 restore 覆盖 armsType、mobility、force、intelligence、level、status 和缺失 terrain；均被拒绝。

Godot runner 对目标列表、preview、3 个攻击结果、恢复、12 个边界、真实 Web 失败 error、匿名攻击者经验保护、损坏字段恢复、seed、experience、日志、状态字段和完整 SHA 逐字段比较，共 56 项断言通过；MB13/MB14 fixture 仍分别保持 70/54 项断言。

## 验证证据

| 检查 | 结果 |
|---|---|
| Godot 引擎 | `4.7.1.stable.official.a13da4feb` |
| `npm run godot:tactical-battle:verify` | 通过；12 steps/19 boundary，70 assertions |
| `npm run godot:tactical-movement:verify` | 通过；4 steps/12 boundary，54 assertions |
| `npm run godot:tactical-attack:verify` | 通过；12 boundary，56 assertions |
| `npm run godot:project:verify` | MB14 基线通过；Godot 4.7.1、domain 211、presentation/input 212、主场景启动 |
| `npm run godot:application-session:verify` | 通过；250 transaction cases、1689 assertions |
| `npm run check` | 通过；program self-test、4 periods、47 Web test files/378 passed/4 skipped、TypeScript/Vite build |
| 受限内容审计 | 本 Mission 未新增原版图片、字体、音频、视频、WASM、`.lib`、`dat.lib.orig` 或 `.reference` 构建依赖 |

Godot headless 的 root certificate store warning 与既有环境一致；没有下载或安装组件。MB15 只触及领域、校验、fixture 与无头 runner，没有改变 project/export/presentation，因此没有重复导出 APK；移动端战斗视图和触控仍留给 MB18/MB22。

## 审查与剩余风险

三路只读审查初轮发现的 P1 已全部修复并进入最终复审：恢复字段与 allowlist、units 容器门控、部署门禁（查询与命令）、无 officer 经验空键、部分主将结算、真实 Web 失败 oracle、fixture 漂移检查均已补齐。剩余 P2 是 fixture 对攻击形状/地形正负 shift/U16 边界的覆盖仍窄，后续继续扩展并不阻塞 MB16；另有预期的延期风险：尚无真实战场视图、设备触控战斗交互和战后战略回接，分别交给 MB18/MB22/MB19。

## 人工复验步骤

1. 使用 Godot 4.7.1 打开 `godot/project.godot`，确认主场景仍为 `res://scenes/presentation/strategy_screen.tscn`。
2. 运行 `npm run godot:tactical-attack:verify`，确认 fixture 重生成、磁盘 fixture canonical 对照、Godot 56 assertions、dunjia/归零结果和 seed 不变。
3. 查看 `godot/data/fixtures/tactical-battle-attack-v1.json` 的 `webOracle`、`success`、`defeatCase`、`dunjiaCase`、`restoredContinuation` 与 `boundaryCases`，检查 before/after SHA、experience、日志和错误 envelope。
4. 运行 `npm run check`，确认 Web 版仍是规则 oracle；不要把 WebView、JSBridge 或受限原版素材加入 Godot 工程。
