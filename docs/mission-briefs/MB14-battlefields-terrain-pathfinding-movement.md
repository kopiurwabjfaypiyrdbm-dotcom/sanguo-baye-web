# Mission Brief: MB14 — 战场、地形、寻路与移动

## Mission identity

- Mission ID: `MB14`
- Program: `godot-full-migration`
- Depends on: `MB13`
- Wave: `tactical-complete`
- Branch: `codex/godot-migration-spike`
- Engine: Godot `4.7.1-stable`; language: GDScript

## Outcome

在 MB13 的独立战斗状态、部署和回合合同之上，移植一条可验证的真实战场移动切片：从 TypeScript tactical oracle 读取时期战场模板，建立版本化的 12×8 地形网格，提供确定性的可达区域、路径和单位移动事务，并可从 snapshot 保存/恢复后继续执行。此 Mission 只完成领域和应用层的战场移动，不把战斗状态挂到场景树，也不提前实现攻击、伤害、技能或战斗表现。

完成标准是同一输入 JSON 与显式 seed 在 TypeScript 和 Godot 中得到字节稳定的地形、movement cost、可达格、路径、资源/行动变化和错误结果；所有影响结果的集合都有明确排序和 tie-break 规则。

## Context and evidence

先阅读并引用：

- `src/game/tacticalBattle.ts`：战场模板、单位移动、可达格和路径相关语义。
- `src/core/` 与 `src/compat/baye/`：资源、武将、城市和战斗状态的既有契约。
- `tests/` 中 tactical battle、movement、save/restore 的测试和 fixture。
- `docs/migration/mission-reports/MB13-deterministic-battle-state-deployment-turn-framework.md`：当前 Godot battle contract、validator、session envelope 和 guard 约束。
- `references/parity-matrix.md`：每个确定性结论的来源记录。

若 oracle 语义只能由兼容层或可复现输出确认，明确标为 provisional；不得把 `references/vendor/baye-c-core/` 直接加入应用构建。

## In scope

1. 将战场网格加入版本化 battle snapshot：宽高、terrain id、movement cost、阻挡/可通过属性、模板 key 和 contract version。
2. 保持 12×8 默认战场，同时允许 fixture 覆盖小网格以测试边界；所有格点用 `{x,y}` 并按 `y`、`x` 排序输出。
3. 实现 terrain lookup、边界检查、occupancy 检查、可达区域查询和路径查询；路径算法必须有显式 deterministic tie-break（总成本、步数、`y`、`x`，再以父节点坐标稳定化）。
4. 实现真实单位移动命令：校验 phase/activeSide/acted/deployed/owner、起终点、占用、可通过性、移动力和路径成本；事务 receipt 必须含 before/after battle SHA、路径、成本、剩余移动力、日志和不变 seed。
5. 明确处理重复 command id、stale digest、非法坐标、敌方单位、跨越阻挡格、超过移动力、移动后再次移动等失败路径；错误码进入语言无关 fixture。
6. 扩展 `TacticalBattleSession.from_snapshot` 的保存/恢复，使移动前后、恢复后继续和失败事务均可重放。
7. 生成 `godot/data/fixtures/tactical-battle-movement-v1.json`，由 TypeScript oracle 产生正常序列与边界案例；添加 Godot headless runner 和 npm 校验脚本。
8. 更新 parity matrix、Mission report、程序状态和人工复验步骤；保持 `npm run check`、Godot 4.7.1 项目验证和既有 Android 基线通过。

## Explicitly out of scope

- 攻击、伤害、命中、士气、状态效果、技能、战术 AI、撤退和战后结算。
- 战斗场景、Camera、Canvas/UI、动画、粒子和触控交互；这些属于 MB18/MB22，但本 Mission 必须留下可供表现层调用的稳定 application API。
- 战略地图进入战斗、战后资源提交和完整生产存档 schema；属于 MB19/MB20。
- WebView、TypeScript runtime、JSBridge、浏览器运行时或 Godot 默认 RNG。
- 原版受限资产、未核实授权素材、WASM、字体、音频、视频和 `.lib` 文件。

## Architecture constraints

- `GameState`、`TacticalBattleState`、terrain、pathfinder 和命令不依赖 Node/Control/场景树；表现层只能订阅/消费 snapshot 和 receipt。
- 命令采用复制输入、校验、应用、再校验的事务模式；失败不改变状态。
- 禁止依赖 Godot `Dictionary` 遍历顺序；序列化前对 officers、units、tiles、reachable、path、logs 等集合显式排序。
- 不消耗 MB13 之外的 RNG；若 oracle 移动不使用随机数，fixture 必须证明 `seedBefore == seedAfter`。
- 网格坐标、方向顺序、terrain cost、tie-break 和错误码写入合同，不藏在 UI 或测试专用代码中。

## Required deliverables

- `godot/src/domain/tactical/` 的 terrain/grid/pathfinding/movement 实现及 validator 更新。
- `godot/src/application/tactical_battle/` 的移动命令调度和 snapshot 恢复扩展。
- TypeScript fixture generator、JSON fixture、Godot runner、npm verification script。
- `docs/migration/mission-reports/MB14-battlefields-terrain-pathfinding-movement.md`。
- `references/parity-matrix.md` 中的来源、fixture hash、已知 provisional 语义。
- 不少于 20 个跨语言断言，覆盖至少 6 个正常移动/查询和 8 个失败/恢复场景；包含 path tie-break 和同成本多路径案例。

## Verification gates

1. `npm run godot:tactical-battle:verify` 与 MB13 runner 继续通过。
2. 新 movement fixture 在 TypeScript 和 Godot 中逐字段一致：网格、路径、cost、remaining movement、SHA、日志、seed 和错误 envelope。
3. `npm run godot:project:verify`、`npm run godot:application-session:verify`、`npm run check` 全部通过。
4. 静态审查：架构/场景树、确定性/fixture、Android/触控边界各一名只读子智能体；P0/P1 必须修复，新增 P2 必须在报告中归类并给出后续 Mission。
5. 不需要重新导出 APK，除非实现误触及 project/export/presentation；若触及，必须在 1280×720 和 844×390 横屏下重新验证并记录 MuMu/真机结果。

## Completion and handoff

只有在上述门禁、三路审查和报告完成后才可把 MB14 标记 completed。完成时更新 `docs/migration/godot-program-state.json` 的 completedMissions、lastCheckpoint，并创建下一依赖满足的 Mission Brief；不得推送或创建 PR。若发现 Godot 4.7.1/GDScript 无法表达合同，先记录可复现 blocker 与替代方案，不得静默扩大范围。
