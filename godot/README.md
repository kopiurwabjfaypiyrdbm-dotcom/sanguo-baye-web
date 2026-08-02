# Godot 4.7.1 迁移技术样片

本目录是独立的原生 Godot 客户端技术样片，不嵌入 TypeScript、WebView、JSBridge 或浏览器运行时。现有 Web 产品仍留在仓库原路径，继续作为可运行产品、规则 oracle 和迁移验收基线。

## 当前纵向切片

- 以时期 1、曹操势力载入完整 38 城、54 条互惠道路。
- 使用原生 `Node2D`、`Camera2D`、`Control`、`Tween` 和程序化绘制呈现战略地图。
- 支持鼠标拖动/滚轮、单指拖动/点击和双指缩放。
- 城池节点区分玩家、其他势力与无主状态，点选后在节点附近显示信息与命令入口。
- `开垦` 命令使用显式 32 位 LCG seed，并与 TypeScript oracle 的 JSON fixture 精确对照。
- 最小 JSON 存档保存样片契约内的完整权威快照；读取时重建 `GameSession` 并重新校验状态。
- Android Debug 预设使用沉浸式 `sensorLandscape`、GL Compatibility、arm64-v8a 与 x86_64，不申请网络权限。

## 架构边界

```text
src/domain/          RefCounted GameState、LCG、规则命令和样片契约校验
src/application/     GameSession 与 JSON 存档仓储
src/presentation/    场景、镜头、输入、HUD、空间城池卡片和视觉反馈
scenes/              可由编辑器检查的主场景、子场景与主题
data/                由 TypeScript oracle 生成的时期 1 快照和跨语言 fixture
tests/               领域/存档断言与表现输入烟测
```

`GameState` 和命令对象不是 `Node`，也不挂入场景树。场景只读取快照、提交应用命令并显示结果。所有影响结果的 ID 集合使用显式顺序数组或排序；不得依赖 `Dictionary` 遍历顺序。

## 生成数据与验证

从仓库根目录运行：

```powershell
npm run godot:spike-data
& 'D:\03_Godot\01_Engine\Godot_v4.7.1-stable_win64_console.exe' --headless --path godot --script res://tests/run_all.gd
& 'D:\03_Godot\01_Engine\Godot_v4.7.1-stable_win64_console.exe' --headless --path godot --script res://tests/presentation_input_smoke.gd
```

打开编辑器或直接运行主场景：

```powershell
& 'D:\03_Godot\01_Engine\Godot_v4.7.1-stable_win64.exe' --editor --path godot
& 'D:\03_Godot\01_Engine\Godot_v4.7.1-stable_win64.exe' --path godot
```

`project.godot` 已明确配置 `res://scenes/presentation/strategy_screen.tscn` 为主场景。

安装 Godot 4.7.1 Android export templates，并在编辑器设置中配置 Android SDK 与 JDK 17 后，可导出本地 Debug APK：

```powershell
& 'D:\03_Godot\01_Engine\Godot_v4.7.1-stable_win64_console.exe' --headless --path godot --export-debug 'Android Debug' builds/sanguo-baye-godot-spike-debug.apk
```

`godot/builds/` 被 Git 忽略；APK 是本地验收产物，不是发布包。

## 数据与素材边界

`data/period-1.json` 和 `data/fixtures/develop-farming-v1.json` 由 `scripts/generate-godot-spike-data.ts` 从现有 Web 状态工厂生成，均标注为内部技术样片且再分发审查待定。样片没有导入原版图片、字体、音频、视频、WASM 或 `.lib`；中文显示使用平台 `SystemFont`，图标与地图视觉均为项目自有矢量/程序化内容。

详细决策、设备结果与风险见 `docs/migration/godot-spike-report.md`。
