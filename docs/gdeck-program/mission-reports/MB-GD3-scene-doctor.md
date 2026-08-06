# MB-GD3 完成报告：场景完整性体检（scene doctor）

日期：2026-08-05
状态：完成，证据齐全

## 交付内容

### `gdeck scene doctor [project] [--json]`

新增 `scene` 命令（`doctor` action），**纯只读**两层体检：

**静态层**（纯 Node，实测 8ms）：
- `ext_resource`：`path=` 存在性（broken）、`type=` 与扩展名合理性（warning）
- `sub_resource`：id 唯一性（broken）
- `[gd_scene]` 头：`load_steps` 与 ext+sub+1 一致性（warning）
- `[node]`：`parent=` 引用存在性（warning，`parent="."` 合法跳过）

**加载层**（Godot headless，复用 MB-GD1 SceneTree runner 模式，新增 `godot/scene_scan_runner.gd`）：
- 递归扫描 `res://scenes` 下全部 `.tscn` 并 `load()`；`SCENE_FAIL`（null）→ broken
- Godot 错误输出解析：带场景路径的 `ERROR: res://xxx.tscn:N - ...` → broken（原文透传）；`Resource file not found` → warning
- 与静态层同文件同 severity **去重合并**（静态层优先）

**输出**：人读清单（severity 着色）+ `--json` 结构化（schemaVersion/toolVersion/scanned/broken/warnings/findings[severity/file/detail]/staticDurationMs）；退出码 0=全 OK，1=有 broken。

## 证据

### 基线（当前项目 17 场景）
- **0 broken，1 warning**：`res://scenes/presentation/main_menu.tscn — load_steps 6 != ext 5 + sub 1 + 1`
  - 这是**真实检出**：对照 Godot 保存格式（city_card ext1+sub1+1=3✓、strategy_screen 15+3+1=19✓），main_menu.tscn 是手工维护的标题屏，load_steps 漏算场景自身。Godot 加载宽容不报错，但属规范偏差。

### 坏场景检出（三个临时变体，用后删除）

| 变体 | 注入缺陷 | 检出 | 层 |
|---|---|---|---|
| A | ext_resource path 不存在 | broken `ext_resource 1_bad path missing` | 静态 |
| A | 同上（Godot 输出） | broken `Parse Error: [ext_resource] referenced non-existent resource at: res://nonexistent_asset.png` | 加载（去重合并） |
| B | sub_resource id 重复 | broken `duplicate sub_resource id StyleBox_dup` | 静态 |
| C | node parent 不存在 | warning `node Orphan references unknown parent` | 静态 |

- 退出码验证：broken 存在时 `EXIT=1`（真实退出码，非管道值）。
- 边界：非 Godot 项目路径 → 明确报错。

### 关键发现（加载层行为）
- **Godot 对引用缺失资源的场景 `load()` 返回非 null（宽容占位）**，SCENE_FAIL 不会触发；但会输出带场景路径的 `ERROR:` 行。加载层靠错误行解析而非返回值判定 —— 已实测验证。

## 回归

- `npm run godot:gdeck:verify:fast`：**PASSED**（check + unit）。
- `gdeck doctor godot`：20 项 ✓（Runtime probe、Addon version match `1.6.3-cursor.2`、Editor bridge connected、Bridge read available）。
- `gdeck describe scene`：usage/options 正确。
- 未修改游戏玩法代码；未改任何 `.tscn`；`allowWrites`/`supplementaryEnabled` 保持 false。

## 备份

- `D:\03_Godot\04_Tools\GodotFlightDeck-Cursor\cli\backup-mbgd3\`：`gdeck.mjs.bak`、`commands.mjs.bak`。
- 变更文件：`cli/gdeck.mjs`、`registry/commands.mjs`、新增 `godot/scene_scan_runner.gd`。

## 发现与备注（委托决策记录）

1. **Godot `load()` 宽容语义**：缺资源场景返回非 null 场景对象，判定必须靠 ERROR 输出；`load_steps` 语义为 ext+sub+1（含场景自身），main_menu 的 6 是真实偏差。
2. **`parent="."` 合法**：表示场景根节点，检查需跳过。
3. **node 引用检查用完整路径集合**（`parent + "/" + name`），不能用短名集合——首版实现短名/路径混查产生 277 个误报，已修正为 1 个真实 warning。
4. **误删 `timestamp()`**：实现 sceneDoctor 时替换编辑吞掉了 `timestamp` 函数，导致 verify 报 `timestamp is not defined`；已恢复，回归验证通过。
5. 静态层与加载层 file 表示统一为 `res://` 形式，同文件同 severity 去重避免重复计数。

## 后续

- 下一 Mission（MB-GD4：headless 场景结构化编辑 scene set）按程序约定使用 `$mission-brief` 生成。
