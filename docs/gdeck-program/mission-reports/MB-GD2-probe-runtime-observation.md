# MB-GD2 完成报告：probe 运行时只读观察

日期：2026-08-05
状态：完成，证据齐全

## 交付内容

### 1. 运行时只读查询（query）

- **CLI**：`gdeck run [project] --query '<json>' | --query-file <path> [--frames N] [--seed N] [--json]`
  - `--query`：内联 JSON 数组；`--query-file`：JSON 文件；两者互斥。
  - CLI 侧 schema 校验：必须是数组、每项 type 限 `property/tree/signals/group`、自动补 `id`。
  - 结果写入 `godot/.gdeck/reports/query-<ts>.json`（复用 capture 的确定性模型：seed + frames 绑定）。
- **probe**（`runtime_probe.gd`）：新增 `--gdeck-query=` 启动参数解析、`_parse_query_definitions`、`_collect_queries`（`_finish_run` 中收集，与截屏同帧树完整），report 新增 `queries` 字段（schemaVersion/seed/frames/count/results）。
- **四种白名单查询**（全部只读 get/遍历，无 set/call/eval）：
  - `property`：节点路径 + 属性名 → 值（经 `_bounded_diagnostic_value` 边界化）
  - `tree`：节点路径 + `max_depth` → 名称/类型/深度/子节点数（上限 200 节点，`truncated` 标记）
  - `signals`：节点路径 → 信号名列表 + 连接（callable 目标/方法/目标节点）
  - `group`：组名 → 成员节点路径列表
- 路径解析支持绝对 `/root/...` 与场景相对路径；失败查询（节点/属性不存在）返回 `ok:false` 与错误消息，外层 `ok` 联动。

### 2. 流式观察（watch）

- **CLI**：`gdeck run [project] --watch [--main-scene res://...] [--timeout SECONDS]`
  - `spawn` 非阻塞 + stdout/stderr 逐行实时转发，`[gdeck:out]`/`[gdeck:err]` 前缀；`ERROR:`/`SCRIPT ERROR:`/`FATAL:` 行显式标注（红），`GDECK_*` 行弱化显示。
  - `--main-scene`：观察指定场景（校验 `res://` 前缀）。
  - **超时语义**：超时 kill 是观察窗口的正常结束（exit 0）；游戏提前非零退出或 spawn 失败才算失败（exit 1）。
  - `--watch` 与 `--query` 互斥。

## 证据

### query 演示（main_menu 场景，seed 42 / 30 帧）

| 查询 | 结果 |
|---|---|
| `property /root/MainMenu/Background visible` | `value: true` —— 与 `gdeck editor inspect Background`（编辑器只读通道 `visible: true [bool]`）**对照一致** |
| `tree /root/MainMenu max_depth 2` | MainMenu → Background/Scrim/Wordmark/Center(→Card)… `truncated: false` |
| `signals /root/MainMenu` | 16 个信号（含 ready/visibility_changed…）+ 1 条连接（child_order_changed → Viewport::canvas_parent_mark_dirty） |
| `property /root/Nope visible` | `ok:false, "node not found"`（外层 ok 联动 false） |
| `group nonexistent-group` | `ok:true, members: []` |

边界：非法 type（`eval`）CLI 拒绝；深树 `max_depth 8` 不崩溃；确定性：相同 seed/frames 两次运行结果一致；互斥：`--query`+`--query-file`、`--watch`+`--query` 均拒绝。

### watch 演示

- 正常观察：`[gdeck:out] OpenGL API...` 流式转发；6 秒超时 kill，exit 0（观察窗口正常结束）。
- 错误标注（`--main-scene` 指向引用不存在资源的临时场景，用后删除）：
  `[gdeck:err] ERROR: Resource file not found: res://nonexistent_asset.png (expected type: Texture2D)`。
- 游戏提前失败退出 → exit 1。

## 回归

- `npm run godot:gdeck:verify:fast`：**PASSED**（check + unit）。
- `gdeck doctor godot`：关键项全绿（Runtime probe、Addon version match `1.6.3-cursor.2`、Cursor compat、Editor bridge `connected 1.6.3-cursor.2`、Bridge read available）。
- 未修改游戏玩法代码；`allowWrites`/`supplementaryEnabled` 保持 false。

## 备份

- `D:\03_Godot\04_Tools\GodotFlightDeck-Cursor\cli\backup-mbgd2\`：`gdeck.mjs.bak`、`commands.mjs.bak`、`runtime_probe.gd.bak`。
- 变更文件：`cli/gdeck.mjs`、`registry/commands.mjs`、`godot/addons/flight_deck/runtime_probe.gd`（CLI 源 + 项目 addon 经 sync-addon 同步）。

## 发现与备注（委托决策记录）

1. **`signal` 是 GDScript 保留字**，不能作循环变量（解析错误 "Expected loop variable name after 'for'"）。
2. **`Object.has_property()` 不存在于 Godot 4**；属性存在性检查用 `get_property_list()` 遍历。
3. **`node.get("has_property")` 是错误 API 用法**（get() 只读属性），已替换。
4. **sync-addon 偶发 EPERM**（`config.json` 临时文件 rename 被锁，疑似编辑器/索引器短暂持有句柄）；重试 1–3 次成功，不影响产物。
5. **watch 超时语义决策**：超时 kill 视为观察窗口正常结束（exit 0），避免 Agent 用 watch 观察 N 秒后误判失败；只有游戏提前失败退出才 exit 1。
6. **probe 的 push_error 路径不可经用户 passthrough 触达**（`--gdeck-` 保留命名空间），错误标注端到端演示改用 `--main-scene` 指向坏场景完成。
7. 查询结果与 `gdeck editor inspect/tree`（Editor Bridge 只读）可互为交叉验证通道。

## 后续

- 下一 Mission（MB-GD3：场景完整性体检）按程序约定使用 `$mission-brief` 生成。
