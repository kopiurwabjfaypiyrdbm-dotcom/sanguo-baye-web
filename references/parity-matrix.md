# 原版一致性矩阵

状态定义：

- `未开始`：尚未定位原版行为。
- `已定位`：已找到源码入口，但没有测试。
- `临时实现`：已有现代原型，但没有原版兼容证据。
- `已取样`：已有可追溯的原版/移植版输出，尚未完成实现差异验证。
- `差异验证`：实现已通过独立参考输出或编译 C oracle 的固定输入验证。
- `有意变化`：为了现代化体验明确改变，并已记录原因。

| 模块 | 上游事实源 | 当前实现 | 状态 | 下一验证 |
|---|---|---|---|---|
| 游戏主循环 | `gamEng.c`、`GamBaYeEng` | `turn.ts` | 临时实现 | 记录一个完整原版月份的阶段顺序 |
| 剧本加载 | `tactic.c:LoadPeriod`、`.lib` | `compat/baye/legacyScenario.ts`；`data/legacyScenario.ts`；`generated/baye-periods.json` schema 2 | 差异验证 | 已处理原版名字表自定义字形（含李傕）并接入 69 条稀疏未来人物条件；城市队列优先后形成 51 条实际隐藏日程，四时期没有未来道具日程。继续核对时期 2–4 的外围初始差异 |
| 开局兵力与规则身份 | `tactic.c:LoadPeriod` | `core/rulesets.ts`；`data/legacyScenario.ts`；schema 6 存档 | 已定位 | `baye-classic-v1` 采用全员体力/兵力 100；旧存档迁移为保留 400 兵力时代行为的 `modern-balanced-v1`。继续核对城池资源外围初始化 |
| 城池、人物与道具结构 | `dictsys.h`、`attribute.h`、`bind-objects.c`、时期结构夹具 | `types.ts`；`core/equipment.ts`；`data/itemCatalog.ts`；`data/legacyScenario.ts`；`data-structure-map.md` | 已取样 | 城池隐藏/发现队列、两个有序通用装备位和初始装备已接入；33 项道具内容仍来自早期整理表，固定上游与内容哈希重新关联前按临时数据处理 |
| 城池命令 | `citycmd*.c`；本地哈希固定 `pconst.c:ConsumeThew/ConsumeMoney` | `core/rulesets.ts`；各命令核心、AI 与 `CityPanel.tsx` | 已取样 | 经典身份已统一采用运行时成本；现代身份保留旧值。命令效果、道路耗时、30,000 软上限和多项安全拒绝仍是现代规则 |
| Godot 开垦跨客户端对照 | TypeScript `core/cityCommands.ts:developFarming`、`core/random.ts:nextRandom` | `scripts/generate-godot-spike-data.ts`；`godot/src/domain/commands/develop_farming_command.gd`；`godot/data/fixtures/develop-farming-v1.json` | 差异验证 | seed 48641 → 373686124、农业 +63、金钱 -50、体力 -8 与完整日志 receipt 已逐字段一致；这里只证明 Godot 与当前 Web oracle 一致，不提升城池命令的原版设备一致性状态 |
| Godot 确定性迁移回放协议 | TypeScript `core/cityCommands.ts:developFarming`、时期 1 JSON oracle | `core/migration/canonicalJson.ts`；`core/migration/replayFixture.ts`；`godot/src/domain/validation/canonical_json.gd`；`migration-replay-suite-v1.json` | 差异验证 | `canonical-json-v1`、`safe-integer-or-decimal-6-v1` 与 SHA-256 已由 TS/Godot 4.7.1 对 7 个编码向量及 2 个回放/4 个步骤逐项对照；曹操、夏侯惇连续开垦后 seed 为 860746715，非法城池命令保持 seed 和最终摘要不变。该证据只证明已命名 Web oracle 的跨客户端确定性，新增命令需显式适配并生成新 fixture |
| Godot 四时期生产数据契约 | Web `data/bundledScenarios.ts:createBundledScenario/getScenarioRulers`、`generated/baye-periods.json` schema 2 | `core/migration/productionDataContract.ts`；`godot/data/campaigns/`；`ProductionDataRepository/Validator` | 差异验证 | 四时期均由同一 Web oracle 受控生成，TS/Godot 对 38 城、54 路、玩家候选、实体关系、seed 与 canonical state 摘要逐时期一致；Godot 4.7.1 能独立构造 4 个纯 `GameState`。此证据不提升 bundled scenario 相对原设备的既有等级，也不代表四时期规则已可玩 |
| Godot 生产应用会话事务 | Web `data/legacyScenario.ts:selectPlayerFaction`、`core/cityCommands.ts:developFarming` | `core/migration/applicationSessionContract.ts`；Godot `GameSession/CommandDispatcher/GameSessionQueries`；`application-session-suite-v1.json` | 差异验证 | 四时期 50 个合法君主候选启动均不消耗 seed；时期 1 曹操的成功、完全重复、陈旧摘要、领域拒绝、ID 冲突、未知命令、未知版本、缺失/错误参数、字段错误顺序、NBSP 空白拒绝、第二笔成功及跨状态重试共 13 路 result/state canonical 输出与 TypeScript oracle 一致。这里只固定客户端事务语义，不提升开垦相对原设备的证据等级 |
| Godot 原生内政命令组 | Web `core/cityCommands.ts`、`core/rulesets.ts`、`ui/cityCommandCatalog.ts` | Godot `internal_affairs_commands.gd`、统一 adapter/query、原生城池卡片；`application-session-suite-v1.json` MB05 序列 | 差异验证 | 开垦、招商、治理、出巡、交易、宴请、掠夺的成功/拒绝、seed、成本、行动、日志和 canonical state 已按 12 路紧凑序列及 modern-balanced 治理成本与 TypeScript oracle 对照；当前证据只证明跨客户端产品语义一致，原版设备一致性继续沿用“城池命令”行的已取样等级 |
| Godot 原生人物任命与装备管理 | Web `core/personnelCommands.ts`、`core/equipment.ts`、`core/rulesets.ts` | Godot `officer_management_commands.gd`、统一 adapter/query、原生人物面板；`application-session-suite-v1.json` MB06 序列 | 差异验证 | 奖赏、经典/现代太守任命、两个有序装备位、卸装、有效属性门槛及铁骑/太玄/水战兵符已按 6 路连续序列和 11 路边界与 TypeScript oracle 的 result/state SHA 对照；这里只固定当前产品语义，人物/道具结构的原版证据等级和 33 项 provisional 道具内容不提升 |
| Godot 人才登用与俘虏处置 | Web `core/personnelCommands.ts`、`core/captiveCommands.ts`、`core/officerLifecycle.ts`、`compat/baye/officerLifecycle.ts`、`core/rulesets.ts` | Godot `personnel_lifecycle_commands.gd`、统一 adapter/query、原生人才与俘虏面板；`application-session-suite-v1.json` MB07 序列 | 差异验证 | 搜寻、已发现人才登用、俘虏招降/释放/处斩、在职与俘虏流放、装备没收已按共享矩阵扩展至 83 路事务、723 项 Godot 断言；精确 seed、条件式 RNG、classic/modern 成本、身份/发现集合、装备回收、稳定 38 城目的地及 state SHA 与 TypeScript oracle 一致。这里只固定当前产品语义，原设备默认生命周期策略仍沿用“人物生命周期、俘虏与继承”行的已取样等级 |
| 月度结算与城市事件 | `tactic.c:ConditionUpdate`、`infdeal.c:CitiesUpDataDate/EventStateDeal/RandEvents/PersonUpDatadate/GoodsUpDatadate` | `economy.ts`、`cityEvents.ts`、`annualProgression.ts` | 已取样 | 已接入季度防灾衰减、军粮前驻军损失、四类状态、固定比较方向、年度全员年龄和严格相等的人物登场；四时期无未来道具日程，合成状态覆盖道具年度入库。移植版扩大 `SearchCondition` 后的异常索引不作为原设备 ABI |
| 战场进入 | `citycmdd.c`、`Fight.c`、`g_FgtParam`、`fight.h:FIGHT_ORDER_MAX` | `core/tacticalBattle.ts:createTacticalBattle`；`ui/App.tsx` | 临时实现 | 已按固定参考限制每方最多 10 人，并按战略方向部署到六张现代代码战场；继续对照原版战场编号与部署位置 |
| 人物生命周期、俘虏与继承 | `citycmdb.c:KillMake/BanishMake`；`citycmde.c:ConfiscateMake`；`citycmdd.c:FightResultDeal/BeOccupied/TheLoserDeal/HoldCaptive/LostEscape/KingOverDeal`；`infdeal.c:PersonUpDatadate` | `compat/baye/officerLifecycle.ts`；`core/officerLifecycle.ts`；`core/battle.ts`；`core/captiveCommands.ts`；`ui/CityPanel.tsx`；`ui/App.tsx` | 已取样 | 已接入处斩/流放/没收、按战斗队列抽数的战败结果、城陷留守君主捕获、装备唯一回收、玩家可恢复继承点、有效智力 AI 继承及无继承瓦解；安全默认关闭战死、自然死亡和月度逃脱。年龄 90 岁死亡来自注释块、月度逃脱概率为现代可选规则；继续获取设备/发行配置默认值 |
| 外交谋略 | `citycmd.c:AlienateDrv/CanvassDrv/CounterespiongeDrv/InduceDrv`；`citycmdc.c:*Make`；`tactic.c:ComputerTacticDiplomatism`；`attribute.h` | `compat/baye/diplomacy.ts`；`core/diplomaticOrders.ts`；`ui/CityPanel.tsx` | 已定位 | 已接入离间、招揽、策反和劝降的固定比较顺序、整数宽度、性格阈值、隐藏对话随机调用与主要归属结果；一月耗时、4 体力、50 金、情报锁定和失效/失地闭包为现代规则。反间、朝贡、联盟与婚姻不在范围 |
| 攻防属性 | `FgtCount.c:BuiltAtkAttr`、`.lib:dFgtLandF` | `compat/baye/tacticalBattle.ts`；`core/tacticalBattle.ts:attackTacticalUnit` | 差异验证 | 属性公式已有 C oracle；原资源修正表只留偏移/长度/哈希证据，产品使用明确命名的现代替代表 |
| 普通攻击伤害 | `FgtCount.c:CountAtkHurt` | `compat/baye/tacticalBattle.ts`；`core/tacticalBattle.ts:attackTacticalUnit` | 差异验证 | 兼容公式继续使用原版 U16 攻击兵力输入，战术会话保留现代战略层完整兵力以避免截断写回；继续复核原版兵力上限和战后经验值 |
| 战术计谋目录 | `FightSub.c:FgtJNAction`；`FgtCount.c:CountSklHurt/CountBaseAttr`；未入库资源表 | `core/tacticalBattle.ts:TACTICAL_SKILLS`；`ui/TacticalBattleScreen.tsx` | 临时实现 | 十项现代数据驱动计谋已覆盖伤兵、补兵、状态和劫粮；名称、消耗、范围、倍率与学习条件均不声明原版一致 |
| 天气与战术状态 | `fight.h`；`Fight.c:FgtDealBout/FgtDrvState`；`FightSub.c:FgtJNAction/FgtChgWeather` | `compat/baye/tacticalState.ts`；`core/tacticalBattle.ts` | 部分对齐 | 五天气与八状态已接入；跳过、禁咒、定身、奇门、石阵八分之一损兵和恢复极性有源码依据，遁甲减伤、潜踪选取与状态来源仍为现代规则 |
| 战后经验与等级 | `FightSub.c:FgtGetExp`；`Fight.c:FgtChkAtkEnd`；`tactic.c:LevelUp` | `compat/baye/tacticalGrowth.ts`；`core/tacticalBattle.ts`；`core/battle.ts` | 有意变化 | 平方根经验、100 经验升级和 20 级上限已接入；Web 战后原子升级，快速战按总损失抽象分配 |
| 兵种克制 | `FgtCount.c:SubduModu`、文档默认钩子 | `BAYE_SUBDUE_MATRIX` | 差异验证 | 锁定提交检出后重生成 C oracle |
| 战略自动战斗 | `FgtCount.c:FgtCountWon` | `resolveBayeStrategicBattle` | 差异验证 | 明确双方零兵力时依赖的外围状态 |
| 战术移动力 | `fight.h:MOV_*`、`FgtCount.c:FgtIntMove/CountMoveP` | `compat/baye/tacticalBattle.ts:BAYE_BASE_MOBILITY`；`core/equipment.ts`；四时期兵种数据 | 已定位 | 加入外部参考夹具逐项验证装备移动加成和 8 点上限 |
| 战术移动与范围 | `FgtCount.c:CountMoveP/FgtTransMove`、`FgtPkAi.c:FgtGetCmdRng`；本地哈希固定 `dFgtAtRange` 形状 | `compat/baye/tacticalState.ts`；`core/tacticalBattle.ts` | 已取样 | 普攻已恢复四向近战、八向近战与距二环射击三类语义；地形移动表仍是现代替代。道具覆盖机制已接入，但逐道具掩码尚未合法固定 |
| 战场部署与目标 | `citycmdd.c:g_FgtParam`、`Fight.c:FgtDealMan/FgtDealCmp` | 按战略城市方位布阵、六张现代结构化战场、占城后结束攻方阶段判胜 | 有意变化 | 原版在进攻单位进入城格后立即判胜；Web 版增加一次阶段确认，并等待可再分发的战场编号/部署证据 |
| 战术状态与反馈 | `Fight.c:FgtChkEnd`、`FightSub.c` 战斗日、地形与全军撤退接口 | `core/tacticalBattle.ts`；`ui/TacticalBattleScreen.tsx` | 部分对齐 | 主将败退、全灭、断粮、超时、占城和攻守双方全军撤退均有明确结果；详细预览与两步撤退确认是现代呈现 |
| 战斗 AI | `FgtPkAi.c:FgtGetMCmd/FgtCmpMove/FgtAtkCmd` | `core/tacticalBattle.ts:runBasicTacticalAi`（移动、攻击、治疗、状态、粮草、主将和目标评分） | 临时实现 | 保持确定性并共享玩家规则；后续以固定战场逐决策轨迹替换现代评分权重 |
| 战略 AI | `gamEng.c`、`tactic.c:ComputerTacticDiplomatism`、城市命令流程 | `ai.ts`（兵力均衡、征兵、开垦、搜寻、谋略、俘虏处置、边境支援、出征） | 临时实现 | 进攻型 AI 可处斩高忠诚且当月无法招降的俘虏，AI 君主按稳定候选排序继承；其经营优先级仍为现代确定性启发式 |
| 存档格式与战斗恢复 | `fsys.c`、数据管理代码 | `saveGame.ts`、`saveStorage.ts`、`battleRecovery.ts`（schema 6 战役状态、v2 战前/已提交恢复日志） | 有意变化 | schema 6 保存规则身份，schema 1–5 明确迁移为现代平衡；战中刷新仍确定性重开并以两阶段提交防止重复回写 |
| 随机数（Web 移植） | `comIn.c:rand_r`、WASM `bayeRand` | `compat/baye/rng.ts` | 差异验证 | 从锁定提交重生成 WASM 样本 |
| 随机数（BBK 设备） | `fsys.h:SysRand` | 无 | 已定位 | 非阻塞考据；取得可信实现或设备序列后再新增参考模式 |
| 经典 LCD 表现 | `gamEng.c`、`exportjs.c`、LCD 缓冲 | React 开局流程与面板；Phaser 战略地图 | 有意变化 | 采集城市命令界面，约束下一阶段操作顺序 |

当前 `cityCommands.ts`、`battle.ts`、`economy.ts`、`ai.ts` 和 `core/random.ts` 共同提供可玩产品闭环，但仍包含现代临时规则，不代表原版规则已经全部还原。规则身份已经把经典校准值与旧档现代值分开；征兵后备兵、分配月行动、单次增兵上限与开局 AI 出征阈值仍是现代节奏规则。手动战场已接入普通攻防、伤害公式、基础移动力、三类普攻形状、五天气、八状态和全军撤退，并提供方向部署、七张现代结构化战场、十项现代计谋、控制区、主将、粮草/天数胜负、经验成长和确定性评分 AI。逐城地图、地形移动/攻防修正、计谋目录和 AI 权重仍是可替换现代规则；单挑与原版地图尚未接入。

当前所有新增差异证据来自文件哈希吻合但无 `.git` 元数据的本地快照。具体限制见 `source-manifest.json` 和 `fixtures/README.md`。

随机序列、确定性规则和现代呈现的边界见 `docs/design/compatibility-policy.md`。项目不要求未知 BBK `SysRand` 的逐次序列一致，但仍要求保留随机调用位置、取值范围和概率边界。
