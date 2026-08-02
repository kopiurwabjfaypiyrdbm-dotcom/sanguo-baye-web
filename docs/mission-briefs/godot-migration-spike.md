# Mission Brief: Godot 迁移技术样片可在 Android 横屏独立运行

## Outcome

在保留现有 Web 产品及其路径不变的前提下，仓库新增一个由 Godot 4.7.1 原生运行的独立技术样片。玩家可在 Android 横屏或 Windows 上进入时期 1 的完整 38 城战略地图，以触摸或鼠标浏览并选择城市，执行一条与 TypeScript oracle 同 seed、同结果的真实城池命令，并在保存、重启载入后得到一致状态。样片不依赖 WebView、浏览器或 TypeScript 运行时，足以用设备证据判断是否值得全面迁移。

## Context

- 目标仓库为 `D:\00_Ai\Codex\sanguo-baye-web`；当前 Web 版已经形成战略与战术闭环，是持续可运行产品、规则 oracle 和迁移验收基线。
- 当前架构、能力与风险以 `README.md`、`docs/HANDOFF.md`、`references/parity-matrix.md` 及 `docs/design/` 中的移动端、存档和兼容文档为准。规则事实优先取自锁定的 `references/vendor/baye-c-core/`，产品实现入口位于 `src/core/`、`src/compat/baye/`、`src/data/` 和 `src/game/`。
- 迁移产物位于新增顶层 `godot/`，不搬迁或大规模改名现有 Web 文件。第一优先平台是 Android 手机横屏全屏，Windows 桌面为次要目标，Godot Web 不属于本阶段要求。
- 必须使用 `Godot_v4.7.1` 创建和验证项目，并配置真实主场景。语言选择应以早期 Android 实证为准：只有 Godot .NET/C# 工具链和 APK 能稳定工作时才扩大 C# 规则移植；否则记录决策并使用 GDScript 完成样片。

## Required Behaviors

- 项目离线载入仓库内可再分发的时期数据，进入时期 1，并完整呈现 38 城、正确连接关系、玩家所属城、其他势力城及当前选中城。
- 原生 Godot 地图支持稳定的单指/鼠标拖动、双指/滚轮缩放和城池点击；点击后在节点附近出现轻量城市信息与命令入口。平滑镜头、选中反馈、空间化菜单和触控反馈应体现 Godot 场景、Camera、Control、Tween、Shader 或粒子等原生表现价值。
- 至少一条真实城池命令通过场景外的领域模型以事务方式执行，显式接收并推进确定性 RNG seed，执行前后完整校验状态；任何影响结果的集合显式排序，不依赖 `Dictionary` 遍历顺序或 Godot 默认随机数。
- 该命令具有语言无关的 JSON 输入/输出 fixture；Godot 与 TypeScript 从相同输入和 seed 得到相同结果、资源变化及后继 seed。
- 最小 `GameState` 可保存和载入；命令后状态经保存、重建会话和载入后保持一致，并再次通过校验。
- Android Debug APK 可安装并在 MuMu 模拟器离线启动，不依赖网络、WebView、JSBridge 或浏览器运行时；1280×720 与 844×390 横屏下地图、手势、菜单和关键状态均可用。

## Constraints

- `GameState`、规则、RNG、校验和存档模型不得挂在 Godot 场景树中；`Node`、`Control` 和场景仅承担输入、表现与应用层调度。
- 保留当前 Web 版及其可运行基线，不直接提交到 `main`，不修改或提交 `codex/pwa-android-shell`，不推送或创建 PR，除非用户另行授权。本阶段工作只发生在 `codex/godot-migration-spike`，PR #4 合入后再按新基线重放。
- `references/vendor/baye-c-core/` 只作为只读证据，不进入 Godot 应用构建依赖；任何原版兼容结论必须记录到 `references/parity-matrix.md` 并附源码定位或可重复 fixture，缺乏证据的行为必须标为临时或 provisional。
- 不导入或提交 `dat.lib.orig`、`.lib`、原版/来源不明图片、字体、音频、视频、WASM、生成的内嵌资源数组、`.reference/` 文件或许可证不明素材。复用既有合法资产时继续保留来源记录。
- Android 样片必须在大规模规则移植前完成实际导出与设备运行验证；不得因语言偏好跳过平台风险验证。

## Non-goals

- 全量战略规则、完整战术战场、全存档 schema、正式美术/动画/音频、Godot Web 导出或 APK/AAB 发布。
- 删除、替换、嵌入或重新包装现有 Web 客户端。

## Evidence of Completion

- Godot 4.7.1 无错误导入并从已配置主场景启动；自动化或可重复检查证明时期 1 恰有 38 城且连接引用完整。
- 真实命令的 TypeScript oracle 与 Godot fixture 对照结果完全一致，覆盖输入、前后状态、资源变化和 RNG seed；最小存档往返比较一致。
- Windows/headless 运行记录与 1280×720、844×390 的可视/交互证据；Android Debug APK 的构建、签名、安装、启动和 MuMu 运行记录，并明确区分模拟器与物理真机结论。
- `npm run check` 继续通过；版本控制检查证明未纳入受限资产、本地参考文件或构建产物。
- `docs/migration/godot-spike-report.md` 记录技术选型、设备与尺寸结果、已知风险、证据限制及是否建议全面迁移。
- 完成自检后，由三个只读审查视角分别挑战 Godot 架构/场景树边界、确定性规则/fixture、Android 触控/移动体验；修复所有 P0、P1 和本阶段引入的 P2，并留下人工验收步骤。

## Delegated Decisions and Unknowns

- 在满足边界的前提下，自主确定样片内部文件划分、Godot 原生视觉实现、时期数据转换方式、被移植命令和测试工具；优先选择最小但能真实挑战迁移风险的方案。
- 发现本机已有 Godot .NET、Android SDK、JDK、导出模板或 MuMu 工具时直接验证；缺失组件先准确报告。C# 与 GDScript 的最终选择以 Godot 4.7.1 Android 导出稳定性、可测试性和迭代成本为原则，并在报告中保留证据。
- 物理 Android 真机若不可用，应完成 MuMu 验证并把真机状态明确列为剩余不确定性，不得把模拟器结果表述为真机通过。

## Autonomy and Approval Boundaries

- 已授权在迁移分支内执行只读调查、创建/修改本阶段文件、运行测试与构建、生成可忽略的本地产物、安装到已连接的 MuMu，以及创建阶段性本地提交。
- 下载或安装缺失的引擎、SDK、模板或系统组件需要按环境权限请求批准；推送、PR、发布、永久 application ID/签名决策、破坏性 Git 操作、删除现有产品内容或扩大到全量迁移都需要用户确认。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
