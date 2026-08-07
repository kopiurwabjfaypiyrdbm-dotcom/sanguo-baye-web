# MB02 确定性迁移验证平台报告

- 日期：2026-08-02
- 分支：`codex/godot-migration-spike`
- 简报：`docs/mission-briefs/MB02-deterministic-migration-verification-platform.md`
- 引擎：Godot `4.7.1.stable.official.a13da4feb`

## 结果

MB02 已建立不依赖场景树或浏览器运行时的跨语言验证底座。TypeScript oracle 生成版本化 JSON suite；TypeScript validator 与 Godot 4.7.1/GDScript runner 各自执行同一有序命令序列，并比较可观察结果、每步权威状态 SHA-256 和最终摘要。Godot 不调用 Node，Node 只负责编排两个独立验证进程。

`canonical-json-v1` 明确定义 null、布尔、字符串、语义有序数组及按 Unicode 标量排序的对象键；`safe-integer-or-decimal-6-v1` 把数字收窄为安全整数，或绝对值不超过 90 亿且最多 6 位小数的十进制数，两端都用整数缩放格式化而不依赖默认 float 字符串。摘要算法为 UTF-8 上的 SHA-256。超出数值域或其他编码错误通过显式结果向上传播，禁止对错误哨兵求摘要。

## 回放证据

fixture：`godot/data/fixtures/migration-replay-suite-v1.json`

- 7 个 canonical 向量覆盖 null/布尔/整数/小数、中文与控制字符、数组顺序、对象重排、能区分 UTF-16 与 Unicode 标量排序的键，以及 int32/uint32/JavaScript 最大安全整数边界。
- `develop-farming-single-v1`：初始摘要 `e8b629e82ba3e606dfeb34ff118f0bcd5b75d5a85c38189ef4a806e8586c551a`；曹操开垦后摘要 `f677c68bd67040122d9ebbf2f85b5853da220347009759f0ec6d66d144ae8c16`。
- `develop-farming-sequence-v1`：曹操成功后，夏侯惇继续开垦，seed 从 `373686124` 变为 `860746715`，最终摘要 `7c4858bac3a4063f6dd3ff8915ad02a144c6dd2e03db94a01abeb94d5e29b23e`。
- 第三步使用不存在的城池，TypeScript 与 Godot 都返回“只能在己方城池执行命令”；前后摘要均为最终摘要，证明状态和 seed 未推进。
- 负向演练临时把第二个成功步骤的 `afterStateSha256` 改成全零；Godot 非零退出并定位 `develop-farming-sequence-v1.step[1].afterStateSha256`，临时文件随后清除，受控 fixture 未被重写。

## 验证命令

以下命令均通过：

```powershell
npm run godot:migration-check
npm run check
& 'D:\03_Godot\01_Engine\Godot_v4.7.1-stable_win64_console.exe' --headless --editor --path godot --quit
& 'D:\03_Godot\01_Engine\Godot_v4.7.1-stable_win64_console.exe' --headless --path godot --script res://tests/run_all.gd
& 'D:\03_Godot\01_Engine\Godot_v4.7.1-stable_win64_console.exe' --headless --path godot --script res://tests/presentation_input_smoke.gd
& 'D:\03_Godot\01_Engine\Godot_v4.7.1-stable_win64_console.exe' --headless --path godot --quit-after 3
```

结果：迁移 suite 为 7 vectors / 2 replays / 4 steps；Web 为 367 passed / 4 skipped；Godot 领域为 140 assertions，表现输入为 6 assertions；编辑器导入与含主场景项目启动均为零退出。

## 自检与风险

- canonical 与完整回放验证器均为 `RefCounted`/纯函数式模块；`SceneTree` CLI 只负责参数、allowlisted 文件读取、输出与退出，没有 Autoload、Node 权威状态、默认 RNG、时间或帧依赖。
- 生成器显式排序第二条合法命令候选，不依赖对象或 `Dictionary` 的遍历顺序。
- Godot 对不存在城池的错误文本改为与当前 TypeScript availability oracle 一致；成功路径、RNG 和旧 `develop-farming-v1.json` 未改变。
- `godot/builds/` 与 `godot/.godot/` 仍被忽略；版本控制扫描未发现 Godot 下的 APK/AAB/WASM、原版素材或 `.reference/` 内容。仓库既有合法来源视频不属于本 Mission 变更。
- v1 runner 只适配 `developFarming`，只允许 `godot/data/period-1.json` 初态；命令与数据广度由后续 Mission 显式扩展。高精度/指数/次正规小数不属于 v1 数值域，未来确有领域需求时必须升级算法版本。
- 三路只读审查最初发现 6 个 P1、7 个 P2（其中结构中断/挂起与 canonical 错误传播为重复发现）；已逐项落实纯 verifier、结构门、受限数值域、版本/路径门禁、精确引擎版本、超时和位置无关 CLI，最终复审结论记录于收口状态。
- 架构/场景树、确定性/fixture、平台/移动回归三路最终只读复审均确认 P0、P1、P2 清零。

## 下一 Mission 依据

MB02 已使后续规则/数据迁移能够复用同一摘要与回放协议。路线图中唯一依赖已满足的下一项是 MB03“Production domain data contract”：把当前时期 1、`dataContractVersion: 1` 的技术样片边界升级为可承载四时期和后续完整规则的生产领域数据契约，而不提前移植规则广度。
