# MB-GD4 完成报告：headless 场景结构化编辑（scene set）

日期：2026-08-05
状态：完成，证据齐全

## 交付内容

### `gdeck scene set <scene> <node-path> <property> <json-value> [project] [--apply]`

- **headless 结构化编辑**：`godot/scene_edit_runner.gd`（新增），`load() → instantiate() → get_node() → JSON 类型化 set() → pack() → ResourceSaver.save()`，实例用后 `free()`。
- **JSON 类型化值**：CLI 侧校验 JSON 合法性；runner 用 `JSON.parse_string` 得到 bool/number/string 原生类型——`"false"` 字符串不会被 set() 强转为 true。
- **默认 dry-run**：只输出 `EDIT_PREVIEW`（旧值/新值），不写文件；`--apply` 才落盘。
- **快照**：apply 前复制到 `.gdeck/snapshots/<scenes 相对路径(__分隔)>-<ts>.tscn`，文件名编码场景相对路径（如 `presentation__touch_ripple-<ts>.tscn`）。
- **自动门禁**：apply 成功后自动跑 `scene doctor`，broken 时打印恢复指引。
- **属性存在性检查**：`get_property_list()`（无 `has_property` 的 Godot 4 现实）。

### `gdeck scene restore <snapshot> [project] [--apply]`

- 从快照恢复场景（支持快照短名与完整路径）；默认 dry-run，`--apply` 才写。
- 从快照名逆推场景路径（`__` → `/`，置于 `scenes/` 下）。

## 证据（全部在副本场景 `zz_tmp_edit_demo.tscn` 上，用后删除）

| 验证 | 结果 |
|---|---|
| dry-run 不写文件 | 前后 md5 一致（`27bd7b8728...`）✓ |
| bool 类型正确性 | `scene set ... visible false --apply` → 文件写入 `visible = false`（非字符串化）✓ |
| string 类型 | `name '"EditDemo"'` → 预览 `old=TouchRipple new=EditDemo`，apply 后 doctor 0 broken ✓ |
| 非法 JSON | `visible not-json` → CLI 拒绝 ✓ |
| 快照 | apply 时自动生成于 `.gdeck/snapshots/` ✓ |
| 恢复 | `scene restore <snapshot> --apply` 后 md5 与原始一致（`RESTORE IDENTICAL ✓`）✓ |
| 编辑后门禁 | apply 后自动 doctor：`0 broken, 1 warnings`（main_menu 已知基线偏差）✓ |
| 规范化重写 | 保存后文件为 Godot 规范格式（可见），报告已声明为预期行为 |

## 回归

- `npm run godot:gdeck:verify:fast`：**PASSED**（check + unit）。
- `gdeck doctor godot`：20 项 ✓。
- `scene doctor` 基线不变：0 broken / 1 warning（main_menu load_steps 已知）。
- 未修改任何真实 `.tscn`；未改 `allowWrites`/`supplementaryEnabled`；演示副本与快照已清理。

## 备份

- `D:\03_Godot\04_Tools\GodotFlightDeck-Cursor\cli\backup-mbgd4\`：`gdeck.mjs.bak`、`commands.mjs.bak`。
- 变更文件：`cli/gdeck.mjs`、`registry/commands.mjs`、新增 `godot/scene_edit_runner.gd`。

## 发现与备注（委托决策记录）

1. **`Object.set()` 返回 void**（非 Error）：设置后通过 `get()` 读回对比验证。
2. **`color.cyan` 不存在**：CLI 调色板只有 green/yellow/red/muted，已用 muted。
3. **快照名必须编码场景相对路径**（首版只存文件名，restore 无法定位 scenes/presentation/ 下场景）；且不得含 `scenes/` 前缀（restore 会拼 scenes/）。
4. **`scene set` positional 计数**：action 占一位，set 的 min=5/max=6（scene/node/property/json/±project）。
5. **apply 后 doctor 门禁传参**：必须传项目绝对路径（相对路径 '.' 会解析到 cwd 而非项目）。
6. dry-run 预览输出 `..visible`（node-path '.' 时路径显示为两个点）——显示瑕疵，不影响功能，留待后续打磨。

## 后续

- 下一 Mission（MB-GD5：scenario 输入注入扩展 drag/scroll）按程序约定使用 `$mission-brief` 生成。
