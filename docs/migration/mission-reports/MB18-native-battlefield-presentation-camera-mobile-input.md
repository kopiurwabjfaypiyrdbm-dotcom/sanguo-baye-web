# MB18 完成报告：原生战术战场、镜头与移动端输入

## 结论

MB18 已将一个真实可运行的战术快照接入原生 Godot 表现层。主场景可进入 `TacticalBattleScreen`，由 `Node2D + Camera2D + CanvasLayer/Control` 绘制完整 12×8 战场、城池目标、攻守双方单位和选中反馈；所有移动、攻击、计谋和休整仍通过 `TacticalBattleSession` 的命令 envelope 执行，场景不持有规则真相。

## 交付内容

- `godot/scenes/presentation/tactical_battle_screen.tscn` 与 `godot/src/presentation/tactical_battle_screen.gd`：原生战场绘制、平滑镜头、边界约束、鼠标拖动、触摸拖动、滚轮/双指缩放、取消触摸保护、点击选中和空间化命令面板。
- `godot/src/application/tactical_battle/tactical_battle_demo_factory.gd`：应用层组合经过 `TacticalBattleSession` 校验的样片快照；表现层只消费 snapshot/query，不制造权威战术合同。
- `godot/scenes/presentation/strategy_screen.tscn`、`godot/src/presentation/strategy_screen.gd`：战略地图加入可发现的“战术战场样片”入口。
- `godot/tests/tactical_battle_presentation_runner.gd`、`scripts/run-godot-tactical-battle-presentation-verification.mjs`：以 1280×720 与 844×390 横屏尺寸重复验证快照恢复、12×8/双方单位、点选、缩放、拖动、移动和休整命令。
- `package.json`：将 presentation verify 纳入 `npm run check`。

## 验证证据

| 检查 | 结果 |
|---|---|
| Godot 引擎 | `4.7.1.stable.official.a13da4feb` |
| 主场景/编辑器解析 | 4.7.1 headless editor smoke 通过；`project.godot` 保持显式主场景 |
| `npm run godot:tactical-presentation:verify` | 通过；两个横屏尺寸共 50 项断言，覆盖鼠标拖动、单指拖动、双指缩放、pinch 后续拖动、取消触摸、命令 digest、非法/终局反馈、保存恢复和镜头边界 |
| 场景启动 | strategy 与 tactical 场景 headless 启动通过 |
| 规则边界 | MB17 AI 112 项断言、既有 battle/movement/attack/skill runner 保持通过 |
| 三路只读审查 | 架构、确定性/fixture、Android/触控最终 P0/P1/P2 均为 0 |
| 受限内容审计 | 未新增原版图片、字体、音频、视频、WASM、`.lib`、`dat.lib.orig` 或 `.reference` 构建依赖 |

headless 运行仍可能输出 Windows root certificate store warning；不影响脚本 runner 退出码。用户本机 Godot 4.7.1 GUI 进程出现 Windows “应用程序错误”弹窗，直接用 console binary 启动默认主场景也出现 Godot signal 11，因此当前证据刻意采用同版本 headless editor smoke 与 presentation runner；GUI/驱动稳定性和 Android APK/MuMu 设备验证仍是平台风险，需在 MB23 关闭，不能把 headless 证据当作最终设备验收。

## 设计取舍与剩余风险

本 Mission 使用轻量自绘地形和单位图形，以 Camera2D、Tween、原生触控事件和空间邻近面板展示 Godot 客户端价值，不复制 WebView/Phaser/JSBridge。镜头按 HUD 逻辑避让区约束并在手势/尺寸变化时取消 Tween；按钮按窗口到逻辑视口比例放大，保留移动端最小触控目标。样片快照由应用层 demo factory 组合并经 `Session` 校验，表现层只派发命令和渲染结果；正式战役接线、完整战术 HUD、结果/撤退/粮草结算和战略回接属于 MB19、MB22。当前逻辑避让区不读取 Android 实际刘海/系统手势 inset，平台 safe-area 与设备验收保留给 MB23。

## 人工复验步骤

1. 使用 Godot 4.7.1 headless 或可用 GUI 打开 `godot/project.godot`，运行主场景，点击战略地图顶部的“战术战场样片”。
2. 在横屏窗口分别调整到 1280×720、844×390：拖动战场、滚轮/双指缩放，点击曹操或守军，确认选中环和邻近命令面板。
3. 点击“移动”后“休整”，观察状态摘要和兵力/行动标记变化；确认场景脚本没有直接改写规则状态。
4. 运行 `npm run godot:tactical-presentation:verify` 和 `npm run check`，保留 headless 输出作为回归证据。
