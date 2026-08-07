# MB-GD5 完成报告：scenario 输入注入扩展（scroll / drag）

日期：2026-08-05
状态：完成，证据齐全

## 交付内容

### scenario_runner 新增 step 类型（addon）

- **`scroll`**：`{"scroll": [x, y], "factor": 1.0, "frames": N}` → `InputEventMouseButton` WHEEL_UP/DOWN（factor 正负决定），press/release 用**两个独立事件对象**（Godot 拒绝同帧重复解析同一事件）；frames>1 逐帧重复。
- **`drag`**：`{"drag": [[x1,y1],[x2,y2],...], "frames": N}` → 首帧 LEFT press（warp_mouse 定位）→ 中间帧线性插值 `InputEventMouseMotion` → 末帧 release；frames≥2，插值确定性。
- 辅助函数：`_move_mouse_to` / `_press_mouse_at` / `_release_mouse` / `_scroll_at`。

### 首个代表性场景：战略地图拖动 + 滚轮缩放

- `qa/scenarios/strategy-map-pan-zoom.json`：wait → `set_baseline` → drag 平移 → assert panned → scroll 缩放 → assert zoomed → wait。
- `qa/scenarios/strategy_map_fixture.gd`（fixture adapter，仅经隔离 profile 运行）：
  - `gdeck_setup` 中下一帧切换至 `strategy_screen.tscn`（利用其 legacy 直载路径：无 session 时自动 start_campaign）。
  - 响应 `set_baseline`（记录相机初始 position/zoom）、`assert_camera`（对比并发 `camera_observed` 语义事件：panned/zoomed/unexpected/no_baseline/missing）、`debug_map`（诊断）。
- `.gdeck/config.json` 新增 `strategy-map` profile（fixtureAdapter 声明，frames 120, seed 42）。

## 证据

### 注入有效性（debug_map 诊断，三次采样）

| 阶段 | camera position | zoom |
|---|---|---|
| drag 前 | [556.0, 328.0] | [1.0, 1.0] |
| drag 后 | [618.0, 280.0]（位移 ✓） | [1.0, 1.0] |
| scroll 后 | [596.9, 287.7] | **[1.134, 1.134]（缩放 ✓）** |

viewport 1280×720、MapInputSpace 矩形 [22,80,1236,536]（事件坐标在其内）。

### 场景通过
- `gdeck scenario strategy-map-pan-zoom godot`：**Scenario passed，Steps 11/11，Assertions 2/2**；同 seed 重跑一致（确定性）。
- 失败路径：坏断言（kind 改为不存在）→ exit 1，Assertions 1/2，Failure 明确；非法 drag（单点）→ "Step 3 drag must be [[x1, y1], [x2, y2], ...]"，Steps 3/11 即停。
- 演示截图产出：`godot/.gdeck/captures/scenario-...png`（scenario 自动截屏）。

### 回归
- `npm run godot:gdeck:verify:fast`：**PASSED**；`gdeck doctor`：20 项 ✓。
- 未修改任何游戏玩法代码；`allowWrites`/`supplementaryEnabled` 保持 false；诊断用临时 scenario 已删除。

## 备份

- `D:\03_Godot\04_Tools\GodotFlightDeck-Cursor\cli\backup-mbgd5\scenario_runner.gd.bak`。
- 变更文件：addon `scenario_runner.gd`（CLI 源 + 项目 sync）、新增 `qa/scenarios/strategy-map-pan-zoom.json`、`qa/scenarios/strategy_map_fixture.gd`、`.gdeck/config.json`（新增 profile）。

## 发现与备注（委托决策记录）

1. **注入事件在 headless 下完全有效**：`Input.parse_input_event` 走 Godot 输入管线；strategy_screen 的 `_unhandled_input` 消费鼠标事件（拖动用 `event.position` 差值、缩放检查 `event.pressed`），无需 warp_mouse 依赖。
2. **同帧重复解析同一事件对象被 Godot 拒绝**（"unsafe" 警告 + 事件失效）：press/release 必须用独立实例——首版单事件复用导致 scroll 静默失败，是 debug 诊断才定位的。
3. **断言语义修正**：首版把第一个 assert 隐式当作 baseline，导致 panned 断言永远失败；改为显式 `set_baseline` 命令 step。
4. **adapter 场景切换时机**：`gdeck_setup` 中直接 `change_scene_to_file` 在 _ready 阶段冲突（remove_child 错误），改为 `process_frame` 连接后下一帧切换。
5. **sync-addon 时机陷阱**：每次改 CLI 源 addon 后必须重新 sync（本 Mission 因漏 sync 复现了旧 bug 运行）。
6. `--check-only` 单文件加载 addon 脚本会报 "hides a global script class" 伪错误，以全项目 `gdeck check` 为准。

## 后续

- 下一 Mission（MB-GD6：scenario 进 verify 流水线 core-loop profile）按程序约定使用 `$mission-brief` 生成。
