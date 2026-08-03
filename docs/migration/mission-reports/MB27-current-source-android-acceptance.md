# MB27 当前源码 Android 验收与 Goal 决策报告

## 当前结果

MB27 已完成当前源码 APK 的导出、安装和冷启动诊断，但尚未完成真实鼠标/手指触控验收，因此 Goal 保持 active，Android-first P1 保持开放。没有把 ADB 注入结果写成物理触控通过。

## 当前源码 APK

- 路径：`godot/builds/sanguo-baye-godot-mb27-debug.apk`
- 导出：Godot 4.7.1 stable `a13da4feb`，GDScript，2026-08-04 06:05:56
- 大小：57,887,025 bytes（约 55.2 MiB / 57.9 MB，不是 5 GB）
- SHA-256：`D7E81F4ADBC81B5280BAFBC26B8897CC03688E30D410E51CAF8EE14D34807694`（`Get-FileHash` 与 `certutil`）
- 包：`com.sumo91.sanguobaye.godotspike`，versionName `0.1.0-spike`，versionCode `1`
- 静态边界：`aapt2 dump permissions` 仅列包名，未发现 INTERNET；没有 WebView/JSBridge/WASM 依赖。仍有 `mipmap/themed_icon` 缺失警告，列为 P2，不阻止启动。

## MuMu 运行诊断

- ADB：`emulator-5554`，安装在 06:06:36 后 streamed install 成功，冷启动进程 PID 可见。
- Android 15 / API 35，x86_64；物理面板 1440×2560，density 360，surface orientation 1（横屏旋转）。
- 冷启动截图：[mb27-current-launch.png](../../godot/builds/mb27-current-launch.png)。画面显示原生主菜单和 Godot 4.7.1 标识。
- ADB `input tap 1280 795` 进入战役设置，截图：[mb27-after-adb-tap.png](../../godot/builds/mb27-after-adb-tap.png)。这是坐标注入诊断，不是人工触控证据。
- 运行过程未观察到安装失败、Java/FATAL 崩溃或进程立即退出；首次安装尝试遇到短暂 `device offline`，重试后成功。

## 自动回归

- tactical presentation：125 assertions；覆盖 terminal checkpoint 替换旧 ongoing、同战斗旧 ongoing 拒绝、完整 terminal projection/settlement digest、warm/cold exact-once、真实 `_return_to_strategy()` 场景切换/清理和 1280×720/844×390 输入。
- production save/recovery：139 assertions。
- campaign setup presentation：62 assertions；38 城、54 道路和生产 GameSession 入口。
- Web：47 个测试文件、378 tests，构建通过。
- 聚合 `npm run check`：退出码 0，通过；本轮耗时约 547 秒。日志中的 migration replay 失败项属于预期的负向篡改演练，未改变聚合命令成功结果；根证书、弹窗位置和 Android build-tools 提示为环境警告。

## 尚未关闭的 P1 与人工交接

当前工具边界没有可审计的 MuMu 可见窗口鼠标/手指操作，因此仍需用户在可见 MuMu 窗口或横屏真机上完成并保留截图：

1. 主菜单开始新战役 → 时期/君主 → 进入战略地图。
2. 38 城地图拖动、缩放、点城、空间化命令入口。
3. 进入战术，执行移动/攻击/回合/Android Back 确认。
4. 后台暂停或强停后冷启动恢复，终局返回战略并确认只结算一次。
5. 在 1280×720 与 844×390 两种横屏配置记录安全区、按钮可点性、拖缩和返回结果。

在这些动作完成前，不能宣称 Android-first 接受完成，也不能完成 MB00 Goal。当前 ADB/键盘/坐标注入结果只用于定位输入坐标和程序稳定性。

## 决策

继续 Goal，下一步等待用户可见设备触控证据和最终聚合门禁结果；不推送、不创建 PR、不发布 APK/AAB。`mipmap/themed_icon`、DPI-aware 触控尺寸、真实 `_return_to_strategy()` 场景切换纵向覆盖仍作为 P2 后续加固项，若实机暴露为功能问题再升级处理。
