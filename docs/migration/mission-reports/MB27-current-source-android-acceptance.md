# MB27 当前源码 Android 验收与 Goal 决策报告

## 当前结果

MB27 已完成当前源码 APK 的导出、安装和冷启动诊断，但尚未完成真实鼠标/手指触控验收，因此 Goal 保持 active，Android-first P1 保持开放。没有把 ADB 注入结果写成物理触控通过。

## 当前源码 APK

- 路径：`godot/builds/sanguo-baye-godot-mb27-touch-debug.apk`
- 导出：Godot 4.7.1 stable `a13da4feb`，GDScript，2026-08-04 12:17:16（使用现有本机 Android Debug 模板）
- 大小：57,825,764 bytes（约 55.2 MiB / 57.8 MB，不是 5 GB）
- SHA-256：`6498C8B827D34385EB8E9B6B71F4C69E8283A447D173367306F4454BAF80EBE8`（`Get-FileHash`）
- 包：`com.sumo91.sanguobaye.godotspike`，versionName `0.1.0-spike`，versionCode `1`
- 静态边界：`aapt2 dump permissions` 仅列包名，未发现 INTERNET；没有 WebView/JSBridge/WASM 依赖。当前 APK 资源审计包含 25 个 launcher icon 条目，覆盖 `icon.webp`、foreground/background 和各密度 `icon_monochrome.webp`，没有 `mipmap/themed_icon` 条目；Godot 稳定 Android 导出文档将 Themed Icons 定义为可选、由 monochrome icon 启用，因此此前的 `mipmap/themed_icon` 提示解释为工具链/启动器提示，不是项目缺失资源，不再列为产品 P2。

## MuMu 运行诊断

- ADB：MuMu 稳定端点 `127.0.0.1:16384`，当前 streamed install 后冷启动进程可见。
- Android 15 / API 35，x86_64；物理面板 1440×2560，density 360，surface orientation 1（横屏旋转）。
- 冷启动截图：[mb27-touch-current-launch.png](../../godot/builds/mb27-touch-current-launch.png)，截图时间 12:18:42，晚于本次 APK 导出。画面显示当前源码的原生主菜单和 Godot 4.7.1 标识。
- 历史 ADB `input tap 1280 795` 诊断截图：[mb27-after-adb-tap.png](../../godot/builds/mb27-after-adb-tap.png)。该文件时间早于此前 09:21:11 APK，画面仍是旧版上下布局；它只保留作坐标注入历史，不支持此前 10:00:31 APK 的开局页结论，也不是人工触控证据。
- 运行过程未观察到安装失败、Java/FATAL 崩溃或进程立即退出；首次安装尝试遇到短暂 `device offline`，重试后成功。

### 2026-08-04 09:44 复核

- 使用仓库外已存在的 MuMu ADB：`D:\04_Apps\MuMuPlayer\nx_main\adb.exe`；`127.0.0.1:16384` 仍为 `device`，前台为 `com.sumo91.sanguobaye.godotspike/com.godot.game.GodotAppLauncher`，物理尺寸 `1440x2560`、density `360`、ABI `x86_64`。
- `mumu-cli control --vmindex 0 show_window` 返回 RPC `errcode=0`，但对应 `MuMuNxDevice` 进程的 `MainWindowHandle=0`、窗口标题为空；因此当前工具会话没有可审计的可见 MuMu GUI。`main launch` 的无参数调用返回 `action key missing`，不改变已经在线且前台的 Android Activity 事实。
- 09:48 按桌面快捷方式参数启动 `MuMuNxMain.exe --from-shortcut` 后复查，`MuMuNxMain` 及相关后端进程仍全部为 `MainWindowHandle=0`；未把这次后台启动尝试记录为可见窗口或人工触控证据。
- 09:51 对同一实例调用 MuMu `show_window`、`top_most`、`fullscreen`，三项 RPC 均返回 `errcode=0`，但进程窗口句柄仍为 0；这些 RPC 成功只表示命令被后端接受，不构成可见 GUI 或人工触控证据。
- 09:53 在当前 Windows 会话用 `EnumWindows` 按 MuMu 进程 ID 枚举可见顶层窗口，结果为 `no-visible-top-level-mumu-windows`；这进一步确认本工具会话没有可交互 MuMu 画面。
- 10:30:44 重新执行 `mumu-cli control --vmindex 0 --version 15 launch` 返回 `errcode=0`；等待 2 秒后 `MuMuNxMain`/`MuMuNxDevice` 的 `MainWindowHandle` 仍为 `0`，所以这次后台启动成功也不构成可见 GUI 或人工触控证据。
- 复跑 `npm run godot:project:verify` 退出码 0（211 domain、223 presentation、import 和主场景通过）；复跑 `npm run godot:program-check` 退出码 0（4 项 mutation self-test）。上述结果只证明当前源码和运行时准备度，不替代人工触控。

## 自动回归

- tactical presentation：131 assertions；覆盖 terminal checkpoint 替换旧 ongoing、同战斗旧 ongoing 拒绝、完整 terminal projection/settlement digest、warm/cold exact-once、真实 `_return_to_strategy()` 场景切换/清理、战术设置高密度滚动和 1280×720/844×390 输入。
- production save/recovery：139 assertions。
- campaign setup presentation：88 assertions；包含 360dpi/844×390 高密度主菜单、时期卡片、君主卡片、返回控件和嵌套滚动触控目标检查；覆盖 Android Back/返回剧本后重新选择君主、离开高密度布局后的行高/标签宽度/字号状态恢复、2560×1440 战略 Back 对话框检查，以及 38 城、54 道路和生产 GameSession 入口。
- Web：47 个测试文件、378 tests，构建通过。
- 聚合 `npm run check`：退出码 0，通过；本轮耗时 549.8 秒，包含纪事布局切换、高密度布局、响应式字体和安全区几何断言。日志中的 migration replay 失败项属于预期的负向篡改演练，未改变聚合命令成功结果；根证书、弹窗位置和 Android build-tools 提示为环境警告。
- 增量项目验证：最新 `npm run godot:project:verify` 退出码 0（211 domain、225 presentation assertions；新增小屏到 1280×720 大横屏的纪事布局恢复断言）。d59df85 新增 DPI/测试 override 的 4× 上限断言，363187d/994c394 新增四边不同 inset 与 screen-to-viewport 缩放安全区断言。当前源码的 Android preset 已使用项目自有 `res://icon.svg` 主图标及独立 adaptive foreground/background/monochrome SVG；触控度量覆盖 160/360 dpi、48dp/拖动阈值换算、显式密度上限和 PopupMenu 行高。
- 增量导出：沙箱上下文曾把已存在的模板误报为 missing；改用授权环境读取现有模板后导出成功。没有下载或安装组件。
- 本轮战役设置交互修复后使用 Godot 4.7.1 重新导出上述 APK；MuMu `127.0.0.1:16384` 于 12:17:36 以 streamed install 成功安装，冷启动进程可见，12:18–12:19 的三张战役设置诊断截图已从该 APK 更新。完整 `npm run check` 在 549.8 秒后退出码 0，Godot/Web/构建门禁均通过；迁移回放中的错误仍是预期负向篡改演练。图标资源结论依据 [Godot 稳定版 Android 导出文档](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_android.html) 与当前 APK ZIP 条目审计。

## 本轮移动端修复

- Android 高 DPI 通过统一 `TouchMetrics` 应用于主菜单、战役设置、战略城池面板、战略命令面板、战术设置、Android Back 确认框和所有 OptionButton PopupMenu 行。
- 844×390 高密度场景不再把三个主菜单动作纵向堆叠；战役设置使用两步时期/君主卡片和内嵌滚动列表，并在极窄高度隐藏冗余说明，保持 48dp 交互目标。
- 主菜单与战役设置的卡片位于可滚动容器内，战术设置面板也支持高密度纵向滚动；三个 CheckButton、文字大小选择和完成按钮均纳入 48dp 目标。
- 新增完整场景的 2.25 density 注入测试；不把桌面 density=1 的 headless 结果冒充 Android 物理触控。
- 修复战役设置从 ultra-compact 返回桌面尺寸时的响应式状态残留：恢复时期/君主标签宽度并清除临时字号覆盖；新增回归断言。
- 将安全区计算拆为可注入纯几何函数，覆盖四边不同的左/上/右/下 inset 及 screen-to-viewport 缩放；运行时仍仅在移动平台读取 `DisplayServer` 安全区。
- 移除纪事面板把旧 compact 测量强行套到新窗口尺寸的回退启发式；纪事现在始终服从调用方的当前物理尺寸，并覆盖 844×390 → 1280×720 的布局恢复回归。

## 本轮战役设置交互修复

- 用户反馈的原问题是 Godot `OptionButton` 打开的全屏 `PopupMenu`：菜单遮挡整个卡片、行间空白看似可点但触控反馈不清晰，且不符合手机游戏的开局信息架构。
- 对照 `references/screen-catalog.md` 的原版 S020/S030：时期按固定顺序四项 2×2 选择；选定时期后进入君主队列，顺序来自时期数据，并显示君主所属城池信息。Web `src/ui/CampaignSetup.tsx` 同样采用“时期卡片 → 君主卡片”两步流程。
- Godot 现在使用原生 `Button` 卡片和 `GridContainer`/`ScrollContainer`：第一步四个剧本卡片，第二步按稳定候选顺序显示君主卡片，单击即显示明确金色选中态和预览，`返回剧本` 可回到上一步；不再向用户暴露 `OptionButton` PopupMenu。隐藏的旧 OptionButton 仅作为非权威兼容镜像，产品状态由时期/君主卡片直接驱动。
- 当前源码 APK 已更新：`godot/builds/sanguo-baye-godot-mb27-touch-debug.apk`，57,825,764 bytes，SHA-256 `6498C8B827D34385EB8E9B6B71F4C69E8283A447D173367306F4454BAF80EBE8`，导出时间 2026-08-04 12:17:18，MuMu 安装时间 12:17:36。MuMu 自动诊断截图：[时期卡片](../../godot/builds/mb27-campaign-setup-periods.png)、[君主列表](../../godot/builds/mb27-campaign-setup-rulers.png)、[选中君主](../../godot/builds/mb27-campaign-setup-ruler-selected.png)；这些截图由 ADB/键盘诊断生成，不是人工触控证据。
- `npm run godot:campaign-setup:presentation` 通过 88 项断言，覆盖四个卡片、时期切换、君主列表、高密度君主卡片/滚动/返回控件、Android Back、返回后清除君主选择、单击选中、预览信息和开局 intent；`npm run godot:project:verify` 通过 211 domain/225 presentation assertions。完整 `npm run check` 已在本轮修复源码后于 549.8 秒退出码 0。

## 尚未关闭的 P1 与人工交接

当前工具边界没有可审计的 MuMu 可见窗口鼠标/手指操作，因此仍需用户在可见 MuMu 窗口或横屏真机上完成并保留截图：

1. 主菜单开始新战役 → 时期/君主 → 进入战略地图。
2. 38 城地图拖动、缩放、点城、空间化命令入口。
3. 进入战术，执行移动/攻击/回合/Android Back 确认。
4. 后台暂停或强停后冷启动恢复，终局返回战略并确认只结算一次。
5. 在 1280×720 与 844×390 两种横屏配置记录安全区、按钮可点性、拖缩和返回结果。

在这些动作完成前，不能宣称 Android-first 接受完成，也不能完成 MB00 Goal。当前 ADB/键盘/坐标注入结果只用于定位输入坐标和程序稳定性。

补充失败尝试：曾在无窗口的 Godot presentation runner 中调用原生 `PopupMenu.popup()` 后读取 `get_item_rect()`，runner 超过 120 秒未退出；该试探已撤回，未把它写成通过证据。PopupMenu 实际 item rect 仍须在可见 MuMu/真机上测量。

## 决策

继续 Goal，下一步等待用户可见设备触控证据；不推送、不创建 PR、不发布 APK/AAB。真实 `_return_to_strategy()` 场景切换与 pause/marker 清理已由 131 tactical assertions 覆盖，不再列为 P2。响应式状态恢复 P2 已在 3315de7 修复，四边非对称安全区注入与缩放覆盖已在 363187d/994c394 闭环，纪事布局回退启发式已在本轮移除并由 225 项表现断言覆盖；图标资源提示已由当前 APK 条目和 Godot 稳定文档解释关闭；仍保留两项 P2：360dpi 字体实机可读性校准，以及 PopupMenu 实际 item rect 的设备测量。代码侧高密度 P1 已修复；Android-first 的剩余 P1 只是真实 MuMu/真机人工动作证据。
