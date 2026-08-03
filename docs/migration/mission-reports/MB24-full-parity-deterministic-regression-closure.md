# MB24 完整一致性与确定性回归收口报告

## 结论

MB24 已补上跨阶段 fixture 的 canonical 回归闭环，并新增一条实际贯通回放：TypeScript 生成 13 个战略、战术、存档和入口 fixture 的语言无关清单，Godot 4.7.1 独立读取同一 JSON、重新计算 canonical SHA-256，并通过 136 项清单断言；Godot full-loop runner 另通过 20 项连续状态断言。该 Mission 没有改动 GameState、RNG、命令事务或存档契约，也没有把 Web 运行时嵌入 Godot。

MB23 遗留的 MuMu 物理触控 P2 仍明确保留：当前 `adb shell input tap/touchscreen` 在 MuMu 的旋转窗口上没有稳定命中 Godot 控件；键盘导航、渲染、返回、暂停/恢复和双尺寸截图已通过，真实触摸、拖动/缩放、点城与战术入口仍需人工窗口/真机复核。

## 本次实现

- 新增 `scripts/generate-godot-parity-regression-manifest.ts`：固定 fixture 列表、版本字段和 canonical SHA-256；默认检查模式拒绝清单漂移，`--write` 只用于受控更新。
- 新增 `godot/data/fixtures/full-parity-regression-v1.json`：13 个 fixture 的语言无关回归输入/输出摘要，路径限制在 `res://data/fixtures/`。
- 新增 `godot/tests/parity_regression_runner.gd` 与 `scripts/run-godot-parity-regression-verification.mjs`：Godot 4.7.1 重算每个 fixture 的 canonical digest，检查版本元数据、精确清单覆盖和路径边界；当前通过 136 项断言。
- 新增 `scripts/generate-godot-full-loop-fixture.ts`、`godot/data/fixtures/godot-full-loop-v1.json`、`godot/tests/full_loop_replay_runner.gd` 与对应验证 wrapper，执行战役启动→开垦→中间存档重载→战术撤退→结算→最终存档重载；当前通过 20 项断言。
- 将 `npm run godot:parity-regression:verify`、`npm run godot:full-loop:verify`、`npm run godot:migration-check` 与 `npm run godot:project:verify` 接入 `npm run check`。
- 修复 Android Back 的场景优先级：战术设置/战略面板/返回确认先关闭；补回 Windows 标题栏关闭通知；暂停时战略 GameSession 自动保存，主菜单、战役设置、战略和战术场景接收恢复通知。
- 将统一平台安全区计算应用到主菜单、战役设置、战略 HUD 和战术相机/操作区。
- 更新 `references/parity-matrix.md`，新增“Godot 全量回归 fixture 清单”条目，明确该证据闭合跨客户端 canonical 载荷，不提升未知 BBK 原设备 ABI 的证据等级。

## 验证证据

| 检查 | 结果 |
|---|---|
| `npm run godot:parity-regression:verify` | 13 fixture entries；Godot 136 assertions 通过 |
| `npm run godot:full-loop:verify` | Godot full-loop 20 assertions 通过 |
| `npm run check` | 通过；Godot 13 fixture/20 项 full-loop、迁移负例、主场景/导入、各领域事务与呈现检查、Web 47 files/378 tests（2 skipped files/4 skipped tests）、生产构建均通过 |
| `npm run godot:project:verify` | 211 domain + 212 presentation input smoke；主场景和导入通过 |
| `npm run godot:tactical-presentation:verify` | 74 assertions 通过 |
| `npm run reference:check` | 包含于 `npm run check`，通过；未引入受限原版资产 |
| `git diff --check` | 通过 |

## 确定性与排序边界

- manifest 的 fixture 顺序是显式数组，不依赖 Dictionary 遍历顺序。
- 每个 fixture 由 TypeScript 的 `canonicalJson`/SHA-256 生成摘要，Godot 使用 `CanonicalJson.try_sha256` 独立重算；输入文件必须是 JSON object，版本字段必须仍存在。
- runner 拒绝包含 `..` 或越出 `res://data/fixtures/` 的路径，避免将本地参考文件或任意路径变成应用依赖。
- 该清单是回归索引，不替代各领域 runner；开垦、应用会话、战术移动/攻击/技能/AI/结局/结算、生产存档和战役入口的既有逐字段 fixture 仍由各自验证脚本负责。
- full-loop fixture 以显式 officer-32 进入战术段，保留 officer-1 已因开垦命令进入 `actedOfficerIds` 的真实约束，没有重置月份状态。

## 已知风险与人工复验

- MB23 的 MuMu 触控注入问题仍是移动验收缺口：需要在 MuMu 窗口或真机上人工点击主菜单、下拉选择、城池节点，拖动/缩放战略地图，打开战术样片并返回；不能把 ADB 键盘焦点路径当作触摸通过。安全区与 Back 路由已补齐，但真实触摸证据仍未宣称通过。
- 未知 BBK `SysRand`、原版战场 ABI、部分未证实原版内容仍按 parity matrix 的 provisional/partial 状态保留。
- 默认 Godot Windows renderer 的本机原生 `0x58` 环境崩溃仍不等于项目逻辑失败；GL Compatibility smoke 是当前支持路径。

## 下一步

MB25 负责最终 release-candidate 和迁移完成证据：收口人工/真机触控、完整用户路径、签名/发布前审计、最终差异清单和是否建议全面迁移的结论。MB24 不改变长期 Goal 的 active 状态。
