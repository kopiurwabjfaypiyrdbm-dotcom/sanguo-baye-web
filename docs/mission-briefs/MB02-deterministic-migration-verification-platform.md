# Mission Brief: Godot 迁移规则可批量重放并验证确定性状态

## Outcome

仓库拥有一套可扩展、语言无关的迁移验证平台：给定版本化的初始状态、显式 seed 和有序命令序列，TypeScript oracle 与 Godot 4.7.1/GDScript 能批量重放同一 fixture，产出相同的逐步结果、canonical state 摘要和最终状态摘要；失败或被篡改的 fixture 会给出明确、可定位的非零失败。后续 Mission 可以通过增加数据和适配命令来获得同一验证能力，而不再为每条规则复制一次性对照代码。

## Context

- 完整迁移总委托和自治推进约束见 `docs/mission-briefs/MB00-godot-full-migration-program.md`、`docs/migration/godot-program-roadmap.json` 与 `docs/migration/godot-program-state.json`；MB01 技术样片及证据见 `docs/mission-briefs/godot-migration-spike.md` 和 `docs/migration/godot-spike-report.md`。
- 当前单条对照由 `scripts/generate-godot-spike-data.ts`、`src/core/godotSpikeParity.test.ts`、`godot/data/fixtures/develop-farming-v1.json` 和 `godot/tests/run_all.gd` 实现。它已经证明开垦命令、32 位 LCG 和最小存档可以一致，但生成、投影、执行和断言仍围绕一条命令手写，不能直接支撑后续大量规则。
- 当前权威规则、数据和兼容政策仍由 Web `src/core/`、`src/compat/baye/`、`src/data/`、`docs/design/compatibility-policy.md` 与 `references/parity-matrix.md` 解释。Godot 的样片数据契约仍是收窄的 `dataContractVersion: 1`；扩大正式领域契约属于 MB03，而不是本委托。

## Required Behaviors

- 使用稳定、版本化、语言无关的 JSON 契约描述 fixture 集合、初始状态引用或内容、有序命令、每步可观察结果、后继 seed、canonical state 摘要和最终摘要；格式具有明确的算法/版本标识，未知版本被拒绝。
- TypeScript 提供可复用的生成与验证入口，Godot 提供独立的批量 runner；两端必须从相同 fixture 数据执行，不允许 Godot 调用 TypeScript/Node，也不允许 fixture 只保存待比较的期望值而不实际执行规则。
- canonical 表示不依赖对象/`Dictionary` 插入或遍历顺序，必须定义对象键、数组语义、数字、字符串、布尔和 null 的稳定编码。语义有序数组保持原顺序；无序集合必须在进入 canonical 编码前按其领域规则显式排序。两端使用同一明确命名的摘要算法并得到完全相同的十六进制结果。
- 平台至少以现有时期 1 和真实开垦命令证明：单步成功重放、包含多个检查点的有序重放、非法命令不推进权威状态或 seed，以及改变对象键插入顺序不会改变摘要。执行结果必须继续与当前 TypeScript oracle 一致。
- 批量 runner 在 fixture、命令适配、步骤结果、摘要或最终状态任一处不一致时返回非零状态，并报告 fixture ID、步骤索引和差异类别；不得通过重生成期望值掩盖实现回归。
- 提供一个适合后续自动化的仓库命令，能够先验证/生成受控 fixture，再运行 TypeScript 与 Godot 4.7.1 headless 对照。现有 `npm run check`、Godot 主场景、MB01 fixture 和 Web 产品继续可用。
- 完成后更新 parity matrix、程序账本和 Mission report；账本必须能在上下文丢失后唯一恢复到下一个依赖已满足的 Mission。

## Constraints

- 使用 Godot 4.7.1 和 GDScript，不引入 C#、WebView、JSBridge、嵌入式 JavaScript/TypeScript 或网络依赖。
- 权威 GameState、canonical 编码、摘要、replay 和命令执行不得挂入场景树，也不得依赖 Godot 默认 RNG、帧率、系统时间、区域设置或 `Dictionary` 遍历顺序。
- 保留现有 Web oracle 和样片功能；不得为了通用化而改变开垦规则、LCG、当前 fixture 的可观察结果或 MB01 已证明的 Android 行为。
- 不把 `references/vendor/baye-c-core/` 变为应用依赖，不加入受限或许可证不明内容。fixture 继续标明内部迁移验证用途和再分发待审状态。
- 不推送、不创建 PR、不发布构建产物；只允许当前迁移分支上的可回退本地修改和检查点提交。

## Non-goals

- 正式完整 GameState schema、全部规则命令、战略月循环、战术模拟、完整存档迁移、客户端 UI 改造或新的美术表现。
- 证明当前 Web 开垦规则与未知 BBK 设备随机序列逐结果一致；本平台验证的是已命名 oracle 和证据等级下的跨客户端确定性。

## Evidence of Completion

- TypeScript 和 Godot runner 对同一 fixture 集合报告相同的 fixture 数、步骤数、逐步摘要和最终摘要；至少一个多步骤 replay 与一次非法命令路径实际执行并通过。
- 自动测试证明 canonical 编码对对象键插入顺序不敏感、对语义数组顺序敏感，并覆盖字符串转义、整数边界、布尔与 null；TypeScript 与 Godot 对这些向量摘要完全一致。
- 负向演练篡改命令、期望步骤或摘要后，runner 以非零状态失败并定位 fixture/步骤；演练使用临时或内存数据，不污染受版本控制的期望文件。
- `npm run check`、新的迁移验证命令、Godot 领域测试、Godot 4.7.1 编辑器导入和主场景 headless 启动通过；版本控制检查确认无构建产物和受限素材。
- 完成自检与独立只读审查，修复全部 P0、P1 和本 Mission 引入的 P2；`docs/migration/mission-reports/` 留下结果、命令、摘要样本、已知限制和下一 Mission 选择依据。

## Delegated Decisions and Unknowns

- 自主决定 fixture 文件拆分、canonical JSON 实现、摘要算法、命令适配接口、CLI 形状和测试组织；优先采用两端标准库稳定支持、实现可审计且不需要外部依赖的方案。
- 自主选择多步骤开垦序列所需的合法城市和人物，并从 Web oracle 生成结果；若收窄样片契约无法表达某个负向案例，应在 runner 层验证不变性，而不是提前扩大 MB03 范围。
- 可以兼容读取 MB01 的既有 fixture 或将其转换为新平台 fixture，但必须保留原文件、原断言或等价回归证据，不得静默破坏已有报告的可复验性。

## Autonomy and Approval Boundaries

- 已授权在当前迁移分支内调查和修改本 Mission 所需的脚本、测试、Godot 纯领域代码、fixture、文档和 npm 命令，运行 Godot 4.7.1/headless、Web 测试与构建，并创建本地检查点提交。
- 安装新依赖或工具、修改 MB00 固定条款、破坏性操作、推送、PR、发布、许可决定及扩大到 MB03 或游戏规则广度需要用户批准；普通实现选择、失败诊断和测试修复无需暂停。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
