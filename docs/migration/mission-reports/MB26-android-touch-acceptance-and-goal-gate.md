# MB26 Android 触控验收与 Goal 收口报告

## 结果

MB26 完成了当前源码可执行的自动化 Android acceptance gate，并把剩余外部证据收束为 Android 模板安装、当前源码重新导出和人工设备动作，而不是继续猜测坐标或伪造通过。现有 MuMu APK 记录是在 05:02 导出的，早于 MB25 05:22 的代码修复和本轮 MB26 改动；本轮尝试重新导出时，Godot 4.7.1 明确报告缺少官方 Android Debug export template，因此旧 APK 不能作为当前源码候选。旧 APK 仍可证明此前安装/冷启动路径；其 ADB 键盘导航可以进入战役设置。普通 ADB tap、touchscreen tap 以及 MuMu CLI toolbar tap 在此前 90° 旋转窗口均未命中主菜单控件，因此真实触摸仍不能宣称通过。

## 自动与设备证据

- 旧诊断 APK：`godot/builds/sanguo-baye-godot-mb25-debug.apk`，57,887,025 bytes（约 55.2 MiB / 57.9 MB），SHA-256（`Get-FileHash` 与 `certutil` 独立复核）`794D19D35290452B8D47B070248F541EB1C96984E56CEFC8890DDCFD6F26B7C6`；导出时间 2026-08-04 05:02:01，早于 MB25/MB26 修复。
- 当前源码 APK：尚未形成。4.7.1 编辑器缺少 `4.7.1.stable/android_debug.apk` 导出模板；安装模板需用户明确批准下载/安装，故没有把旧 APK 冒充为当前候选。
- 引擎：Godot 4.7.1 stable `a13da4feb`；包 `com.sumo91.sanguobaye.godotspike`；MuMu `127.0.0.1:5555` / `127.0.0.1:16384`，Android 15 API 35，x86_64。
- `adb install -r` streamed install 成功；`monkey -p com.sumo91.sanguobaye.godotspike 1` 启动 `GodotAppLauncher`；`pidof` 返回活动进程；冷启动截图显示原生主菜单。
- `input keyevent 66` 进入“战役设置”，证明 APK、焦点路由和场景切换可运行；该路径不是触摸验收证据。
- `input tap`、`input touchscreen tap` 和 `mumu-cli control --vmindex 0 tool cmd --cmd "input tap …"` 均未激活主菜单“开始新战役”。设备报告 physical 1440×2560、surface orientation 1（横屏 90°），与既有旋转注入问题一致。

## 自动回归

- 组件门禁通过：Godot 4.7.1 全领域/主场景/迁移/存档/呈现检查、Web 47 个测试文件 378 tests、生产构建均通过；本轮聚合 `npm run check` 在本机执行器超时，需在 Android 模板安装后重新跑完整聚合命令，不能把超时写成通过。
- production save/recovery：139 assertions；覆盖 committed crash-window、battleId 消费、stale marker 隔离和 exact-once。
- tactical presentation：125 assertions；覆盖 1280×720 与 844×390 的战术输入、终局前旧 ongoing 检查点被 terminal 快照替换、同战斗旧 ongoing 拒绝、暖/冷终局回写、post-state 检查点验证、完整 settlement canonical digest 对照、重复返回幂等和离场确认框 48px 触控目标。
- campaign setup presentation：62 assertions；38 城、54 道路和生产 GameSession 入口通过。
- 三路只读复核：架构与确定性 P0/P1=0；终局呈现纵向测试缺口及旧 ongoing 崩溃窗口已收口，仍保留应用层结算协调器和 pause/recovery 仓库耦合 P2；移动审查保留“当前源码 APK + 真实设备触控”P1，且 MuMu 当前 ADB 状态为 offline。

## 人工验收交接

请在 MuMu 可见窗口或横屏真机上，用真实鼠标/手指执行以下动作并保留截图：

1. 主菜单“开始新战役”→时期/君主选择→“进入战略地图”。
2. 38 城战略地图拖动、双指/滚轮缩放、点选城池与空间化城池卡命令入口。
3. 进入战术样片，执行移动/攻击/休整或结束回合；用 Android Back 验证“继续战斗/放弃并返回”确认框。
4. 后台暂停或强停后重新启动，从主菜单恢复战术检查点；终局后返回战略并确认资源、RNG 和保存状态只结算一次。
5. 在 1280×720 和 844×390 横屏布局分别记录安全区、按钮触控范围、拖动/缩放和返回结果。

在 Android 模板安装、当前源码 APK 重新导出并完成这组动作前，Android-first 触控 P1 和完整 Goal 不能标记为完成。APK 仍是本地 Debug 产物；没有推送、PR 或发布。

## 收口决定

本报告支持“继续全面迁移、等待 Android 模板/当前 APK/设备触控证据”的有条件结论。它不修改 MB00 固定条款、不提升未经证实的 BBK 原机 ABI/parity 声明，也不把键盘/ADB 结果替代为人工触摸通过。Goal 保持 active，后续应先完成模板安装与当前源码导出，再围绕用户可见设备验收、最终 provenance 决策推进。
