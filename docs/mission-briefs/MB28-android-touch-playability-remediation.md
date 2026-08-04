# Mission Brief: Android 触控可玩性整改至可连续游玩

## Outcome

在 MuMu 或横屏 Android 真机上，玩家仅用手指/鼠标即可从主菜单连续完成：开局 → 战略地图点选与命令 → 进入战术并完成至少一回合操作 → Android Back 确认行为可预期；触控目标、滚动、拖缩与层级返回达到可游玩质量，不再出现“点不准、进不去、玩不下去”的阻塞。整改后的当前源码 APK 经用户人工复验通过后，才允许再次申请 Goal 门评估。

## Context

- 程序委托见 `docs/mission-briefs/MB00-godot-full-migration-program.md`；账本见 `docs/migration/godot-program-state.json`。
- MB27 已关闭：用户人工触控结论为**无法游玩、质量严重不达标、Goal 不通过**（`docs/migration/mission-reports/MB27-current-source-android-acceptance.md`）。
- **执行立场**：不要把验收责任推回用户反复试玩。Agent 必须先对照 Web 产品主动找出阻塞可玩性的缺口并修复，直到给出人类可接受的连续游玩版本，再请用户复验。
- 自动化 presentation/domain 门禁不能单独覆盖本 Outcome；失败基线 APK 为 `godot/builds/sanguo-baye-godot-mb27-touch-debug.apk`。
- Web 产品对齐计划见 `docs/migration/godot-web-alignment-plan.md`；军事闭环（征兵/分兵/出征）属于可玩性先决，可在本 Mission 内优先落地，但不因此自行关闭 Goal。

## Required Behaviors

- 主菜单、战役设置（时期/君主卡片）、进入战略地图的触控路径在目标横屏尺寸下可稳定完成。
- 战略地图拖动、缩放、点城、城卡/命令入口可触达；滚动区域不吞掉主操作，48dp 级目标在实机密度下可点。
- 战术屏至少一个完整操作闭环（选单位 → 移动或攻击或休整/结束回合）可触控完成；Android Back 确认框可点且语义正确。
- 记录复验设备、分辨率/密度、失败复现步骤与修复后截图或等价可见证据；不把 ADB 注入写成通过。
- 回归：相关 presentation runners 与 `npm run godot:gdeck:verify:fast`（或等价）保持绿；引入的 P0/P1 清零。

## Constraints

- Godot 4.7.1 + GDScript；不引入 WebView/JS；不削弱 Web oracle / `npm run check` 组件门禁。
- 停留在 `codex/godot-migration-spike`；不推送、不 PR、不发布，除非用户另批。
- 不伪造触控证据；不修改 MB00 固定条款；不把本 Mission 完成写成 MB00 Goal 完成。
- 下载/安装组件、破坏性操作需用户批准。

## Non-goals

不完成本轮全部 Web 军事对齐（征兵/出征/守城）、不完成正式美术、不解决全部 BBK 原版不确定性、不关闭 provenance/许可决策。

## Evidence of Completion

- 用户（或用户指定的人工）在可见设备上确认主路径可连续游玩，并留下截图/短记录。
- 失败基线问题有对应代码修复与可重复验证；当前源码 APK 已重导并安装（路径/哈希入报告）。
- Mission 报告、账本、本地提交一致；Goal 仍为 active，仅允许“申请再次 Goal 评估”，不得自行标 Goal 完成。

## Delegated Decisions and Unknowns

优先修阻塞游玩的控制/布局/输入路由，再打磨观感。具体控件改写、是否保留样片战术入口由证据决定。若某问题实为模拟器旋转/注入限制，须与真实触控失败分开记录，不得用前者解释后者。

## Autonomy and Approval Boundaries

授权：本地改 Godot 表现/输入、跑测试与 gdeck、更新报告/账本、本地提交、在已有模板下重导 Debug APK 并装到已连接设备。  
需批准：新组件下载安装、推送/PR/发布、改 MB00、许可决策。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
