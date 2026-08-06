# Mission Brief: MB-GD5 scenario 输入注入扩展（scroll / drag）

## Outcome

Godot Flight Deck scenario 支持滚轮（scroll）与拖拽（drag）输入注入，项目首个代表性交互场景（战略地图拖动 + 滚轮缩放）以 `qa/scenarios/` 数据文件存在并可独立运行，断言地图相机位移与缩放变化；Agent 能用它做"交互路径可复现回归"的最小闭环。

## Context

- 程序总纲：`docs/mission-briefs/MB00-gdeck-agent-loop-program.md`；MB-GD1..MB-GD4 已完成（check --file / verify --json、probe query / watch、scene doctor、scene set），报告在 `docs/gdeck-program/mission-reports/`。
- CLI 位置：`D:\03_Godot\04_Tools\GodotFlightDeck-Cursor`（1.6.3-cursor.2，in-process 兼容模式）。
- 现状事实（已核实）：
  - `scenario_runner.gd`（`godot/addons/flight_deck/`）现有 step 类型：`wait_frames`、`press`/`hold`（InputEventAction）、`move_mouse`（warp + InputEventMouseMotion 单帧）、`wait_event`（语义事件断言，含 since/includeHistory/timeout）、`command`。**缺 scroll（滚轮事件）与 drag（按下→移动→释放的多帧序列）**。
  - `qa/scenarios/` 目录**不存在**；项目尚无任何 scenario 定义。
  - 演示目标已确认：`src/presentation/strategy_screen.gd` 实现完整地图交互——`_mouse_dragging` + `InputEventMouseMotion`（拖动平移）、`InputEventMouseButton`（`MOUSE_BUTTON_WHEEL_UP/DOWN` 缩放、LEFT 选择）；相机为 `%MapCamera`（Camera2D）。**注入输入经 `Input.parse_input_event` 走 Godot 输入管道，headless 下事件系统可用**（move_mouse 已有先例）。
  - 项目还有 5 个 `ScrollContainer` 面板（campaign_browser/chronicle/campaign_setup/city_card/month_end_review），scroll 注入对列表滚动同样适用（备选断言目标）。
  - 验证门禁 `npm run godot:gdeck:verify:fast` 与 `doctor` 当前全绿。

## Required Behaviors

- **scroll step**：`{"scroll": [x, y], "factor": 1.0, "frames": 1}`（形态由执行者定）→ 生成 `InputEventMouseButton`（WHEEL_UP/WHEEL_DOWN，按 factor 正负决定）注入；多帧时逐帧重复。
- **drag step**：`{"drag": [[x1, y1], [x2, y2]], "frames": N}` → 首帧按下（LEFT）+ 逐帧插值移动（InputEventMouseMotion）+ 末帧释放；N≥2 保证真实拖动序列；插值逐帧确定性。
- **代表性场景**：`qa/scenarios/strategy-map-pan-zoom.json`（或等价命名）：进入战略地图 → drag 平移 → 断言相机位置变化 → scroll 缩放 → 断言相机 zoom 变化；断言用 `wait_event`（语义事件，需在演示场景中可观测）或可验证的等价方式（如 `move_mouse`+`command` 驱动的状态查询，由执行者从证据决定）。
- **可独立运行**：`gdeck scenario <name> godot` 通过；通过/失败退出码明确；失败时输出步骤索引与原因。
- **确定性**：同一场景同一 seed 多次运行结果一致；事件序列帧计数驱动，不依赖渲染帧率。
- **回归**：`gdeck doctor` 全绿 + `npm run godot:gdeck:verify:fast` 通过；addon 与 CLI 版本一致。

## Constraints

- 只改 Flight Deck addon（scenario_runner）与新增 `qa/scenarios/` 数据文件；**不修改游戏玩法代码**（`src/presentation/strategy_screen.gd` 等只读参考，除非需要临时 fixture 场景，用后删除）。
- 注入限于鼠标事件（wheel/motion/button）；**不做**触摸事件（InputEventScreenTouch/Drag）——Android 真机触控属设备矩阵范畴，headless 注入触摸无意义。
- 场景数据文件可提交（`qa/scenarios/*.json` 是项目数据，非游戏代码）。
- 修改 CLI/addon 前保留可还原备份；不引入新组件；不 force push、不改 git config、不发布；`allowWrites`/`supplementaryEnabled` 保持 false。
- scenario 运行不得修改游戏状态文件（存档路径等）或产生副作用文件（除非 fixture 明确声明并清理）。

## Non-goals

- 不进 verify 流水线（属 MB-GD6 core-loop profile）。
- 不做多点触控、触摸手势、加速度计等移动端输入。
- 不做录制回放工具（scenario 是手写数据，不是录屏）。
- 不新增视觉断言（capture/visual-test 是既有独立能力）。

## Evidence of Completion

- 演示证据：`gdeck scenario strategy-map-pan-zoom godot` 运行通过；drag 后相机位置变化与 scroll 后 zoom 变化被断言（记录断言值）；同一场景重跑结果一致。
- 失败路径演示：临时改坏断言（用后恢复）→ scenario 失败且输出步骤索引/原因；drag 参数非法（点对不足、frames<2）→ 明确报错。
- 边界演示：scroll 在无缩放响应场景（或非法坐标）不崩溃。
- 回归证据：`gdeck doctor` 关键项全绿；`npm run godot:gdeck:verify:fast` 通过；`scene doctor` 基线不变。
- 可还原证据：CLI/addon 备份存在；`qa/scenarios/` 文件与 runner 变更 git 可回退。
- 完成报告写入 `docs/gdeck-program/mission-reports/MB-GD5-scenario-input-injection.md`，记录未修改玩法代码、未改 allowWrites。

## Delegated Decisions and Unknowns

- scroll/drag step 的 JSON 形态、drag 插值策略（线性逐帧）、`wait_event` 断言的语义事件来源（若 strategy_screen 无现成语义事件，可在临时 fixture 或 `command` 通道中提供，用后清理）。
- 代表性场景是否只覆盖 strategy_screen，还是加一个 ScrollContainer 列表滚动场景（时间允许则加，证据中记录）。
- headless 下 `Input.warp_mouse` 与注入 motion 的坐标语义（viewport 坐标 vs 全局坐标）由执行者从实测证据决定。
- 完成本 Mission 后，使用 `$mission-brief` 生成 MB-GD6 brief；不预生成后续 backlog。

## Autonomy and Approval Boundaries

- 授权：本地修改 CLI/addon（先备份）、运行 gdeck/Godot 命令与测试、创建 `qa/scenarios/` 数据文件、在迁移分支创建本地提交、创建/更新本程序 brief 与报告。
- 需批准：下载或安装新组件、推送/PR/发布、修改总纲固定条款、将 `allowWrites`/`supplementaryEnabled` 改为 true、删除备份、破坏性 Git/文件操作、对仓库内真实 .tscn 执行 scene set --apply。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
