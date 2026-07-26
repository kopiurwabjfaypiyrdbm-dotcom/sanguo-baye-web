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
| `src/compat/baye/tacticalBattle.ts` | `FgtCount.c:BuiltAtkAttr/CountAtkHurt/FgtCountWon`、`tactic.c:GetArmType` | 重写常量、C 数值顺序和分支；不链接上游代码 | `fixtures/battle-c-oracle.json` |
| `src/data/legacyScenario.ts:DEFAULT_STARTING_TROOPS` | 四时期人物记录中的初始兵力为 0；原版外围初始化尚未定位 | 现代临时产品规则：所有在职势力对称设为 400，替代旧的玩家 100/AI 800 不对称 | `src/data/legacyScenario.test.ts`、`src/data/bundledScenarios.test.ts` |
| `src/data/legacyScenario.ts:buildCityFactionAssignments` | 时期 2 等少量已入城队列人物仍保留另一当前君主索引；城池队列与城池君主共同给出可验证的当前驻扎关系 | 解析桥接规则：仅对具备有效当前君主标记的已分配人物，以所在城池当前归属规范化势力；无君主或非当前君主记录仍保持在野 | `src/data/legacyScenario.test.ts`、四时期 `src/data/bundledScenarios.test.ts` |
| `src/core/equipment.ts`、`src/core/personnelCommands.ts` 道具规则路径 | `attribute.h:GOODS/PersonType/CityType`、`citycmd.c:SearchDrv`、`citycmdb.c:LargessMake`、`infdeal.c:AddGoodsPerson/DelGoodsPerson/GetCityPGoods/GetCityDispGoods`、`FgtCount.c:CountMoveP` | 依据字段和分支语义重写隐藏/发现库存、搜寻、赏赐、两个有序装备位、有效属性、兵符门槛与移动加成；未复制界面和控制流。并列赏金为明确现代差异 | `src/data/legacyScenario.test.ts`、`src/core/personnelCommands.test.ts`、`src/core/tacticalBattle.test.ts`、浏览器道具回归 |
| `src/core/battle.ts`、`src/core/captiveCommands.ts` 俘虏路径 | `citycmdd.c:FightResultDeal/TheLoserDeal/HoldCaptive/LostEscape/KingOverDeal`、`citycmdb.c:SurrenderMake`、`citycmd.c:SurrenderDrv` | 依据状态转换、概率边界与主要数值分支重写确定性捕获和招降；未复制原控制流或界面。有序撤退与战后随机序列、释放、无战死和有退路君主必逃为明确 Alpha 差异 | `src/core/battle.test.ts`、`src/core/captiveCommands.test.ts`、`references/captive-command-notes.md` |
| `src/compat/baye/tacticalGrowth.ts`、`src/core/tacticalBattle.ts` 天气/状态/成长路径 | `fight.h`、`Fight.c:FgtDealBout/FgtChkAtkEnd`、`FightSub.c:FgtGetExp/FgtChgWeather/FgtJNAction`、`FgtCount.c:CountSklHurt/CountBaseAttr`、`tactic.c:LevelUp` | 重写天气枚举、技能点字段关系、平方根经验与升级阈值；计谋目录和数值为明确临时产品规则，未复制资源或原界面 | `src/compat/baye/tacticalGrowth.test.ts`、`src/core/tacticalBattle.test.ts`、`references/tactical-skills-growth-notes.md` |
| `src/core/reconnaissance.ts` 侦察路径 | `citycmdc.c:ReconnoitreMake`、`citycmd.c:ReconnoitreDrv`、`citycmde.c:IsMoney/IsManual/OrderConsumeMoney/OrderConsumeThew`、`baye/order.h` | 依据目标限制、即时查看和命令回队重新设计 Web 情报快照；未复制界面或控制流。`order.h` 声明 4 体力，但运行时体力/金钱资源表均不在许可 allowlist，因此 4 体力、50 金与持久化快照明确标为现代临时规则 | `src/core/reconnaissance.test.ts`、`references/reconnaissance-notes.md`、浏览器侦察回归 |
| `src/core/strategicOrders.ts` 道路调动与输送 | `baye/order.h:OrderType`、`citycmdc.c:MoveMake/TransportationMake`、`citycmdd.c:AddOrderHead`、`citycmd.c:PolicyExec/MoveDrv/TransportationDrv`、`tactic.c` 月度阶段 | 依据命令字段、离城/返回与 `rand%100 > 20` 输送分界重写 schema 4 在途层；未复制控制流。固定 C 数组队列同月执行并忽略 `TimeCount`，旧递减分支已注释，且 `SearchRoad` 函数体不在 allowlist；因此排序 BFS、每段 1 月、4 体力和目标易主安全退回是明确的现代修复/临时规则 | `src/core/strategicOrders.test.ts`、`src/core/personnelCommands.test.ts`、中途存档与资源守恒测试 |
| `src/core/cityCommands.ts` 招商、治理与出巡 | `baye/order.h`、`citycmdb.c:AccractbusinessMake/FatherMake/InspectionMake`、`citycmd.c:FatherDrv/InspectionDrv` | 依据智力增量、防灾/民忠随机区间和人口/属性上限重写即时城市命令；未复制菜单或控制流。运行时成本表和灾害状态尚未接入，因此成本与治理只提升防灾均为明确临时规则 | `src/core/cityCommands.test.ts`、`src/core/ai.test.ts`、`references/city-command-notes.md` |
| `src/core/cityCommands.ts` 交易、宴请与掠夺 | `baye/order.h`、`citycmdc.c:ExchangeMake/TreatMake`、`citycmde.c:DepredateMake`、`citycmd.c:ExchangeDrv/DepredateDrv` | 依据交换比率、恢复量、忠诚与体力上限、三项折半及有效智武收益重写即时命令；未复制菜单或控制流。30,000 软上限保护、无收益拒绝、掠夺二次确认、AI 仅交易，以及运行时成本均为明确现代安全或临时规则 | `src/core/cityCommands.test.ts`、`src/core/ai.test.ts`、`src/core/monthSummary.test.ts`、浏览器命令卡回归 |
| `src/data/itemCatalog.ts` 的 33 项内容 | 仓库初始化时已有的 `data/source/tool-catalog.csv`，固定上游资源、解析器版本和内容哈希尚未重关联 | 为形成可玩闭环而沿用的临时结构化数据；不据此声明原版内容一致，也没有从本地 `.lib`、GPL 包或未授权文档复制新增记录 | `src/data/itemCatalog.test.ts` 只验证内部完整性；重新关联前不得提升证据等级 |
| `src/core/tacticalBattle.ts` | `citycmdd.c` 的 `g_FgtParam` 组装与 `FightResultDeal`；`Fight.c:GamFight/FgtDealMan/FgtDealCmp/FgtDealBout/FgtChkEnd`；`FightSub.c:FgtGetTerrain/FgtAtkAction`；`FgtCount.c:FgtIntMove/CountMoveP`；`FgtPkAi.c:FgtGetMCmd/FgtCmpMove/FgtAtkCmd` | 依据阶段、基础移动力与状态语义重新设计确定性 Web 战术核心；未复制控制流或表现代码，未导入原版地图与资源。原版进入城格立即判胜，本项目有意改为结束攻方阶段后确认 | `src/core/tacticalBattle.test.ts` 与浏览器手动战斗回归 |
| `tools/reference/baye-battle-oracle.c` | 同上 | 参考专用最小 C oracle，保留原常量与运算顺序，不进入产品包 | GCC 生成固定 JSON 后与 TypeScript 差异测试 |

上述上游 C 核心标记为 MIT；离线 GPL JavaScript/WASM 只在用户本地执行以产生数值样本，没有复制进仓库或产品构建。`references/vendor/baye-c-core/MANIFEST.json` 绑定锁定提交并校验逐文件内容；早期本地 ZIP 快照仍由 `source-manifest.json` 与夹具内 SHA-256 约束。

本文件用于工程风险控制，不替代正式法律意见。
