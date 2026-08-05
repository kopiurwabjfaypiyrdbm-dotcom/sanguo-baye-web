# gdeck Pi Extension 启用与 Windows 适配记录

日期：2026-08-05
状态：已启用并验证通过

## 背景

Godot Flight Deck（Cursor fork 1.6.3-cursor.2）官方自带 Pi Agent 扩展实现（`extensions/godot-flight-deck.ts` + `extensions/runtime.mjs`），注册 4 个工具：`gdeck_project` / `gdeck_validate` / `gdeck_release` / `gdeck_editor`，另有 `/gdeck-status` 命令。上游明确表示 Pi 扩展从未在 Pi 上实际测试过（Cursor 只用 CLI），本仓库（Windows + 混合 Web/godot 布局 + Pi）是首次真实启用，共适配 4 处。

## 启用配置（用户环境，仓库外）

### 1. Pi settings 注册扩展

`C:/Users/HYMOD/.pi/agent/settings.json`（备份 `settings.json.bak-gdeck`）：

```json
"extensions": ["D:/03_Godot/04_Tools/GodotFlightDeck-Cursor/extensions/godot-flight-deck.ts"]
```

- 扩展的相对 import（`../registry/commands.mjs`、`./runtime.mjs`、`../cli/*`）基于工具目录解析，因此必须用工具目录内的绝对路径，**不要复制文件**。
- 升级 CLI 即用新版扩展，无需重新注册。

### 2. GODOT_BIN 用户级环境变量

```powershell
setx GODOT_BIN "D:\03_Godot\01_Engine\Godot_v4.7.1-stable_win64.exe"
```

原因：`.cmd` launcher 会设置 GODOT_BIN，但 Pi 扩展直接 `node cli/gdeck.mjs`（不经 launcher），且 `pi.exec` 的 ExecOptions 不支持注入 env。设置后需**重启 Pi**（新进程继承）。

## Windows 适配修复（工具目录内，升级可能覆盖）

### 3. monorepo 项目定位（`extensions/runtime.mjs` 的 `findGodotProject`）

- 问题：扩展只从 Pi cwd **向上**查找 `project.godot`；本仓库是 Web 仓库根 + `godot/` 子项目，Pi 在仓库根启动时找不到。
- 修复：向上查找失败后探测 `cwd/godot/project.godot`（monorepo 布局）。
- ⚠️ **升级 CLI 后需重新应用**（备份：`extensions/runtime.mjs.bak-gdeck`）。

### 4. process-runner Windows 私有 spec 校验（`cli/process-runner.mjs` 的 `readPrivateSpecification`）

- 问题：`--spec-file` 传输要求 spec 目录/文件 `mode & 0o077 == 0`（POSIX 私有权限）；Windows 无该语义，Node `chmod` 不限制 ACL → 校验永远失败（`process specification path is not a private temporary file`）。
- 修复：`process.platform === 'win32'` 时跳过 mode 位检查；**保留** symlink、tmpdir 祖先、命名前缀、uid 一致性校验。
- 效果：改完立即生效（process-runner 每次调用都是新进程），无需重启 Pi。
- ⚠️ **升级 CLI 后需重新应用**（备份：`cli/backup-mbgd5/process-runner.mjs.bak`）。

### 5. 内层判定 Windows 适配（`cli/gdeck.mjs` 的 `privateLifecycleRegistry`）

- 问题：CLI 靠 `GDECK_LIFECYCLE_FD=4` 的 fd mode 校验判定"内层调用者"（允许消费 `--gdeck-internal-*`）；Windows 上 fd mode 不满足私有位 → 永远判为外层 → 拒绝扩展传入的 internal 绑定（`Internal verification bindings cannot be supplied by a direct caller`）。
- 修复：win32 跳过 fd mode 校验（fd 身份即信任边界），其余检查保留。
- 效果：改完立即生效（CLI 每次由 process-runner 新起）。
- ⚠️ **升级 CLI 后需重新应用**（备份：`cli/backup-mbgd5/gdeck.mjs.bak`）。

### 6. plan-helper 投影补 invocationIdentity（`cli/verification-plan-helper.mjs` 的 `projectedPlan`）

- 问题：扩展用 plan-helper 预解析的 plan 构建 unit progress binding，但投影缺 `invocationIdentity` → `createUnitExecutionBinding` 报 "Unit invocation identity and owner nonce must be 64 lowercase hexadecimal characters"。
- 修复：`projectedPlan` 补 `invocationIdentity: plan.invocationIdentity`。
- 效果：改完立即生效（plan-helper 每次新起）。
- ⚠️ **升级 CLI 后需重新应用**（备份：`cli/backup-mbgd5/verification-plan-helper.mjs.bak`）。

## 验证记录（2026-08-05，全部经 Pi 扩展工具执行）

| 工具 | 结果 |
|---|---|
| `gdeck_project doctor` | ✅ 能力评估完整输出（godot_process available、runtime_probe available 等） |
| `gdeck_validate check` | ✅ "Flight Deck check passed" |
| `gdeck_validate verify --profile core-loop` | ✅ **PASSED**（check + unit + scenario 3 stages；首次运行 plan_drift 属既有机制，第二次通过） |
| `gdeck_editor status / tree` | ✅ 连接编辑器（`Writes: disabled`），场景树正常 |
| `gdeck_release templates-status` | ✅ 4.7.1 模板已安装 |

## MB-GD 新能力接入 Pi 扩展（2026-08-05 追加）

上游扩展只暴露 4 族；MB-GD1-6 新增能力已补入扩展（提交 d35f9e5）：

- **`gdeck_scene`**（新工具族）：`doctor`（只读体检）、`set`（headless 编辑，默认 dry-run、`apply` 才写、写前快照，confirmation=always）、`restore`（快照回滚）。
- **`gdeck_run`**（新工具族）：`query`（确定性白名单运行时查询 property/tree/signals/group）、`watch`（实时输出流 + 错误标注，超时=观察窗口正常结束）。
- **`gdeck_validate` 扩展**：`check` 支持 `file`（单文件秒级校验）；`verify` 支持 `json`（结构化失败摘要）；`oracle`（新增，跑 `npm run check` 的 Godot 侧 18 个 oracle 脚本 + reference:check，逐条计时 + 结构化报告，约 8 分钟，退出码=失败链数）。
- registry `PI_FIELDS` 新增：`seed`/`file`/`json`/`apply`/`scene`/`query`/`query-file`/`watch`/`main-scene`。
- ⚠️ 修改扩展 import 模块（runtime.mjs/registry）后需**完全重启 Pi** 才生效（ESM 缓存）。

## 已知环境注意

- 若同时开着多个 Godot 编辑器进程，`editor_bridge_read` 保持 unavailable（"2 live Editor sessions"）——gdeck 安全设计，关到只剩一个即可恢复。
- Pi `/reload` 不清理 ESM 模块缓存：修改 `runtime.mjs` 等 import 模块后必须**完全重启 Pi** 才生效（上游 CHANGELOG 已记录该限制）。

## 回退方法

- 扩展：删除 `settings.json` 的 `extensions` 项（恢复 `settings.json.bak-gdeck`）。
- GODOT_BIN：`setx GODOT_BIN ""` 或删除。
- 工具目录修复：用对应 `.bak` 还原，或升级 CLI 后重新应用上文修复。
