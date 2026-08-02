# Godot 迁移技术样片报告

- 日期：2026-08-02
- 分支：`codex/godot-migration-spike`
- Git 基线：PR #4 尚未进入 `upstream/main`（`41a885f`），因此按约定从本地 `codex/pwa-android-shell` 的 `6bca453` 创建迁移分支
- 引擎：Godot `4.7.1.stable.official.a13da4feb`
- 样片语言：GDScript

## 结论

技术样片达到“可以继续分阶段迁移”的门槛，但不建议据此立即展开全量重写。Godot 4.7.1 已证明能够在不嵌入 Web 运行时的前提下完成时期数据载入、38 城原生战略地图、确定性城池命令、样片最小契约的严格状态校验、存档重建以及 Android Debug APK 的 MuMu 运行闭环。

建议维持现有 Web 产品和测试基线不动，以可独立验收的纵向切片继续迁移。下一阶段扩大规则范围前，仍需完成两项发布门槛：确认结构化时期内容的再分发决策，并在至少一台实体 Android 手机上人工验证安全区、双指手感、休眠恢复和长时稳定性。

## 交付范围

| 目标 | 结果 | 可重复证据 |
|---|---|---|
| Godot 4.7.1 横屏工程与主场景 | 通过 | `godot/project.godot` 指向 `strategy_screen.tscn`；编辑器导入和主场景烟测退出码 0 |
| 时期 1 / 38 城 | 通过 | 数据契约含 38 城、108 个有向邻接引用、54 条互惠道路；Godot 测试逐路验证 |
| 原生地图与交互 | 通过 | `Node2D + Camera2D + Control`；鼠标拖动/滚轮、触摸点选/拖动、双触点缩放路径 |
| 势力与选择反馈 | 通过 | 玩家城池使用堡垒与旗帜轮廓，其他势力使用圆形色环，选中节点使用 Tween 脉冲 |
| 空间城池菜单 | 通过 | 卡片贴近节点，并限制在顶栏、底栏和安全区之间；844×390 无裁切 |
| 确定性真实命令 | 通过 | `开垦` 的输入、receipt、日志和后继 seed 与 TypeScript fixture 精确相等 |
| 最小保存/载入 | 通过 | 保存样片契约内的完整快照；新建 `GameSession` 后读取、校验并恢复完全相等状态 |
| Android Debug APK | 通过 | MuMu 安装、启动、横屏、触摸、命令和跨进程存读均实跑 |
| 1280×720 / 844×390 | 通过 | MuMu `DisplayFrames` 分别为 `1280×720` 与 `844×390`，两种截图均显示完整 38 城 |

本阶段没有迁移完整战略规则、战术战场、Web 存档 schema、正式美术、音频或 Godot Web 导出。

## 语言和引擎决策

本机有 .NET SDK `7.0.401` 和 `10.0.300`，但用户指定并提供的 Godot 4.7.1 是标准编辑器，不是 .NET/Mono 编辑器；目录中也没有匹配版本的 Godot .NET 可执行文件。仅有 .NET SDK 不能让标准 Godot 编辑器加载 C# 项目。

因此本样片选择 GDScript，先完成用户要求的实际 APK 风险验证，没有在设备证据出现前移植大批 C# 规则。领域层仍使用纯 `RefCounted` 对象、不可变快照、显式命令 receipt 和 JSON 契约，既不依赖场景树，也为未来有意切换 C# 保留清晰边界。

后续默认建议继续用 GDScript 扩大少量纵向切片。若团队仍希望采用 C#，应把“取得匹配的 Godot 4.7.1 .NET 编辑器 → 用同一 fixture 构建最小 C# 项目 → 实际导出并在实体 Android/MuMu 运行”作为单独决策门；在该门通过前不进行大规模 C# 规则移植。

## 架构结果

权威状态流如下：

```text
JSON period/fixture
        ↓
pure GameState snapshot ──→ Validator
        ↓
transactional command + explicit LCG seed
        ↓
validated next GameState + language-neutral receipt
        ↓
GameSession / JSON save repository
        ↓
Node2D / Camera2D / Control presentation
```

- `GameState`、LCG、校验器和 `DevelopFarmingCommand` 都不继承 `Node`。
- 命令对输入快照深复制，失败不推进 seed，成功后对样片最小契约内的完整输出再次校验。
- 城池、人物、道具和兵种都有显式顺序数组；所有回退键集合先排序。
- Godot 使用与 Web 相同的 32 位 LCG：`seed = seed * 1664525 + 1013904223 (mod 2^32)`，没有调用 Godot 默认 RNG。
- 场景树只管理输入、镜头、视觉和应用层调度，不持有第二份权威规则状态。
- 存档 envelope 使用独立的 `sanguo-baye-godot-spike` 格式与版本，并在写入前、读取后两次验证；它会明确拒绝 `sanguo-baye-web` envelope。本阶段不宣称兼容 Web schema 6。

## 跨语言确定性对照

`scripts/generate-godot-spike-data.ts` 从 `createBundledScenario(1, 1, 'baye-classic-v1')` 生成时期快照和 `develop-farming-v1.json`。TypeScript 测试会重新执行 oracle 并验证生成物；Godot 测试读取同一个 JSON fixture，比较完整 receipt。

| 字段 | 输入 | 期望输出 / Godot 输出 |
|---|---:|---:|
| 城池 / 武将 | `city-12` 濮阳 / `officer-1` 曹操 | 相同 |
| seed | `48641` | `373686124` |
| 农业 | `1238 / 4424` | `1301 / 4424`（+63） |
| 金钱 | `135` | `85`（-50） |
| 体力 | `100` | `92`（-8） |
| 已行动人物 | `[]` | `["officer-1"]` |
| `campaignStarted` | `false` | `true` |

Godot 的 140 条领域断言还覆盖道路互惠、`dataContractVersion: 1` 收窄样片契约的非法状态拒绝、存档格式隔离、JavaScript 无符号右移边界、装备智力加成、无效命令不变性，以及保存/载入完整快照相等。表现输入烟测另有 6 条断言，覆盖 38 城/54 路、双触点放大、放大后单指平移、正常触摸点选，以及取消触摸不会误选城池。

现有 Web 基线也保持绿色：`npm run check` 验证 51 个锁定 C 参考文件，Vitest 360 项通过、4 项因缺少可选本地参考而跳过，TypeScript 和 Vite/PWA 生产构建成功。

该对照只证明 Godot 客户端与当前 TypeScript 产品规则一致，不会把“开垦”升级为原版设备逐结果一致。

## Android 与设备结果

本机工具链：

- Android SDK：`C:\Users\HYMOD\AppData\Local\Android\Sdk`
- Platform / target：API 36；APK min SDK 24、target SDK 36
- Build Tools：36.0.0；Platform Tools / ADB：37.0.1
- JDK：Temurin 17.0.8.1
- Godot 4.7.1 Android export templates：官方模板，下载包 SHA-256 `86409db6200b6f8fd3230989c2d2002851f3dd18acf11d7bdbafddf5a0dd0f72`

APK 属性：

- 包名：`com.sumo91.sanguobaye.godotspike`
- 本地 Debug APK：57,172,135 字节，SHA-256 `150AA738F4F2FFF90F7E58892F3A84A45C573567D91BF2959FD7AA9B2E5452D9`
- 架构：`arm64-v8a`、`x86_64`
- 图形：OpenGL ES / GL Compatibility
- 方向：Android manifest `screenOrientation=11`（`sensorLandscape`）
- 沉浸式与 edge-to-edge：启用
- 签名：Godot debug key；APK Signature Scheme v2、v3 验证通过
- 权限：没有 `uses-permission` 节点，尤其没有 `INTERNET`
- 构建内容：不包含 TypeScript、HTML、JavaScript、WASM、WebView 桥或 `.lib`

MuMu 设备：`SM-G9900`，Android 15 / API 35，ABI `x86_64, arm64-v8a, x86`，OpenGL ES 3.2。最终 APK 冷启动耗时日志约 361 ms，Godot 报告 4.7.1 和 GL Compatibility 正常进入主循环，没有脚本错误或 Java 崩溃。

| 设备画面 | 结果 |
|---|---|
| 默认 2560×1440 横屏 | 完整 38 城、顶底 HUD、系统中文字体和沉浸式画面正常 |
| 1280×720 横屏 | 完整 38 城和全部顶栏命令可见；无安全区偏移 |
| 844×390 横屏 | 自动使用紧凑按钮；38 城、底栏和空间城池卡片均无裁切 |

Android 实跑操作：

- 真实 `input tap` 点选濮阳，出现触摸反馈、选择脉冲和节点旁卡片。
- 点击“开垦”后 UI 显示农业 1301、金钱 85、seed 373686124，与 fixture 相同。
- 保存后强制停止进程并重新启动，再点击读取；新建的 `GameSession` 恢复 seed 373686124，状态栏显示“已从存档重建 GameSession”。
- 应用私有存档为 133,057 字节，使用独立 `sanguo-baye-godot-spike` envelope；最终实跑文件的 SHA-256 为 `af1353a086402ff50a0c43d0dd731733d82ce5e7540ad14aebbc0c09419961a1`。
- 在放大状态使用真实 `input swipe` 后地图平移且保持边界夹取。

MuMu 的虚拟 `sendevent` 不会把原始多点事件交给 Android `InputReader`，因此自动化双指注入不可作为设备证据。双触点逻辑已经通过 Godot 引擎级输入事件烟测；实体设备上的双指速度、误触和手感仍属于人工验收项。

## Godot 相对 Web 的样片价值

- 镜头通过 `Camera2D` 和 Tween 平滑聚焦全图或玩家城池。
- 城池、道路、网格、旗帜和选择环均为原生程序化绘制，不是网页截图或面板换壳。
- 选择环、空间卡片与触摸涟漪直接绑定世界坐标，缩放和平移时保持关系。
- 城池所有权同时使用形状和颜色编码，降低仅依赖色相的辨识风险。
- HUD 使用 Control/Container 和平台安全区，844×390 自动收紧标签；Windows 不再把桌面工作区坐标误当刘海边距。
- 紧凑尺寸下顶栏与城池卡交互控件保持至少约 48 物理像素，城池命中半径保持至少 24 物理像素；取消的触摸序列不会触发点选。
- 没有引入许可证不明字体或原版媒体，应用图标也是项目自有 SVG。

## 自检与只读审查

完成实现后分别进行了 Godot 架构与场景树、确定性规则与 fixture、Android/触控体验三路只读审查。审查发现的问题已经回修并复核：视口尺寸变化会先终止镜头 Tween；场景脚本使用唯一节点引用而不反查父节点；校验器拒绝样片尚未迁移的俘虏/死亡、订单、情报、继承和结局状态；存档格式与 Web 隔离；无符号右移边界与 TypeScript 一致；844×390 的物理触控目标增大；取消触摸不再误触；报告断言数同步为 140/6。最终三路复核的 P0、P1、P2 均已清零。

## 已知风险

1. **结构化时期数据的发布许可仍需书面决定。** Web 已经使用 `src/data/generated/baye-periods.json`，但 `references/provenance/data.md` 仍把游戏内容的发布形式列为待审。本样片生成物明确标记为内部技术样片；此项不阻塞本地技术验证，但阻塞对外发布 APK/AAB。
2. **实体 Android 尚未验收。** MuMu 已覆盖安装、冷启动、两个目标尺寸、触摸点选/拖动、命令和跨进程存读；刘海、系统手势冲突、GPU/驱动差异、休眠恢复和双指手感需要真机。
3. **C# 结论尚未形成。** 本阶段只证明标准 Godot 4.7.1 + GDScript 的 Android 路径稳定。若改用 C#，必须重新经过匹配 .NET 编辑器的 APK 与设备门，不能从本报告外推。
4. **样片存档不是完整迁移 schema。** 它只验证 Godot 可以保存、校验和重建当前最小权威快照；正式版本仍需版本迁移、槽位、原子替换、损坏恢复和 Web 导入策略。
5. **规则覆盖刻意很窄。** 只有一条真实城市命令。全面迁移前应逐命令增加语言无关 fixture，避免一次性翻译后再追查语义漂移。

## 建议的下一阶段门槛

建议“有条件继续迁移”，顺序如下：

1. 在实体 Android 上执行本报告的人工步骤，保留 GPU、系统版本、尺寸和问题记录。
2. 对时期结构化内容作出可再分发决定；在此之前 APK 仅用于内部验证。
3. 决定 GDScript 作为正式客户端语言，或单独完成 Godot 4.7.1 .NET/C# Android 最小门；不要双轨大规模移植。
4. 继续保留 Web oracle，每个新增规则切片先生成语言无关 fixture，再写 Godot 命令与存档证据。
5. 下一纵向切片优先选择“另一条含不同资源/合法性分支的战略命令 + 月末最小推进”，而不是全量搬运战术层。

在这些门槛完成前，不删除、不移动、不降级现有 Web 产品，也不发布本样片 APK/AAB。
