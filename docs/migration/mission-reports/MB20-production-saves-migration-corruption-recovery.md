# MB20 完成报告：生产存档、迁移与损坏恢复

## 结论

MB20 已把 MB19 的战役状态接入可验证的生产存档契约，并补齐战斗前待处理、战斗后已提交两阶段恢复记录。Godot 4.7.1/GDScript 现在可以保存时期 1 的完整 schema 6 `GameState`，以 `dataContractVersion=2`、`baye-classic-v1`、战役身份和 SHA-256 状态摘要封装；合法的 v0 完整状态可迁移，缺字段、未知字段、摘要不一致和状态不完整的输入在替换 session 前拒绝。战斗结算先写已提交恢复标记，再暴露成功结果，进程重启后不会重复结算。

## 交付内容

- `godot/src/application/persistence/json_save_repository.gd`：生产存档 envelope、战役身份校验、SHA-256、v0→v1 的证据完整迁移、未知字段/坏 JSON/坏摘要/坏状态拒绝，以及临时文件—备份—替换写入路径；加载按主文件→有效 `.tmp`→有效 `.bak` 确定性恢复。
- `godot/src/application/persistence/battle_recovery_repository.gd`：版本化 pending/committed 恢复记录；验证 player attack 与 AI defense 的顺序、mode、battleId、战略 fingerprint，并复用生产存档状态；恢复记录同样支持 `.tmp`/`.bak` 失效窗口恢复，清理覆盖三种路径。
- `godot/src/application/game_session/game_session.gd`：生产战役的 save/load/migration 接线、campaign hint 的跨 JSON 数值类型归一化、恢复记录 API，以及 `settle_tactical_battle` 的已提交标记与 exact-once 重启语义。
- `godot/src/domain/tactical/battle_commands.gd`：为恢复仓库暴露确定性 battle id 与 attack-order 校验边界。
- `godot/tests/production_save_recovery_runner.gd`：126 项 Godot 断言，覆盖真实 Web `createSaveEnvelope` 产出的 v1 生产状态迁移、目录/战役身份失配主存档选择有效 fallback、Godot v0 迁移、非数值/超安全整数契约字段和其他恶意输入原子拒绝、主存档损坏时 `.tmp`/`.bak` fallback 安全提升并保留 `.invalid` 证据、Web 生成的玩家/AI pending 与 committed fixture 直接消费、committed 源/战后状态绑定篡改拒绝、pending→committed revision lineage 冲突保护、玩家 pending→committed、pending/committed 冲突与幂等、提交记录类型拒绝、单调 saveRevision 主存档优先级和真实 settlement 重启恢复。
- `godot/data/fixtures/godot-production-save-recovery-v1.json` 与 `scripts/generate-godot-production-save-recovery-fixture.ts`：由真实 TypeScript/Web `createSaveEnvelope` 及 migration oracle 生成的语言无关输入/输出 fixture，包含 Web v1、生产 envelope、v0 envelope、两类 pending、committed 和损坏变体。
- `scripts/run-godot-production-save-recovery-verification.mjs`：使用 Godot 4.7.1 headless，并将 APPDATA/LOCALAPPDATA 隔离到被忽略的 `godot/.runtime-user/run-<pid>-<random>/`，每次验证使用新目录，避免本机 Godot 用户目录权限问题、PID 复用和并发验证互相污染结果。
- `package.json`：将生产存档恢复验证纳入根 `npm run check`。

## 验证证据

| 检查 | 结果 |
|---|---|
| Godot 引擎 | `4.7.1.stable.official.a13da4feb` |
| `npm run godot:production-save:verify` | 通过，126 项断言；真实 Web `createSaveEnvelope` v1 生产状态迁移、目录/战役身份失配时有效 fallback 选择、Godot v0 迁移、非数值/超安全整数和其他坏输入原子拒绝、主存档损坏时 `.tmp`/`.bak` 中断窗口恢复与 `.invalid` 保留、Web fixture 直接消费、committed 源/战后状态绑定与篡改/类型拒绝、pending→committed revision lineage 冲突保护、pending/committed 冲突与幂等、committed exact-once、单调 saveRevision 防冷启动回滚和真实结算重启恢复均通过 |
| `npm run check` | 通过；程序自检、时期数据、应用事务、MB13–MB20 Godot runner、presentation、51 个 vendored C 文件、Vitest 47 文件/378 测试（2 文件/4 测试按既有条件跳过）和 Web build 全部通过 |
| Web 对照 | fixture 由 `buildProductionEnvelope`、`createProductionSessionState`、`createBattleId` 与 `createBattleStrategicFingerprint` 生成；状态 SHA、战斗标识和战略 fingerprint 与 Godot 对照 |
| 受限内容审计 | MB20 未新增原版图片、字体、音频、视频、WASM、`.lib`、`dat.lib.orig` 或 `.reference` 构建依赖 |

## 规则边界与已知风险

本 Mission 交付的是生产存档/恢复的契约和真实 settlement 的崩溃恢复边界，不是完整存档 schema 的全量版本历史迁移。当前仅支持完整 schema 6 / data contract 2 / `baye-classic-v1` 的真实 Web v1 存档和 Godot v0 输入；Web schema 1–5、legacy ruleset、缺少 campaign 或完整状态时不会猜测。`save_game` 仍保留 MB01 spike 存档路径，以免破坏旧样片调用；生产 campaign 才使用新 envelope。原子替换使用同一 user 数据目录下的临时文件和备份；如果进程在 rename 窗口停止，下一次加载按主文件、临时文件、备份文件顺序读取第一个完整且校验通过的 envelope，不承诺跨文件系统事务或损坏磁盘恢复。

`stateSha256` 只覆盖完整 `GameState`，不覆盖 `saveRevision`、`parentSaveRevision` 等 envelope 元数据；本阶段以安全整数上界、源/战后状态绑定和单调版本比较限制正常恢复路径。对“元数据被合法改写为另一个整数”的篡改，完整 envelope metadata digest 留待后续存档契约版本，不把它宣称为本阶段已解决。

Godot headless 运行会输出 Windows root certificate store warning；本机默认 Godot 用户目录不能创建 `user://logs`，验证脚本已使用仓库内被忽略的隔离用户目录解决该环境问题。该措施只服务自动验证，不改变 Android/桌面发布时的用户数据位置。Android Debug APK、MuMu/真机和双横屏尺寸仍属于 MB23。

## 人工复验步骤

1. 使用 Godot 4.7.1 打开 `godot/project.godot`，运行主场景；确认既有 MB18 战略/战术样片仍能启动。
2. 执行 `npm run godot:production-save:verify`，确认输出 `PASSED: 126 assertion(s)`；检查 `godot/data/fixtures/godot-production-save-recovery-v1.json` 中的 `webSaveV1`、`saveRevision`、`stateSha256`、`campaign`、pending、committed、`sourceStrategicSave` 与 `settlementResult` 记录。
3. 在生产战役中保存并重启 session，确认时期、曹操身份、38 城状态和状态摘要保持不变；将保存 JSON 改成未知字段、坏摘要或截断 JSON，确认加载失败且当前 session 不被替换；再把完整保存复制为 `.tmp` 或 `.bak` 并移除主文件，确认加载报告 fallback 来源且状态不变。
4. 在结算前写 pending 恢复记录，模拟重启后调用恢复；在结算后重启，确认返回 `already_committed` 而不会再次扣资源或重复日志。
5. 执行 `npm run check`，保留 Godot、Web oracle、参考文件和 build 输出作为验收证据。

## 下一步

MB20 完成后进入 MB21：主菜单、战役设置和完整战略 UI；战术 HUD/设置与 Android/Windows hardening 仍按 MB22/MB23 排队。
