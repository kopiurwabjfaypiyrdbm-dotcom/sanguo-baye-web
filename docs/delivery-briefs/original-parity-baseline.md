# Delivery Brief: 原版数据与战斗内核形成可验证基线

## Outcome

本仓库具备一条可重复、可审计的原版兼容性验证路径：执行者能够从已锁定的上游版本提取最小必要的结构与行为证据，并据此证明 TypeScript 实现的随机数生成和核心战斗计算在代表性输入上与步步高电子词典版《三国霸业》一致。

阶段完成后，仓库应同时拥有可追溯的数据结构映射、带来源信息的版本化参考样本、自动化差异测试，以及基于证据更新的兼容性状态。后续城市指令、月度结算和现代化界面工作可以直接复用这套验证基线，而不再依赖印象、截图猜测或当前临时规则。

## Context

- 项目目标是对步步高电子词典版《三国霸业》进行现代 Web 重写，工作重心是“解析、验证和现代化呈现”，不是把现有多平台移植壳直接包装成最终产品。
- 当前 React/Phaser/TypeScript 工程已有可运行的确定性游戏循环、经济、AI 与战斗原型；其中 `src/core/random.ts`、`src/core/battle.ts`、`src/core/types.ts` 及 `src/data/` 的相关行为属于架构验证实现，尚不能声明为原版兼容。
- 上游参考仓库和固定提交记录在 `references/upstream-lock.json`。`references/README.md` 说明本地获取流程，`scripts/fetch-baye-reference.ps1` 负责把参考内容放入被 Git 忽略的 `.reference/`。
- `references/architecture-map.md` 是上游组成与权威等级的入口；`Baye/baye_c` 的共享 C 核心及其可复现实测结果是主要行为依据。`Baye/baye_doc/_sources` 和 `Baye/baye_offline` 仅作为辅助参考，具体许可与使用边界见 `references/provenance/`。
- 当前兼容性事实记录在 `references/parity-matrix.md`，初始界面观察项记录在 `references/screen-catalog.md`，美术与双主题原则记录在 `docs/design/art-direction.md`。

## Required Behaviors

- 参考环境可由锁文件稳定复现，并能验证检出的提交、关键目录和许可证信息；`.reference/` 中的原版或上游分发内容始终不进入版本控制。
- 核心人物、城市、宝物/道具与剧本数据建立可审计的源到目标映射。映射应保留 C 侧字段名、数据宽度、索引规则、哨兵值和已确认语义；证据不足的含义必须明确标为未知，不得用现代游戏常识补齐。
- 原版参考输出以最小、稳定、机器可读的样本进入仓库。每份样本都能追溯到上游提交、源函数或入口、完整输入与随机种子；不得为方便测试而分发整套原版资源、预编译游戏或无关数据。
- TypeScript 兼容随机数实现对代表性种子、边界值和连续调用序列产生与原版相同的结果。测试能够发现种子初始化、取模、整数溢出或调用次数偏移造成的差异。
- 战斗验证明确区分战术攻击/伤害计算与战略层的电脑对电脑结算，不把两个入口的规则混为一谈。被纳入本阶段的计算覆盖兵种相克的 6×6 关系、适用地形，以及原版实际使用的等级、武力、智力、装备、兵力或兵种因素。
- 对确定性整数计算要求精确匹配；若原版存在平台相关数值行为，允许使用容差前必须记录其 C 类型、截断/溢出语义和形成容差的证据。
- 当前临时实现仍可保留用于应用运行，但其状态必须清楚标注。只有获得独立原版输出支持的规则才能升级为“已验证兼容”，兼容层与现代扩展不得相互伪装。
- 首批关键界面应留下足以约束后续现代化呈现的结构化观察：逻辑尺寸、核心字段、焦点/操作顺序和输入路径。截图与原始美术只能留在被忽略的本地参考区，除非另有明确授权。
- `references/parity-matrix.md` 的状态变化必须由可定位的源代码、参考样本和自动化验证共同支撑；“测试通过”本身不能替代原版证据。

## Constraints

- 行为冲突时的权威顺序是：固定上游版本的可复现实测结果、共享 C 核心源码、技术文档中的默认算法、项目说明或社区描述、当前 TypeScript 原型。
- 保持现代 Web 重写方向。可以借助 C 测试程序、WASM 接口或离线运行时生成验证证据，但不得把完整上游 WASM/移植版直接嵌入为最终实现。
- 不把 `Baye/baye_offline` 的 GPL 实现复制进主产品代码；不提交来源或再分发权不清晰的 `.lib`、字体、原始图像、二进制或预构建 WASM。不得改变本项目许可证来规避这些边界。
- 默认使用 `references/upstream-lock.json` 当前固定的提交。只有发现固定版本无法支撑本阶段目标时才可调整，并须同时保留变更理由、旧新版本差异和可重复性。
- 在不违背原版行为的前提下，延续现有 TypeScript 的确定性、不可变状态和模块边界；当现代工程偏好与原版语义冲突时，先保存原版兼容层，再把现代化差异设计成显式选择。

## Non-goals

- 完成所有城市指令、月度结算、AI、战役流程或存档格式的全面原版兼容。
- 制作可玩的手动战斗界面，或完成 Phaser 地图与 React 交互层的产品化接线。
- 批量导入原版 `.lib` 数据、素材或二进制，制作正式美术资产，或实现 Classic/Modern 两套完整主题。
- 对原版数值进行平衡性修正、体验优化或机制扩写；这些差异属于后续显式现代化层。

## Evidence of Completion

- 固定参考的获取与校验流程在干净环境中成功运行；若执行环境客观缺少工具或合法资源，仓库中应保留可复现的诊断证据和不依赖受限资产的最小替代路径，而不是把推测当成参考输出。
- 数据映射能从 TypeScript 字段反查到固定上游中的确切文件、结构或读取逻辑，并包含对索引、哨兵和数值宽度的边界验证。
- 版本化参考样本可由明确记录的参考入口重新生成；样本元数据足以检测上游提交、输入、种子或算法入口发生漂移。
- 差异测试使用独立产生的原版结果挑战实现，覆盖多个随机种子、序列调用、整数边界，以及有权威数据支持的完整 6×6 兵种组合和代表性地形/属性组合。故意改变随机调用次数、取整方式或兵种系数时，测试应能失败。
- 兼容性矩阵与实际证据一致，能区分“结构已解析”“已取得参考输出”“实现已差异验证”和“仍为临时规则”。首批界面观察记录同样能够追溯到本地参考运行或上游资料。
- 全部既有与新增自动化测试、类型检查和生产构建通过；至少以 `npm run check` 和 `git diff --check` 证明本阶段没有破坏当前可运行基线。

## Delegated Decisions and Unknowns

- 参考输出生成器可选择最小 C harness、现有 WASM/JS 钩子或离线运行入口。执行者应优先选择依赖少、输出确定、可自动复现且不会扩大许可证风险的路径；无需为了统一技术栈而重写可靠的参考端。
- 兼容代码、映射文档和样本的具体目录与模式由执行者按仓库惯例决定。若当前 `src/core` 会混淆临时逻辑和原版语义，可建立明确命名的兼容边界，但不要求预设文件布局。
- C 侧整数宽度、符号、溢出、随机调用顺序和平台差异是需要从源码与运行结果解决的未知数。发现不可消除的平台差异时，应保留原始证据并选择最符合目标设备行为的可解释语义。
- 首批界面的具体数量与选择取决于参考运行可达性；优先覆盖能约束全局导航、城市信息、指令菜单、战斗信息和对话/消息呈现的代表性画面，而不是追求截图数量。
- 技术文档、预构建资源及数据文件的独立许可仍可能不完整。无法确认再分发权时只记录事实、哈希、字段观察和必要的最小测试输出，不复制源资产。
- 本阶段结束时应根据证据指出城市指令或月度结算中最合适的下一个原版入口，但不要求在本阶段实现该入口。

## Autonomy and Approval Boundaries

- 执行者有权在本仓库内进行为达成结果所需的可逆修改，包括读取固定上游参考、增改源码/测试/脚本/文档、生成最小样本，以及运行本地测试和构建。
- 可按既有脚本把固定上游检出到 `.reference/`，也可在临时目录编译最小参考程序。新增依赖应保持必要、可审计并遵循现有包管理方式。
- 遇到无关的用户改动应保留并绕开，不得擅自回退。删除或覆盖重要文件、重写历史、推送远端、发布部署、改变许可证、引入原版/受限资产，或把 GPL 实现纳入主产品前必须取得用户确认。
- 若唯一可行路径需要大规模下载、系统级安装、外部账号/密钥、付费服务或新的资产授权，应先说明收益、替代方案和风险并请求批准。普通的固定公开上游获取与本地只读分析不需要额外确认。

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
