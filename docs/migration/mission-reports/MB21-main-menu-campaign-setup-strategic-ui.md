# MB21 完成报告：主菜单、战役设置与原生战略入口

## 结论

MB21 已完成。Godot 4.7.1 + GDScript 现在从原生主菜单进入时期/君主选择，再进入生产 `GameSession` 和 38 城战略地图；产品启动不再静默预选君主或依赖旧的 MB01 样片存档开关。时期 1–4 的生产目录和候选君主均由已校验的时期数据提供，选中的时期、势力、君主、seed 和状态摘要穿过入口边界保持不变。既有战略命令、确定性 AI 月循环、生产保存/读取和战术入口继续由 application/domain 层负责，场景树只承载输入、表现和调度。

截图中出现的是 Windows `Godot_v4.7.1-stable_win64.exe` 应用程序错误/原生访问冲突（读地址 `0x58`）。默认渲染器的根因仍未知，但已使用隔离的兼容渲染器对 Godot 4.7.1 正式可执行文件和编辑器分别运行 `--rendering-method gl_compatibility --quit-after 5`，两者均以退出码 0 完成；仅保留已知 root certificate warning（编辑器另有 Android build-tools warning）。本阶段没有安装或更换引擎。

## 交付内容

- `godot/scenes/presentation/main_menu.tscn` / `godot/src/presentation/main_menu.gd`：原生主菜单、开始新战役、检测生产存档的继续入口、返回/退出和轻量 Tween 入场表现。
- `godot/scenes/presentation/campaign_setup.tscn` / `godot/src/presentation/campaign_setup.gd`：从 `ProductionDataRepository.load_all()` 读取四个已校验时期，显示时期说明、年份、38 城/54 路事实、候选君主人数与城数；君主选项默认保持未选，只有显式选择后才能进入。
- `godot/src/application/campaign_launch_context.gd`：只保存一次性 application launch intent（时期/君主或读取存档），不保存 `GameState`，由战略画面消费后清空；无 intent 的策略场景现在 fail closed，不再默认时期 1。
- `godot/src/application/campaign_session_context.gd`：以 `GameSession` 类型保存战略↔战术场景切换期间的 application-owned session hand-off；战术返回后消费同一 session，不把状态放入场景树。
- `godot/src/presentation/strategy_screen.gd` / `godot/scenes/presentation/strategy_screen.tscn`：生产入口选择、战役标题/君主 HUD、生产保存/读取启用、返回主菜单按钮；保留既有 38 城、54 条互惠道路、平滑镜头、鼠标/触控拖动、滚轮/双指缩放、选中城池卡片、内政/人物/人才/后勤/侦察/外交命令、月循环、纪事和战术样片。
- `godot/data/fixtures/godot-campaign-entry-v1.json` / `scripts/generate-godot-campaign-entry-fixture.ts`：由 Web `createProductionSessionState` + `OracleApplicationSession` 生成的语言无关入口 fixture，固定时期 1 曹操选择、初始 digest/seed、38 城/54 路、真实开垦命令、receipt、状态摘要和资源结果。
- `godot/tests/campaign_entry_runner.gd` / `scripts/run-godot-campaign-entry-verification.mjs`：跨语言入口与真实命令逐字段/规范化摘要对照。
- `godot/tests/campaign_setup_presentation_runner.gd` / `scripts/run-godot-campaign-setup-presentation-verification.mjs`：冷启动无伪存档、四时期候选、无静默君主选择、时期 4 入口、生产保存→结束月→读取回原摘要。
- `references/parity-matrix.md`：增加原生战役入口与战略地图的可追溯 parity 行。
- `package.json`：将 MB21 fixture、入口和 campaign setup presentation runner 纳入 `npm run check`。

## 验证证据

| 检查 | 结果 |
|---|---|
| Godot 引擎 | `4.7.1.stable.official.a13da4feb` |
| `npm run godot:campaign-entry:verify` | 通过，12 项断言；完整时期 1 战役描述、曹操选中身份、seed、38 城/54 路、`develop_farming` result/receipt/state SHA 和资源变化与 TypeScript oracle 一致 |
| `npm run godot:campaign-setup:presentation` | 通过，62 项断言；主菜单冷启动无继续存档、四时期候选、君主显式选择、时期 4 生产入口、保存/结束月/读取回摘要、战术往返 session 保持、844×390 紧凑横屏控件和 1280×720 顶栏可达性 |
| `npm run godot:project:verify` | 通过；Godot domain 211、既有战略 input 212、导入、主场景启动 |
| `npm run check` | 通过最新回修工作树；应用事务 1690、战术/AI/settlement、生产存档恢复 126、campaign entry 12、campaign setup presentation 62、战术 presentation 50、Web Vitest 47 文件/378 测试（2 文件/4 测试按既有条件跳过）和 Web build 全部通过 |
| 横屏事实 | Godot 项目保持 1280×720 viewport / landscape；MB21 runner 在 844×390 紧凑尺寸断言主菜单/时期设置按钮与选项框达到 48px 物理触控高度、返回确认对话框按钮可触达，并在 1280×720 断言战略顶栏所有子控件（含主菜单）不越界；真实 Android/MuMu/安全区复验留 MB23 |
| 受限内容审计 | MB21 未新增原版图片、字体、音频、视频、WASM、`.lib`、`dat.lib.orig`、`.reference` 构建依赖；仅复用已存在的合法主题/程序化表现 |

## 架构与规则边界

`GameState`、规则命令、seed、存档 envelope 和验证仍在 `RefCounted` application/domain 层；`CampaignLaunchContext` 只是一项短生命周期启动意图，`CampaignSessionContext` 只负责场景切换期间的 application-owned session hand-off，二者都不是场景树权威状态容器。新场景没有把 `GameState` 或 `GameSession` 放入节点属性作为权威来源。策略节点通过 session snapshot 渲染，保存/读取通过新建 session 验证状态可以离开场景树并重建。

生产入口目前支持四个仓库时期和全部仓库候选君主。初始候选选择不消耗 RNG；fixture 明确固定 `periodId=1`、`rulerSourceIndex=1`、`city-12/officer-1` 的开垦命令。Godot 与 TypeScript 对整数 JSON 数值使用 `canonical-json-v1` 规范化比较，避免 JSON 浮点解析与 Godot 整数表示的伪差异。

直接实例化 `strategy_screen.tscn` 的既有表现测试会在加入节点前显式注入时期 1/君主启动意图，作为测试便利入口；实际项目主场景已切换到 `main_menu.tscn`，因此产品冷启动不会静默选择君主。继续战役路径要求生产存档存在，读取失败只报告错误，不替换当前 session。

## 已知风险与非目标

- 默认渲染器的 Windows GUI Godot 4.7.1 失败仍是环境风险：原始 `0x58` 应用程序错误尚未找到根因。Godot 4.7.1 正式可执行文件和编辑器已各自通过隔离兼容渲染器启动/退出 smoke；仍需在另一台 Windows 环境和实际设备上验证默认渲染器。
- `npm run check` 中 Godot 会输出 root certificate store warning；验证脚本已隔离 APPDATA/LOCALAPPDATA，warning 不影响退出码或 fixture 证据。
- 本阶段未做 Android Debug APK、MuMu/真机安装、系统暂停/杀进程恢复、安全区、存储空间耗尽和正式触控设备采样；这些属于 MB23 的移动端 hardening。
- 未做完整战术 HUD、设置/辅助功能、完整历史存档 schema、正式美术/音频生产、Godot Web、发布 APK/AAB。

## 人工复验步骤

1. 使用 Godot 4.7.1 打开 `godot/project.godot`，确认主场景为 `res://scenes/presentation/main_menu.tscn`；在兼容渲染下运行，选择“开始新战役”，确认时期/君主均需显式选择。
2. 选择时期 1 的曹操，确认进入战略地图后显示 38 城/54 路，点击城池出现空间化卡片，拖动/滚轮或双指缩放有效，内政入口可执行开垦。
3. 点击“保存”，结束本月，再点击“读取”；确认标题/君主、年月、地图选择和状态恢复到保存摘要。
4. 在主菜单有生产存档时点击“继续上次战役”，确认跨场景读取相同 campaign；将存档改成坏 JSON/未知字段后确认显示错误且不会静默创建另一位君主。
5. 依次执行 `npm run godot:campaign-entry:verify`、`npm run godot:campaign-setup:presentation`、`npm run godot:project:verify` 和 `npm run check`，保留 Godot/Web oracle 输出作为验收证据。

## 下一步

MB21 完成后按路线进入 MB22：战术 HUD、战役重返与导航闭环；Android/触控设备 hardening 进入 MB23。长期 Goal 保持 active，不推送、不创建 PR。
