# Mission Brief: 四时期战役达到基本完整、可长期游玩的 Alpha

## Outcome

玩家可以从四个内置时期选择任一可用君主，在不依赖本地原版文件的情况下持续经营、用人、调度、作战并最终统一或失败；战略与手动战术形成有内容深度的完整循环，存档可安全延续，主要规则缺口、现代化差异和剩余非阻塞内容均有准确记录。该成果应当从“首个可玩纵切面”提升为可以交给玩家反复游玩的功能完整 Alpha，而不是以继续研究或扩建底层框架代替产品进度。

## Context

- 仓库是步步高电子词典版《三国霸业》的现代 Web 重写，产品进度优先，原版行为通过证据逐步恢复。
- 当前四时期、38 城、人物与势力数据、基础经营和人事命令、战略 AI、快速结算、手动战术 v0.2、胜负、自动/手动存档和确定性回归已经形成闭环。
- 真实现状和接手入口以 `docs/HANDOFF.md`、`README.md`、`references/parity-matrix.md`、`references/provenance/`、`AGENTS.md` 和 `CONTRIBUTING.md` 为准；当前阶段委托不得依赖聊天历史。
- 固定的 MIT C 参考位于 `references/vendor/baye-c-core/`。只有该子集不足时才使用被忽略的 `.reference/`，不得重新把研究准备本身当成交付目标。

## Required Behaviors

- 四时期和不同强弱君主能够连续运行长期战役；战略 AI 能经营、调兵、防守和扩张，战役不会因负资源、失效人物归属、空城循环、重复行动、无效太守或回合推进而卡死。
- 战略经营覆盖形成完整决策循环所必需的经济、人才、物资、侦察和战后人员处置；人物、城池、道具、装备、俘虏和成长状态在命令、战斗、AI、存档与校验之间保持一致。
- 手动战术在现有移动、普通攻击和基础 AI 之上形成足够完整的战斗循环，至少包含可替换的数据驱动战场、技能或计谋、天气或状态、装备影响、战后经验与俘虏处理；快速结算和手动结果遵循同一战略回写不变量。
- 未出仕人物和在野人物不会因临时数据规则错误提前登场、重复驻扎或丢失；势力灭亡、君主失败和武将撤退有确定且可恢复的处理。
- 现有标题、剧本选择、地图、城池面板、战术界面和存档入口随新增系统演进为清晰可操作的产品界面；禁用原因、选择结果、月度摘要、战斗目标和重要状态对玩家可见。
- 每个随机行为保持确定性并推进持久化种子；相同存档和相同命令得到相同结果。存档模型变化必须包含迁移、旧存档回归和损坏数据拒绝。
- 实现优先采用能够尽快增加可玩深度、又不封死原版兼容替换路径的方案。缺少证据时可以使用小而明确的现代临时规则，但必须隔离、测试并在一致性矩阵中标记。

## Constraints

- 遵守 `AGENTS.md` 的参考、许可证和交付要求；不得提交原版 `.lib`、字体、图片、音视频、WASM、生成的内嵌资源数组、未经允许的 `.reference/` 内容或 GPL 离线实现。
- 固定 C 参考是规则和结构的首要事实源。任何“原版一致”声明必须有上游文件/函数或可重复夹具；测试通过不能单独证明原版一致。
- 兼容算法进入 `src/compat/baye/`，可玩领域行为进入 `src/core/`；React 和 Phaser 只负责收集意图与呈现，不复制核心合法性或数值规则。
- 保持不可变状态更新、确定性、版本化存档和完整性校验；不得通过绕开校验、删除测试或降低断言完成阶段。
- 以小而可验证的纵向增量推进。每个增量完成后先运行相关测试，达到稳定检查点后运行 `npm run check`；失败必须定位和修复后再扩大范围。
- 不执行推送、PR、远端发布、外部消息、系统级安装、破坏性操作或来源不明资产导入，除非用户另行授权。

## Non-goals

- 不要求逐像素、逐帧、逐随机序列复现 BBK 设备，也不要求在 Alpha 阶段完成全部正式美术与音频。
- 不以多人联机、云存档、账号系统、完整 MOD 平台或原版存档互通作为基本完整 Alpha 的前提。
- 不为了追求尚无证据的细节停下可玩产品推进；不把大规模无目标重构、工具重写或参考仓库搬运作为替代交付。

## Evidence of Completion

- `npm run check` 通过，固定参考校验、全部非条件性测试、TypeScript 和生产构建均成功；已知构建警告有明确风险判断。
- 四时期至少各有一名君主通过自动化长战役回归，并额外覆盖弱势君主、玩家进攻与防守、手动与快速战斗、势力灭亡、人物与道具流转、保存重载及胜负终局。
- 浏览器从标题屏完成代表性的开局、经营、人事/物资操作、手动进攻、手动防守、月度推进、保存重载和战后继续游玩；控制台没有应用错误，反复进入战场不产生额外开发服务器或明显持续 CPU 异常。
- 至少进行规则/状态、战术与 UI/文档三个独立审查视角；所有 P0/P1 和本阶段引入的 P2 均修复或有明确、可信的非阻塞说明。
- `README.md`、`docs/HANDOFF.md`、`references/parity-matrix.md` 与 `references/provenance/` 准确反映新增能力、临时规则、验证证据和剩余缺口。

## Delegated Decisions and Unknowns

- 执行者根据实际代码依赖选择增量顺序；通常优先解决同时连接战略、战术和存档的领域模型，再扩展玩家命令、AI 与表现，但不得把这理解为固定任务清单。
- 原版规则证据不完整时，由执行者在“继续定位证据”和“先实现可替换的现代规则”之间判断；选择应以是否阻塞当前可玩闭环、错误兼容声明风险和未来替换成本为依据。
- 原版资产许可边界未解决前，战场、图标和反馈继续使用来源明确的程序化或原创占位表现；正式美术生产另行委托。
- 如果完整 Alpha 的某个低频原版功能会显著拖延核心战役循环，可以记录为后续 Beta 内容；但人物/物资成长、战后处置、战术技能深度、长期 AI 和存档可靠性不能以此方式后置。

## Autonomy and Approval Boundaries

- 可自主读取和修改本仓库文件、只读研究已入库参考、运行测试和构建、启动并复用单个本地开发服务器、执行浏览器回归、更新项目内文档，以及使用子智能体进行独立只读审查。
- 在用户明确授权执行本委托后，可在当前功能分支创建小型本地检查点提交，以保持长任务可回退；不得覆盖或丢弃委托开始前的用户改动。
- 遇到可通过仓库事实、固定参考或测试确定的问题应自行解决。只有需要扩大产品范围、改变兼容政策、采用许可证不明资产、执行外部写入/发布、产生费用或进行不可逆操作时才暂停并请求用户决定。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
