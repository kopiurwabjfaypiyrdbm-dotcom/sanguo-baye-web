# 代码来源边界

## 已确认

| 来源 | 上游位置 | 许可证标记 | 本项目策略 |
|---|---|---|---|
| C 多平台移植核心 | `Baye/baye_c` | MIT，Copyright 2015 loongw | 筛选后的规则与结构源码固定在 `references/vendor/baye-c-core/`；复用时保留许可证与声明 |
| 离线 Web 发布包 | `Baye/baye_offline` | 目录内为 GPL v2 文本 | 默认仅参考，不复制实现 |
| 脚本 API 文档 | `Baye/baye_doc` | 尚未找到独立许可证声明 | 仅作事实参考和链接引用 |

## 规则

1. 当前仓库尚未声明整体开源许可证，不通过文档推断许可证兼容性；vendored MIT 子目录不改变主项目的许可状态。
2. 从 MIT C 核心移植算法时，记录原文件、函数、固定提交和移植方式。
3. 复制任何非平凡代码前必须建立来源条目并保留所需声明。
4. GPL Web 包的 JavaScript/CSS/HTML 不进入主实现，除非项目明确选择兼容的发布许可证。
5. 仅凭 README 中“开源”或“重制”描述，不能推断其中二进制、美术或游戏数据获得相同授权。
6. vendored 基线只允许 `scripts/reference-core-files.mjs` 列出的文件；`.lib`、字体、图片、音视频、WASM 和内嵌资源数组禁止加入。

## 本阶段移植记录

| 本项目文件 | 上游入口 | 方式 | 验证 |
|---|---|---|---|
| `src/compat/baye/rng.ts` | `comIn.c:gam_rand` 所调用的 Emscripten `rand_r` | 依据实际 WASM 序列重写 LCG 与 temper 步骤 | `fixtures/rng-web-wasm.json` |
| `src/compat/baye/tacticalBattle.ts` | `FgtCount.c:BuiltAtkAttr/CountAtkHurt/FgtCountWon`、`tactic.c:GetArmType` | 重写常量、C 数值顺序和分支；不链接上游代码。`dFgtLandF` 只记录本地偏移、长度与哈希，产品使用独立编写并明确命名的现代地形修正表 | `fixtures/battle-c-oracle.json`、`fixtures/lib-original.json` |
| `src/core/rulesets.ts`、`src/data/legacyScenario.ts` 规则身份与开局 | `tactic.c:LoadPeriod/SetCitySatrap`；哈希固定本地 `pconst.c:ConsumeThew/ConsumeMoney` | 将开局兵力/体力、太守策略和命令成本重写为可保存的经典校准身份；schema 1–5 迁移到保留历史行为的现代平衡身份。不复制生成数组 | `src/core/rulesets.test.ts`、`src/core/saveGame.test.ts`、`src/data/bundledScenarios.test.ts`、`references/original-rules-calibration-notes.md` |
| `src/data/legacyScenario.ts:buildCityFactionAssignments` | 时期 2 等少量已入城队列人物仍保留另一当前君主索引；城池队列与城池君主共同给出可验证的当前驻扎关系 | 解析桥接规则：仅对具备有效当前君主标记的已分配人物，以所在城池当前归属规范化势力；无君主或非当前君主记录仍保持在野 | `src/data/legacyScenario.test.ts`、四时期 `src/data/bundledScenarios.test.ts` |
| `src/core/equipment.ts`、`src/core/personnelCommands.ts` 道具规则路径 | `attribute.h:GOODS/PersonType/CityType`、`citycmd.c:SearchDrv`、`citycmdb.c:LargessMake`、`infdeal.c:AddGoodsPerson/DelGoodsPerson/GetCityPGoods/GetCityDispGoods`、`FgtCount.c:CountMoveP` | 依据字段和分支语义重写隐藏/发现库存、搜寻、赏赐、两个有序装备位、有效属性、兵符门槛与移动加成；未复制界面和控制流。并列赏金为明确现代差异 | `src/data/legacyScenario.test.ts`、`src/core/personnelCommands.test.ts`、`src/core/tacticalBattle.test.ts`、浏览器道具回归 |
| `src/core/battle.ts`、`src/core/captiveCommands.ts` 俘虏路径 | `citycmdd.c:FightResultDeal/TheLoserDeal/HoldCaptive/LostEscape/KingOverDeal`、`citycmdb.c:SurrenderMake`、`citycmd.c:SurrenderDrv` | 依据状态转换、概率边界与主要数值分支重写确定性捕获和招降；未复制原控制流或界面。有序撤退与战后随机序列、释放、无战死和有退路君主必逃为明确 Alpha 差异 | `src/core/battle.test.ts`、`src/core/captiveCommands.test.ts`、`references/captive-command-notes.md` |
| `src/compat/baye/tacticalGrowth.ts`、`src/compat/baye/tacticalState.ts`、`src/core/tacticalBattle.ts` 天气/状态/成长路径 | `fight.h`、`Fight.c:FgtDealBout/FgtChkAtkEnd/FgtDrvState`、`FightSub.c:FgtGetExp/FgtChgWeather/FgtJNAction`、`FgtCount.c:CountSklHurt/CountBaseAttr`、`tactic.c:LevelUp` | 重写天气、八状态、技能点字段关系、平方根经验与升级阈值；十项计谋、移动/范围表和部分状态效果为明确现代产品规则，未复制资源或原界面 | `src/compat/baye/tacticalGrowth.test.ts`、`src/compat/baye/tacticalState.test.ts`、`src/core/tacticalBattle.test.ts`、`references/tactical-skills-growth-notes.md` |
| `src/core/reconnaissance.ts` 侦察路径 | `citycmdc.c:ReconnoitreMake`、`citycmd.c:ReconnoitreDrv`、`citycmde.c:IsMoney/IsManual/OrderConsumeMoney/OrderConsumeThew`、`baye/order.h`；本地 `pconst.c` 标量 | 依据目标限制、即时查看和命令回队重新设计 Web 情报快照；经典成本校准为 10 体力、20 金，现代身份保留旧值。持久化快照仍为现代差异 | `src/core/reconnaissance.test.ts`、`references/reconnaissance-notes.md`、`references/original-rules-calibration-notes.md` |
| `src/core/strategicOrders.ts` 道路调动与输送 | `baye/order.h:OrderType`、`citycmdc.c:MoveMake/TransportationMake`、`citycmdd.c:AddOrderHead`、`citycmd.c:PolicyExec/MoveDrv/TransportationDrv`、`tactic.c` 月度阶段；本地 `pconst.c` 标量 | 依据命令字段与离城/返回重写在途层；经典成本为调动 0、输送 8 体力。排序 BFS、每段 1 月和目标易主安全退回仍是明确现代修复 | `src/core/strategicOrders.test.ts`、`src/core/personnelCommands.test.ts`、`references/original-rules-calibration-notes.md` |
| `src/core/cityCommands.ts` 招商、治理与出巡 | `baye/order.h`、`citycmdb.c:AccractbusinessMake/FatherMake/InspectionMake`、`citycmd.c:FatherDrv/InspectionDrv`；本地 `pconst.c` 标量 | 依据智力增量、防灾/民忠随机区间、人口/属性上限及治理恢复正常状态重写；经典身份使用运行时命令成本，现代身份保留历史成本 | `src/core/cityCommands.test.ts`、`src/core/ai.test.ts`、`src/core/rulesets.test.ts`、`references/city-command-notes.md` |
| `src/core/cityCommands.ts` 交易、宴请与掠夺 | `baye/order.h`、`citycmdc.c:ExchangeMake/TreatMake`、`citycmde.c:DepredateMake`、`citycmd.c:ExchangeDrv/DepredateDrv` | 依据交换比率、恢复量、忠诚与体力上限、三项折半及有效智武收益重写即时命令；未复制菜单或控制流。30,000 软上限保护、无收益拒绝、掠夺二次确认、AI 仅交易，以及运行时成本均为明确现代安全或临时规则 | `src/core/cityCommands.test.ts`、`src/core/ai.test.ts`、`src/core/monthSummary.test.ts`、浏览器命令卡回归 |
| `src/core/cityEvents.ts`、`src/core/economy.ts`、`src/core/annualProgression.ts` 城市与年度结算 | `infdeal.c:CitiesUpDataDate/RandEvents/EventStateDeal/PersonUpDatadate/GoodsUpDatadate`、`tactic.c:ConditionUpdate`、`baye/attribute.h` | 依据月度调用顺序、季度防灾衰减、状态枚举、驻军/城市损失、随机比较方向、年度年龄及严格相等的登场判断重写；未复制报告界面。原设备资源按已验证 3 字节条件 ABI 解析，不复制移植版宽化后的错误索引；在途供养和日志可见性为现代规则 | `src/core/annualProgression.test.ts`、`src/core/cityEvents.test.ts`、`src/core/economy.test.ts`、`src/core/turn.test.ts`、`references/city-event-notes.md` |
| `src/compat/baye/diplomacy.ts`、`src/core/diplomaticOrders.ts` 外交谋略 | `citycmd.c:AlienateDrv/CanvassDrv/CounterespiongeDrv/InduceDrv`、`citycmdc.c:*Make`、`tactic.c:ComputerTacticDiplomatism`、`baye/order.h`、`baye/attribute.h`；本地 `pconst.c` 标量 | 重写四类判定、整数宽度、性格阈值和主要归属结果；经典身份按命令分别使用 20/50 或 10/50 成本。一月耗时、名单锁定与安全闭包仍是现代规则 | `src/compat/baye/diplomacy.test.ts`、`src/core/diplomaticOrders.test.ts`、`references/diplomacy-notes.md` |
| `src/compat/baye/officerLifecycle.ts`、`src/core/officerLifecycle.ts`、`src/core/battle.ts` 人物生命周期 | `citycmdb.c:KillMake/BanishMake`、`citycmde.c:ConfiscateMake`、`citycmdd.c:TheLoserDeal/LostEscape/HoldCaptive/KingOverDeal/KingDeadNote`、`infdeal.c:PersonUpDatadate`、`baye/attribute.h:EngineConfig` | 重写处斩对话随机调用、流放城市随机、没收忠诚、战败捕获/逃脱/极低概率死亡和君主继承分支；未复制对话、菜单或控制流。版本化安全默认、年龄 90 岁可选死亡、现代月度逃脱、事务化命令清理和可保存玩家继承点为明确现代规则 | `src/compat/baye/officerLifecycle.test.ts`、`src/core/officerLifecycle.test.ts`、`src/core/battle.test.ts`、`references/officer-lifecycle-notes.md` |
| `src/data/itemCatalog.ts` 的 33 项内容 | 仓库初始化时已有的 `data/source/tool-catalog.csv`，固定上游资源、解析器版本和内容哈希尚未重关联 | 为形成可玩闭环而沿用的临时结构化数据；不据此声明原版内容一致，也没有从本地 `.lib`、GPL 包或未授权文档复制新增记录 | `src/data/itemCatalog.test.ts` 只验证内部完整性；重新关联前不得提升证据等级 |
| `src/core/tacticalBattle.ts`、`src/core/battleRecovery.ts` | `citycmdd.c:g_FgtParam/FightResultDeal`；`Fight.c`；`FightSub.c`；`FgtCount.c`；`FgtPkAi.c:FgtGetCmdRng/FgtGetSklBuf`；本地哈希固定形状证据 | 依据阶段、状态、主将、全军撤退、三类普通攻击语义与道具覆盖顺序重写确定性 Web 战术核心；未导入原版地图与资源。七张程序化结构地图、十项计谋、AI 评分、刷新重开与占城阶段确认仍为现代设计 | `src/core/tacticalBattle.test.ts`、`src/core/battleRecovery.test.ts`、`references/original-rules-calibration-notes.md` |
| `tools/reference/baye-battle-oracle.c` | 同上 | 参考专用最小 C oracle，保留原常量与运算顺序，不进入产品包 | GCC 生成固定 JSON 后与 TypeScript 差异测试 |

上述上游 C 核心标记为 MIT；离线 GPL JavaScript/WASM 只在用户本地执行以产生数值样本，没有复制进仓库或产品构建。`references/vendor/baye-c-core/MANIFEST.json` 绑定锁定提交并校验逐文件内容；早期本地 ZIP 快照仍由 `source-manifest.json` 与夹具内 SHA-256 约束。

本文件用于工程风险控制，不替代正式法律意见。
