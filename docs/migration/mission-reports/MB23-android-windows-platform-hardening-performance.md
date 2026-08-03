# MB23 平台加固报告：Android/Windows、导出与设备证据

## 当前结论

MB23 已完成本地平台加固、Godot 4.7.1 Android Debug 导出、MuMu 安装/启动、横屏尺寸、返回键和暂停/恢复证据。MuMu 的稳定 ADB 端点是 `127.0.0.1:5555`（`emulator-5554` 是另一个陈旧/不稳定的端点，不能作为验收设备）。APK 未使用 WebView、网络或浏览器运行时。Mission 仍保留一个人工触摸验收缺口：MuMu 的 `adb shell input tap` 在当前旋转窗口上没有产生可观察的 Godot 控件变化，因此键盘导航和渲染截图已验证，物理触控/镜头拖动仍需人工在 MuMu 窗口完成。

## 已完成

- `godot/project.godot` 保持 1280×720 landscape viewport、`window/handheld/orientation=4`、GL Compatibility renderer/mobile renderer，并新增 `AndroidBackRouter` autoload。
- `godot/src/platform/android/android_back_router.gd` 只负责平台系统返回、暂停和恢复通知；返回路由到当前场景的战术/战略/设置边界，不拥有 `GameState`、`GameSession` 或 RNG。项目显式关闭 `application/config/quit_on_go_back`，避免 Godot 在通知处理后自动终止进程。
- 使用 Godot `4.7.1.stable.official.a13da4feb`、本机 Android SDK API 36/37、build-tools 36.0.0 与 JDK 21，导出当前 HEAD Debug APK 成功。

## APK 证据

| 项目 | 结果 |
|---|---|
| 命令 | `Godot_v4.7.1-stable_win64_console.exe --headless --path godot --export-debug "Android Debug" "builds/sanguo-baye-godot-mb23-debug.apk"` |
| 产物 | `godot/builds/sanguo-baye-godot-mb23-debug.apk`（Git 忽略） |
| 大小/SHA-256 | 57,862,027 bytes（约 55.2 MiB/57.9 MB） / `9EAEEFEAB7CA3A163DD37D58AEE54DA56C772EA326741B5E4263DE3A9755D4AB` |
| 签名 | `apksigner verify --verbose`：APK v2、v3 有效，1 个 signer |
| Manifest | `com.sumo91.sanguobaye.godotspike`，versionCode 1，minSdk 24，targetSdk 36，`screenOrientation=11` 横屏，`resizeableActivity=true`，无网络权限 |
| 包扫描 | 278 个条目；未发现 WebView/JavaScript/WASM、`dat.lib`、字体、音频或视频载荷；保留 Godot 模板的正常 Android 运行库 |

## MuMu 设备结果

- SDK `platform-tools\adb.exe version 37.0.1-15733141` 可执行；MuMu 自带 ADB 36.0.0 也可执行。
- `adb connect 127.0.0.1:5555` 与 `adb connect 127.0.0.1:7555` 可发现同一 MuMu 实例；本报告统一使用 `127.0.0.1:5555`。`emulator-5554` 仍可能显示为陈旧设备，不纳入结果。
- 安装：`adb -s 127.0.0.1:5555 install -r godot/builds/sanguo-baye-godot-mb23-debug.apk` 返回 `Success: streamed 57862027 bytes` 与 `Success`。
- 启动：`monkey -p com.sumo91.sanguobaye.godotspike 1` 成功；`mFocusedApp` 为 `com.sumo91.sanguobaye.godotspike/com.godot.game.GodotAppLauncher`。
- 启动日志确认 Godot 4.7.1、`gl_compatibility`、OpenGL ES 3.2 Qualcomm Adreno 640；未出现 `FATAL EXCEPTION`、`SIGSEGV`、`SIGABRT` 或脚本解析错误。
- 交互截图（均保存在本机 `C:\tmp\sanguo-mb23`，不进 Git）：主菜单 `router-back-config-fixed.png`；2560×1440 战略地图 `strategy-2560x1440.png`；1280×720 战略地图 `strategy-1280x720.png`；844×390 战略地图 `strategy-844x390-2.png`。截图显示时期 1、38 城节点和道路均已渲染，紧凑尺寸下工具栏和状态栏仍可见。
- 返回键：在战役设置页发送 Android Back 后，`mFocusedApp` 仍为 Godot，截图回到主菜单；开启 `application/config/quit_on_go_back=false` 后没有 `OnGodotTerminating`。
- 生命周期：发送 Home 再重新启动后，logcat 出现 Godot `OnPause`/`OnResume`，前台 Activity 恢复，未出现崩溃。
- 尺寸：使用 `wm size 1280x720` 与 `wm size 844x390` 分别截图，完成后执行 `wm size reset`；两种覆盖尺寸均保持横屏并能显示原生 UI/地图。MuMu 物理尺寸为 `1440x2560`，旋转后窗口为 `2560x1440`。
- 触控：多组 `adb shell input tap/touchscreen` 坐标探测没有改变 Godot 画面，判断为当前 MuMu 旋转窗口的 ADB 触控坐标映射/注入限制，而非将其算作触控通过。键盘焦点导航可完成主菜单→战役设置→君主选择→战略地图；人工验收需在 MuMu 窗口上用鼠标/触摸复核按钮、拖动、缩放、点城。

## Windows/自动化证据

- Godot 正式 GUI 和编辑器的 GL Compatibility 启动/退出 smoke 已在 MB21 通过；默认渲染器原始 `0x58` 原生访问冲突仍作为环境风险。
- MB22 tactical presentation runner 仍通过 74 assertions；Godot/规则/Web 基线在 MB22 最后一次 `npm run check` 通过。
- 当前设备阻断前已完成的 APK 导出不改变确定性规则、seed、fixture 或存档契约。
- `dumpsys gfxinfo`（战略地图运行后）：70 frames、1 janky frame（1.43%）、50th percentile 5 ms、90th percentile 6 ms、GPU 1 ms；无 missed-vsync。重复尺寸切换后的 `dumpsys meminfo` 峰值约 TOTAL PSS 343,341 KB/RSS 432,432 KB；新进程主菜单基线约 PSS 282,623 KB/RSS 364,920 KB，Native Heap 145,524 KB。该数据用于后续性能基线，不声称已完成全面优化。

## 未关闭风险与下一步

- 仍需人工在 MuMu 窗口复核真实触摸命中、地图拖动/缩放、节点点选、战术 HUD 入口，以及保存后重新载入；自动化与渲染证据已保留，但不替代该人工触控步骤。
- Windows GL Compatibility smoke 仍沿用 MB21 的通过结果；默认渲染器在本机的原生 `0x58` 崩溃仍是环境风险，不能据此宣称默认渲染器稳定。
- 在人工触控步骤完成前，MB23 的设备证据保持“部分完成”状态；长期 Goal 保持 active，不把 MuMu 的陈旧 offline 端点或未执行的物理触控算作通过。
