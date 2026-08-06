# MB19 完成报告：战斗结果、撤退、结算与战役回接

## 结论

MB19 已完成一个可验证的原生 Godot 战术结束到战略战役状态的最小闭环。Godot 4.7.1/GDScript 可以从经过校验的终局战术快照生成与 Web 相同的胜负、撤退、伤亡、粮草、经验、城市资源和日志结果，并通过显式 `settle_tactical_battle` 应用命令提交到独立的 `GameState`。规则和状态仍在 `RefCounted` domain/application 层，场景树只负责此前 MB18 的表现与命令调度。

## 交付内容

- `godot/src/domain/tactical/battle_result.gd`：终局投影，固定单位 key、日志窗口和攻守兵力汇总顺序；拒绝 ongoing/非法终局。
- `godot/src/domain/tactical/battle_commands.gd` 与 `godot/src/application/tactical_battle/tactical_battle_session.gd`：接入攻方/守方全军撤退，以及 `settle_battle` 的确定性结果投影；战术 session 不直接修改战略 `GameState`。
- `godot/src/domain/tactical/battle_settlement.gd`、`godot/src/application/commands/battle_settlement_adapter.gd`：在显式应用边界校验战役身份、turn/seed、城市资源 guard、伤亡/后备兵/占城关系，应用伤亡、体力、经验、粮草、城市经济/民忠/后备兵、占城和战后日志，并使用现有 `CoreLcg` 处理 Web 逃脱/俘虏抽数。
- `godot/data/fixtures/tactical-battle-outcome-v1.json`：覆盖攻方胜利、守方胜利、攻方撤退、守方撤退及保存后继续的终局投影。
- `godot/data/fixtures/tactical-battle-settlement-v1.json`：由 Web `createTacticalBattleResult` + `applyBattleResult` 生成的语言无关输入/输出 fixture，包含初始/最终状态及 SHA-256。
- `scripts/generate-godot-tactical-battle-outcome-fixture.ts`、`scripts/generate-godot-tactical-battle-settlement-fixture.ts`：只读 Web oracle 生成器；可重复生成并检查 fixture。
- `godot/tests/tactical_battle_outcome_runner.gd`、`godot/tests/tactical_battle_settlement_runner.gd` 及对应 Node runner：覆盖终局/撤退、成功、重复、命令 ID 冲突、陈旧摘要、损坏结果、保存恢复和状态不变性。
- `package.json`：把 outcome 与 settlement verify 纳入根 `npm run check`。

## 验证证据

| 检查 | 结果 |
|---|---|
| Godot 引擎 | `4.7.1.stable.official.a13da4feb` |
| `npm run godot:tactical-outcome:verify` | 通过，39 项断言；四种终局/撤退和保存继续投影一致 |
| `npm run godot:tactical-settlement:verify` | 通过，34 项断言；真实 `settle_battle → settle_tactical_battle` 结果链、初始/最终完整 state 与 Web fixture SHA 一致，并覆盖非零伤亡、非字典序经验顺序、攻方胜利、结算前恢复、损坏 guard/伤亡/参数拒绝 |
| `npm run check` | 通过；Godot 程序、四时期数据、应用事务、MB13–MB19 战术 runner、presentation、参考校验、Vitest 47 文件/378 测试（另有 2 文件/4 测试按现有条件跳过）和 Web build 全部通过 |
| 重复命令 | 相同 envelope 命中 `GameSession` 已提交缓存；不再次调用 settlement，不改变当前 state SHA；返回既有应用层缓存结果以保持现有事务契约 |
| 保存恢复 | 预结算生产快照可恢复并提交；后结算快照可恢复，使用新命令会被陈旧摘要拒绝；malformed result 被事务边界拒绝 |
| 受限内容审计 | MB19 未新增原版图片、字体、音频、视频、WASM、`.lib`、`dat.lib.orig` 或 `.reference` 构建依赖 |

## 规则边界与已知风险

本 Mission 证明的是当前 Web 产品规则的跨客户端一致性，不把现代 Web 结算提升为 BBK 设备 ABI 一致性。战术结果目前覆盖 Web 已定义的终局投影、撤退、资源损耗、经验、装备后智力判定、攻方胜利占城、既有俘虏转押/收复、生命周期服务（俘虏、死亡、继承、失地释放、战役结果评估）和守方战败逃脱/俘虏切片；完整战略 UI/战术 HUD、生产存档 schema、Android APK 与设备验证仍属于后续 Mission。`GameSession` 的同 envelope 重放会返回首次成功的缓存核心（其中 `stateChanged` 保留首次提交语义），但当前状态摘要和状态体不变；该行为与既有应用会话 fixture 保持一致。

Godot headless runner 仍可能输出 Windows root certificate store warning。用户机器上的 Godot 4.7.1 GUI 曾出现 Windows 应用程序错误，因此本报告只把同版本 headless editor/smoke 和独立 runner 作为自动证据，不能替代 MB23 的 GUI、Android Debug APK、MuMu/真机和 1280×720/844×390 实机验收。

## 人工复验步骤

1. 使用 Godot 4.7.1 打开 `godot/project.godot`，确认主场景仍为显式配置的入口；运行至战略/战术样片，按 MB18 步骤复验横屏拖动、pinch、点选和返回。MB19 当前没有终局结果面板或撤退按钮，因此不要把不可执行的 UI 操作当作本 Mission 证据；该可视化接线延期至 MB22。
2. 运行 `npm run godot:tactical-outcome:verify`，确认 fixture 中攻方胜利、守方胜利、攻方撤退和守方撤退的结果/日志稳定；再运行 `npm run godot:tactical-settlement:verify`，确认真实 `settle_battle` 生成的结果进入 `settle_tactical_battle` envelope，更新城市资源、曹操/战斗单位状态、粮草、经验和日志。
3. 重复提交同一 settlement envelope，确认 state SHA 和状态体不变；提交冲突 ID、旧摘要和 malformed result，确认分别得到冲突、陈旧或领域拒绝。
4. 保存结算前或结算后的 snapshot，重启 session 恢复；结算前可继续一次，结算后使用旧摘要应得到 `stale_state`。
5. 运行 `npm run check`，保留 outcome/settlement runner 和 Web 回归输出作为证据；MB22 接入结果 UI 后再补终局触控禁用、撤退确认和结果面板的人工验收，MB23 再做 APK/MuMu/真机双尺寸验收。

## 下一步

MB19 完成后进入 MB20：生产战役存档/恢复与完整战略 UI 接线；完整战术 HUD 和平台/设备 hardening 继续按 MB22/MB23 排队，不在本 Mission 扩大范围。
