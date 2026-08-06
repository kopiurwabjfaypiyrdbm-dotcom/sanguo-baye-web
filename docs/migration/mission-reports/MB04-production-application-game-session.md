# MB04 生产应用 GameSession 完成报告

日期：2026-08-02
引擎：Godot 4.7.1 stable official `a13da4feb`
语言：GDScript

## 结果

Godot 主场景已从 MB01 样片数据入口切换到生产 `GameSession`，默认明确启动时期 1、`rulerSourceIndex: 1`（曹操）。会话位于场景树外并独占一个 `GameState`；时期 1–4 catalog 中的全部 50 个玩家候选都能在不改变初始 seed 的情况下启动。

应用层新增版本 1 的闭合 command/result envelope、统一 dispatcher、乐观并发摘要门、确定性 command ID 幂等缓存以及稳定只读查询。当前真实命令 `develop_farming` 仍由纯领域实现执行；只有 next state 通过完整验证和 canonical SHA-256 后才由会话一次提交。主场景通过通用命令入口下令，并通过 query 边界取得开垦可用性与默认执行者。

MB01 v1 数据、专用样片启动、最小存档和历史 fixture 未删除。`restore_snapshot()` 只承担本 Mission 的内存快照恢复演练，不冒充 MB20 的生产存档 schema。

## 跨语言证据

TypeScript oracle 适配器为 `src/core/migration/applicationSessionContract.ts`，共享 fixture 为 `godot/data/fixtures/application-session-suite-v1.json`。时期 1/曹操覆盖 13 路：

1. 成功开垦；
2. 完全相同的重复提交；
3. 陈旧 before 摘要；
4. 领域规则拒绝；
5. command ID 冲突；
6. 未知命令；
7. 未知 envelope 版本；
8. 缺失参数；
9. 多个未知字段的稳定错误顺序；
10. 错误参数类型；
11. 仅含 NBSP 的命令 ID，按共享 Unicode 空白契约拒绝；
12. 第二条成功事务；
13. 状态继续前进后重发首条命令，返回当前状态的 `already_committed`。

Godot 对每路完整 result envelope、receipt、前后摘要和状态证据计算 canonical SHA-256，与 TypeScript 输出一致。成功只提交一次；所有失败路径前后摘要相同。另以新会话验证提交后快照恢复摘要一致，以及从同一初始状态重放产生相同事务结果。

## 验证结果

- `npm run check`：通过；47 个测试文件通过、2 个跳过，375 项测试通过、4 项参考测试跳过；TypeScript build 与 Web production build 通过。
- `npm run godot:application-session:verify`：通过；13 路共享事务 fixture，Godot 365 项断言。
- `npm run godot:domain-data:verify`：通过；4 时期、99 项断言。
- `npm run godot:migration-check`：通过；7 个 canonical 向量、2 个回放、4 个步骤及 4 类负向拒绝演练。
- `godot/tests/run_all.gd`：通过；143 项领域/样片存档断言。
- `godot/tests/presentation_input_smoke.gd`：通过；8 项地图、触控和生产事务主场景断言。
- Godot 4.7.1 editor headless import：通过；主场景 headless 启动通过。
- 来源/包内容扫描：未新增原版受限素材、WASM、WebView、JSBridge、浏览器或网络依赖。fixture/tests 继续由 Android export preset 排除。

最终 Debug APK 由精确引擎 `Godot_v4.7.1-stable_win64_console.exe` 导出，大小 57,293,247 bytes，SHA-256 为 `AE228DC988F090A30BC1CC4ABD99B70AA6F74D27EBBEE118F279282825BC8010`。Android manifest 未声明任何权限；包内含 catalog 与时期 1–4 数据以及原生 GDScript/scene 产物，不含 tests/fixtures。

APK 已覆盖安装到 MuMu `emulator-5554`（Android model `SM_G9900`）并离线启动。1280×720 与 844×390 两档横屏均显示完整 38 城地图；两档均实际触摸点选濮阳并展开贴近节点的城池卡片。两档均从卡片触发真实开垦，界面由 seed `48641`、农业 `1238`、金钱 `135` 更新为 seed `373686124`、农业 `1301`、金钱 `85`，与共享 fixture 一致。Android logcat 未见脚本错误或崩溃；Adreno 首次启动出现一次 shader cache 重编译警告，不影响运行。

Godot 验证进程在受限环境直接访问用户 AppData 时可触发 4.7.1 引擎 signal 11；runner 现将 `APPDATA/LOCALAPPDATA` 隔离到被忽略的 `godot/.godot/runtime/`，之后所有 runner 稳定通过。离线 headless 运行仍会输出无法读取系统根证书的非致命警告；项目未请求网络权限。

## 架构决策

- `GameSession`、`GameState`、dispatcher 和 queries 均为 `RefCounted`，不成为 Node/Autoload。
- 初始数据与运行态分别调用 `validate_initial()` / `validate_runtime()`，共享闭合 state/entity shape；尚未移植的 phase/order/intel/discovery/status 继续安全拒绝，后续 Mission 只扩 runtime 分支。
- presentation 可读取深拷贝快照绘图，但不持有领域状态引用，也不重新实现命令合法性。
- `commandId + canonical request SHA-256` 的 256 条有序紧凑窗口处理完全重复、前进后的 `already_committed` 与 ID 冲突；`expectedStateSha256` 拒绝超窗陈旧写入。
- 不使用时间、帧序、默认 RNG 或 Dictionary 遍历顺序产生权威结果。
- 全量存档、幂等记录持久化、多槽和 schema 迁移留给 MB20。

## 审查与修复

三路只读审查分别覆盖 Godot 架构/场景树、确定性/fixture、Android/触控。首轮发现的状态闭合校验、恢复身份、幂等窗口、Unicode 标量排序、查询边界、生产存档误导和 Android 验证隔离问题已修复并加入回归；确定性复审发现的 NBSP 跨语言空白差异也已由共享显式码点集合和第 13 路 fixture 关闭。最终复审以当前源码、13 路 fixture、统一工程验证及最终 APK 设备证据为准；关闭门要求 P0、P1 和本阶段引入的 P2 均为零。

最终关闭复审结论：架构 `P0 0 / P1 0 / P2 0`，确定性 `P0 0 / P1 0 / P2 0`，Android/触控 `P0 0 / P1 0 / P2 0`；三路均允许关闭 MB04。

## 剩余范围

MB04 没有新增其他战略规则、月循环、AI、战术或生产存档。下一 Mission MB05 应在本应用边界上迁移城池经济与开发规则，并为每个新增命令扩展同一版本化 dispatcher 与 MB02 fixture 平台。
