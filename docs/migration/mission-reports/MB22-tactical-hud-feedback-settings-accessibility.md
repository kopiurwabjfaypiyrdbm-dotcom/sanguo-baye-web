# MB22 完成报告：战术 HUD、反馈、设置与辅助功能

## 结论

MB22 已完成代码与自动证据闭环。战术样片现在以原生 Godot HUD 呈现天数、当前阵营、存活单位、选中单位属性、合法动作、回合结束和战果入口；成功与拒绝命令均通过状态反馈显示。设置面板支持大字、高对比度、减少镜头动画和操作提示开关，设置只影响 presentation，不进入战斗状态。场景返回继续复用 application-owned tactical session，不把规则状态挂到节点树。

本 Mission 没有新增 WebView、JavaScript、浏览器运行时或受限原版素材。Android 生命周期、刘海安全区的设备实测、APK/MuMu 安装和性能采样继续留在 MB23；Windows 默认渲染器曾出现的 `0x58` 原生访问冲突仍按 MB21 记录，兼容渲染器启动 smoke 已通过。

## 交付内容

- `godot/src/presentation/tactical_battle_screen.gd`：扩展战术顶部 HUD、回合/战果栏、选中单位信息、反馈状态、取消键导航、响应式安全区与触控目标；新增原生设置面板和大字/高对比度/减少动画/提示开关。
- `godot/tests/tactical_battle_presentation_runner.gd`：在 1280×720 与 844×390 覆盖 HUD 元数据、48px 级物理触控目标、设置切换、鼠标/触摸/双指输入、无效命令不变更状态、移动/休整/结束回合、相机边界和战术 session 恢复。
- `scripts/run-godot-tactical-battle-presentation-verification.mjs`：拒绝 `SCRIPT ERROR`、`Node not found` 和 `Parse Error` 的假绿色 runner 输出。
- `docs/mission-briefs/MB22-tactical-hud-feedback-settings-accessibility.md`：本 Mission 的唯一自包含简报。

## 验证证据

| 检查 | 结果 |
|---|---|
| Godot 引擎 | `4.7.1.stable.official.a13da4feb` |
| `npm run godot:tactical-presentation:verify` | 通过，74 项断言；1280×720 与 844×390 均覆盖 tactical HUD、设置、鼠标/触摸/双指、命令反馈、回合推进和相机边界 |
| 既有 tactical/domain fixtures | MB13–MB19 的 battle、movement、attack、skill、AI、outcome、settlement fixture 继续由 `npm run check` 验证，presentation 只调用已验证 `TacticalBattleSession` |
| 兼容渲染器 GUI smoke | MB21 已实际运行 Godot 正式可执行文件与编辑器 `--rendering-method gl_compatibility --quit-after 5`，均退出码 0；本 Mission 未宣称默认渲染器根因已解决 |
| `npm run check` | MB22 回修后通过；应用事务 1690、战术各域、生产存档 126、campaign entry 12、campaign setup 62、tactical presentation 74、Web Vitest 47 文件/378 测试和 Web build 全部通过 |
| 受限内容审计 | 未新增原版图片、字体、音频、视频、WASM、`.lib`、`dat.lib.orig` 或 `.reference` 构建依赖 |

## 架构与确定性边界

`TacticalBattleSession` 仍是战斗状态、seed、命令 envelope、验证和 receipt 的唯一权威；HUD 只读取 snapshot 并提交带 `expectedBattleStateSha256` 的命令。设置开关保存在 presentation Node 内，不改变 battle snapshot、RNG 或存档契约。单位 ID、地图绘制和触控双指 ID 均显式排序；拒绝命令保留原 snapshot，成功命令刷新 HUD 与状态摘要。

## 已知风险与非目标

- 本 Mission 没有在 MuMu/真机上安装 APK，也没有实测 Android 返回键、生命周期暂停/恢复、刘海安全区或设备 GPU；由 MB23 负责。
- 默认渲染器的 Windows `0x58` 应用程序错误尚未找到根因；兼容渲染器 smoke 通过不等于默认渲染器和所有设备组合均通过。
- 设置目前是运行时 presentation 选项，不承诺跨进程持久化；完整设置存档、国际化和系统级无障碍适配留待后续按证据扩展。
- 未扩展完整战术规则、正式美术/音频、Godot Web 或发布构建。

## 人工复验步骤

1. 在 Godot 4.7.1 兼容渲染下进入战术样片，分别使用 1280×720 和 844×390 横屏检查顶部 HUD、底部回合栏和选中单位卡片不遮挡核心棋盘。
2. 点击我方单位，执行移动、休整、结束本方回合；选择敌方或无效目标，确认拒绝反馈且状态摘要不变。
3. 打开“设置”，切换大字、高对比度、减少镜头动画和操作提示，确认 HUD/按钮即时更新；按系统返回键或取消键关闭设置并返回战略地图。
4. 在真实 Android/MuMu 上复验安全区、触控命中、系统返回、暂停恢复和 GPU 渲染，结果写入 MB23 报告。

## 下一步

MB22 完成后进入 MB23：Android/Windows 平台 hardening、APK 导出、设备安装、性能与生命周期证据。长期 Goal 保持 active，不推送、不创建 PR。
