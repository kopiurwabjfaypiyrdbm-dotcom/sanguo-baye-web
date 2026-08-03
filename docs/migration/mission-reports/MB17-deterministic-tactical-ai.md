# MB17 完成报告：确定性战术 AI

## 结论

MB17 在 MB13–MB16 的战术状态、12×8 地形、移动、普通攻击、装备属性和 `rally` 计谋合同之上，加入了一个保持场景树无关的 GDScript 战术 AI 编排服务。服务从经过校验的保存快照恢复 `TacticalBattleSession`，使用显式排序和当前 Web 的主将/致命/伤害/id 规则选择动作，再通过事务命令执行并完成攻方到守方的确定性阶段交接。

本 Mission 的交叉语言验收采用时期 1、显式 seed 的真实 Web 轨迹：主案例验证曹操在 `(3,3)` 选择相邻守将耿武 `(3,4)`，造成 14 点兵力损失，经验增加 2，seed 不消耗，随后进入守方阶段；另外四个 policy case 覆盖 `rally` 自身、移动后攻击、移动后等待/占城终局，以及从保存快照恢复后的守方继续行动。Godot 的命令 envelope、receipt、日志、完整战斗状态和 canonical SHA 与 TypeScript `runBasicTacticalAi` fixture 逐字段一致。

## 交付内容

- `godot/src/application/tactical_battle/tactical_battle_ai.gd`：有界 AI 服务；候选单位按目标距离和 id 排序，目标按主将、致命、伤害、id 排序；动作优先级为 `rally → attack → move → wait`，所有动作继续经过 `TacticalBattleSession`。
- `scripts/generate-godot-tactical-battle-ai-fixture.ts`、`godot/data/fixtures/tactical-battle-ai-v1.json`：由 `createTacticalBattle`、`runBasicTacticalAi`、攻击/移动/计谋/等待 API 生成的语言无关 fixture，包含主攻击轨迹、4 个 policy case、11 个事务和损坏边界；每个步骤记录 before/after SHA，移动步骤记录确定性路径。
- `godot/tests/tactical_battle_ai_runner.gd`、`scripts/run-godot-tactical-battle-ai-verification.mjs`：Godot 4.7.1 headless runner，验证保存快照恢复、完整 AI 轨迹、重复运行、命令结果、最终状态和边界拒绝。
- `package.json`：加入 `godot:tactical-ai:generate/check/verify`，并纳入 `npm run check`。
- `references/parity-matrix.md`：记录战术 AI 的当前有界差异证据和原版 ABI 未声明范围。

## 确定性与边界证据

- fixture 非写入检查会用 TypeScript canonical SHA 对磁盘 JSON，防止 Web oracle 漂移。
- AI 不读取 Godot 默认随机数；本轨迹攻击 seed 前后均为 `48641`，保持 Web 普通攻击的“不消耗 RNG”语义。
- `Session.from_snapshot` 在执行前严格校验单位、状态、部署、地形、编队、guard 和完整状态；命令保留 stale digest、duplicate、command-id conflict、错误阶段、敌我阶段、已行动、无兵力、未知目标、类型错误和 malformed restore 边界。
- 影响结果的单位、目标、acted 集合和字典键均显式排序；没有依赖 `Dictionary` 遍历顺序。
- AI 阶段交接通过单个 `end_ai_side_turn` domain command 事务完成：显式重置双方 `moved/acted`、重建 `actedUnitIds`、推进日与守方粮草、天气 LCG、状态轮次、结束判定并追加“守方开始行动。”日志；没有把战斗状态挂到 Node/Control/场景树。

Godot runner 当前通过 112 项断言（11 个 boundary、主轨迹和 4 个 policy case，含双守方单位排序、保存继续快照、逐步 receipt SHA/seed 显式断言）；既有战术 battle/movement/attack/skill runner 分别继续通过 70/54/56/54 项断言。

## 验证证据

| 检查 | 结果 |
|---|---|
| Godot 引擎 | `4.7.1.stable.official.a13da4feb` |
| `npm run godot:tactical-ai:verify` | 通过；11 个 boundary、4 条真实 Web policy 轨迹，112 项断言；逐步骤 SHA/path、receipt SHA/seed 与最终状态一致 |
| `npm run godot:tactical-battle:verify` | 通过；70 项断言 |
| `npm run godot:tactical-movement:verify` | 通过；54 项断言 |
| `npm run godot:tactical-attack:verify` | 通过；56 项断言 |
| `npm run godot:tactical-skill:verify` | 通过；54 项断言 |
| 三路只读审查 | 初审发现的阶段交接、移动后重入、致命优先级、守方粮草/日推进和轨迹证据问题已修复；MB18 收尾三路复审最终 P0/P1/P2 均为 0 |
| `npm run check` | MB17 代码与 MB18 场景合并后复跑；Web、fixture、Godot、reference、测试和 build 必须保持绿色 |
| 受限内容审计 | 未新增原版图片、字体、音频、视频、WASM、`.lib`、`dat.lib.orig` 或 `.reference` 构建依赖 |

headless 运行仍可能输出既有的 Windows root certificate store warning；不影响退出码和断言。MB17 未改动 `project.godot`、主场景、导出预设、表现层或输入层，因此无需单独重导 APK/MuMu；接入 MB18/MB22 时应测量整侧 AI 同步执行时间。

## 范围与剩余风险

本 Mission 只把当前 Web 的确定性战术 AI 语义接到四条可验证的有界轨迹，并覆盖 rally、移动候选和等待的编排入口；Godot 侧不宣称十项计谋全部实现，也不把现代启发式提升为未经证实的 BBK 原版 AI ABI。战斗结算和战略状态回写由 MB19 负责。

## 人工复验步骤

1. 用 Godot 4.7.1 打开 `godot/project.godot`，确认主场景可启动，且 `TacticalBattleAi` 未实例化为场景节点。
2. 运行 `npm run godot:tactical-ai:verify`，核对 `webOracle`、`action`、`finalBattle` 的 target、damage、experience、seed、日志和 SHA。
3. 查看 `godot/data/fixtures/tactical-battle-ai-v1.json` 的 11 个 boundary，确认错误命令不改变状态，重复命令返回 duplicate，冲突命令被拒绝。
4. 运行 `npm run check`，确认现有 Web 版仍是规则 oracle；不要将 WebView、JSBridge 或受限原版素材加入 Godot 工程。
