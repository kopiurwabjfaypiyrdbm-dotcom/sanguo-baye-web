# Mission Brief: 原版规则校准与战术身份 v0.9

## Outcome

四个内置时期可以使用明确、可保存且可迁移的规则身份开始并持续战役；原版证据已经足够明确的开局、命令、太守与战术行为不再被无标识的临时规则覆盖。玩家能够在手动战斗中主动全军撤退，不同兵种、城市与人物在战场上呈现可辨识的原版结构身份，同时继续使用来源明确的现代地图与界面。

## Context

- 本仓库是步步高电子词典版《三国霸业》的现代 Web 重写；产品进度优先，但兼容声明必须有固定源码或可重复夹具支持。
- 当前四时期、38 城、经营、人事、AI、存档、快速战斗和手动战斗已形成完整 Alpha。真实能力与差异以 `README.md`、`docs/HANDOFF.md` 和 `references/parity-matrix.md` 为准。
- 固定 MIT C 子集位于 `references/vendor/baye-c-core/`。`tactic.c:LoadPeriod/SetCitySatrap`、`Fight.c`、`FightSub.c`、`FgtCount.c`、`FgtPkAi.c` 和 `baye/fight.h` 是本阶段首要事实源。
- 用户提供的本地 MIT C 快照还包含 `baye_c/src/pconst.c`，给出命令成本、兵种攻击范围、技能分配和城市战场身份等补充证据；它尚未进入已批准 vendor allowlist，使用前必须固定哈希并记录来源边界，不能把个人路径变成产品依赖。
- 当前 400 开局兵力、多项临时命令成本、持久手动太守、六张取模战场、菱形普通攻击范围、十项按智力开放的现代计谋和缺少全军撤退，是本阶段需要处理的主要差异。

## Required Behaviors

- 新战役具有明确、版本化的规则身份并随存档保存；旧存档能够确定迁移到保持既有结果的兼容身份，不因升级静默改变正在进行的战役。
- 原版校准身份采用已验证的 `LoadPeriod` 开局兵力与体力、命令消耗及太守选择语义；现代安全或平衡差异仍可保留，但必须可识别、可测试且不冒充原版结果。
- 玩家手动进攻和防守都可以确认全军撤退；撤退只结算一次，并复用正常战败的兵力、俘虏、死亡、装备、继承、城市归属、恢复日志和自动存档不变量。
- 城市战场身份、普通攻击范围、技能可用性和道具攻击范围优先恢复源码支持的结构。受限原始地图、技能资源或数据数组不可直接入库时，使用可替换的程序化表现，并通过本地条件夹具验证兼容边界。
- 玩家与战术 AI 使用同一攻击、技能和撤退合法性；所有随机行为继续确定推进可保存种子，相同存档与命令产生相同结果。
- UI 清楚显示所选规则身份、命令真实成本、兵种攻击形状、人物技能来源、撤退后果和战斗胜因；禁用或不支持时显示原因。
- 规则身份、战术状态和新增道具语义必须通过序列化、迁移、完整性校验、战斗恢复和长期战役闭包。

## Constraints

- 遵守 `AGENTS.md`、`docs/design/compatibility-policy.md` 和 `references/provenance/`；不得提交 `.lib`、字体、原版图片、音视频、WASM、生成的嵌入式原版资源数组、GPL 离线实现或未经批准的 `.reference/` 内容。
- `references/vendor/baye-c-core/` 是只读固定基线，不能手工扩充。补充本地证据必须通过哈希、来源说明和可再生验证进入研究记录。
- 只有源码定位和可重复比较共同支持的行为才能进入 `src/compat/baye/` 或获得原版一致声明；产品协调、存档闭包和现代替代行为留在 `src/core/` 并明确命名。
- React 与 Phaser 只收集意图和呈现；规则合法性、结算、AI、胜负和存档事务由核心层负责。
- 保持不可变状态、版本化存档、确定性 RNG 和完整性校验；不得删除测试、降低断言或绕过损坏数据拒绝。
- 不推送、发布、合并 PR、导入许可证不明资产或执行破坏性操作，除非用户另行授权。

## Non-goals

- 不要求逐像素复刻 160×96 LCD、复制原版地图 tile、头像、字体、动画、音乐或音效。
- 不以联盟、婚姻、人物关系、未证实历史剧情、被注释的单挑或 BBK `SysRand` 逐序列一致作为本阶段完成条件。
- 不要求一次性复现全部原版战术 AI 权重和全部技能资源数值；无法合法固定的内容保持程序化、可替换和诚实标注。

## Evidence of Completion

- `npm run check` 通过，固定参考校验、全部非条件测试、TypeScript 与生产构建成功；已知包体警告有明确判断。
- 自动化覆盖四时期两种规则身份的开局与长期战役、旧存档迁移、命令成本、太守选择、全部撤退入口、快速/手动结果不变量、战斗恢复以及重复结果拒绝。
- 许可允许的 C 源码、哈希固定的本地补充参考或独立最小 oracle 能复现代表性命令成本、兵种攻击形状、技能身份和战场身份结论。
- 浏览器完成规则选择、代表性经营命令、手动进攻撤退、手动防守撤退、兵种攻击范围与技能来源检查、保存重载和战后续玩；控制台无应用错误。
- `README.md`、`docs/HANDOFF.md`、`references/parity-matrix.md` 与来源记录准确区分已校准规则、现代身份和仍受许可限制的原版资源。

## Delegated Decisions and Unknowns

- 执行者根据存档兼容成本决定规则身份的最小模型、默认选择和 UI 文案；优先保证新玩家理解、旧战役不变和未来能够追加兼容版本。
- `pconst.c` 中的标量事实、结构化表与原始资源数组应按许可证和再分发风险分别处理；可以用语义函数、哈希或最小不可替代夹具验证时，不复制整张数据表。
- 战场身份无法合法逐城嵌入时，执行者选择能保留七类结构身份且不依赖原始资产的程序化方案，并准确记录剩余差距。
- 原版证据与当前长期平衡冲突时，保留明确的现代安全身份，而不是为了单一数值让四时期战役失去可玩性。

## Autonomy and Approval Boundaries

- 可自主读取和修改本仓库、只读研究已固定或用户提供的本地参考、运行测试/构建/oracle/长期推演、复用一个本地开发服务器、执行浏览器验收、更新项目文档，并创建小型本地检查点提交。
- 可自行修复由本阶段引入的规则、迁移、UI、性能、确定性和文档问题；不得覆盖委托开始前的用户改动。
- 采用原版或第三方资产、扩大 vendor allowlist、外部推送/发布、改变上游 PR、产生费用、系统级安装或不可逆操作时必须请求用户确认。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
