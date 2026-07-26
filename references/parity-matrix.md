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
| 开局兵力 | 时期人物记录兵力字段为 0；原版另有初始化流程待定位 | `data/legacyScenario.ts:DEFAULT_STARTING_TROOPS`，所有在职势力对称初始为 400 | 临时实现 | 定位原版选君主后的兵力/粮草初始化；不再使用玩家 100、AI 800 的人为不对称 |
| 城池、人物与道具结构 | `dictsys.h`、`attribute.h`、`bind-objects.c`、时期结构夹具 | `types.ts`；`core/equipment.ts`；`data/itemCatalog.ts`；`data/legacyScenario.ts`；`data-structure-map.md` | 已取样 | 城池隐藏/发现队列、两个有序通用装备位和初始装备已接入；33 项道具内容仍来自早期整理表，固定上游与内容哈希重新关联前按临时数据处理 |
| 城池命令 | `citycmd*.c` | `cityCommands.ts`（开垦、招商、治理、出巡、交易、宴请、掠夺、征兵、分配）；`personnelCommands.ts`（搜寻、登用、赏金、道具赏赐/卸装、道路调动、任命）；`strategicOrders.ts`（schema 4 调动/输送在途命令）；`reconnaissance.ts`（侦察快照）；`captiveCommands.ts`（招降、释放） | 临时实现 | 招商/治理/出巡保留固定增量形状与上限；交易保留 5 金买 1 粮、1 粮卖 2 金；宴请保留恢复 50 体力与非君主忠诚 +1；掠夺保留三项折半及有效智武收益。30,000 软上限、无收益拒绝、交易/掠夺 4 体力、宴请 50 金均为现代安全或临时规则。调动/输送为可保存跨月道路命令；排序 BFS、每段 1 月及易主闭包均为现代规则 |
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
| 战术移动与范围 | `FgtCount.c:CountMoveP/FgtTransMove`、`FightSub.c:FgtGetTerrain`、`.lib:dFgtLandR/dFgtAtRange` | `compat/baye/tacticalState.ts`；`core/tacticalBattle.ts`（最短路径、控制区、友军穿越） | 临时实现 | 六兵种×八地形移动表与攻击范围为现代替代数据；原资源只保留非内容证据，取得可再分发许可前不逐格入库 |
| 战场部署与目标 | `citycmdd.c:g_FgtParam`、`Fight.c:FgtDealMan/FgtDealCmp` | 按战略城市方位布阵、六张现代结构化战场、占城后结束攻方阶段判胜 | 有意变化 | 原版在进攻单位进入城格后立即判胜；Web 版增加一次阶段确认，并等待可再分发的战场编号/部署证据 |
| 战术状态与反馈 | `Fight.c:FgtChkEnd`、`FightSub.c` 战斗日与地形接口 | `core/tacticalBattle.ts`（攻击、计谋、天气、八状态、粮草、主将、天数与胜因）；`ui/TacticalBattleScreen.tsx` | 部分对齐 | 主将败退、全灭、断粮、超时和占城均有明确结果；攻守双方对称主将与详细预览是现代呈现 |
| 战斗 AI | `FgtPkAi.c:FgtGetMCmd/FgtCmpMove/FgtAtkCmd` | `core/tacticalBattle.ts:runBasicTacticalAi`（移动、攻击、治疗、状态、粮草、主将和目标评分） | 临时实现 | 保持确定性并共享玩家规则；后续以固定战场逐决策轨迹替换现代评分权重 |
| 战略 AI | `gamEng.c`、`tactic.c:ComputerTacticDiplomatism`、城市命令流程 | `ai.ts`（兵力均衡、征兵、开垦、搜寻、谋略、俘虏处置、边境支援、出征） | 临时实现 | 进攻型 AI 可处斩高忠诚且当月无法招降的俘虏，AI 君主按稳定候选排序继承；其经营优先级仍为现代确定性启发式 |
| 存档格式与战斗恢复 | `fsys.c`、数据管理代码 | `saveGame.ts`、`saveStorage.ts`、`battleRecovery.ts`（schema 5 战役状态、v2 战前/已提交恢复日志） | 有意变化 | 战中局面不序列化；刷新后确定性重开该战斗，结果以身份、战略指纹和两阶段提交防止重复或陈旧回写 |
| 随机数（Web 移植） | `comIn.c:rand_r`、WASM `bayeRand` | `compat/baye/rng.ts` | 差异验证 | 从锁定提交重生成 WASM 样本 |
| 随机数（BBK 设备） | `fsys.h:SysRand` | 无 | 已定位 | 非阻塞考据；取得可信实现或设备序列后再新增参考模式 |
| 经典 LCD 表现 | `gamEng.c`、`exportjs.c`、LCD 缓冲 | React 开局流程与面板；Phaser 战略地图 | 有意变化 | 采集城市命令界面，约束下一阶段操作顺序 |

当前 `cityCommands.ts`、`battle.ts`、`economy.ts`、`ai.ts` 和 `core/random.ts` 共同提供可玩产品闭环，但仍包含现代临时规则，不代表原版规则已经还原。征兵已改为进入城池后备兵，并通过独立“分配”调整武将兵力；分配会消耗武将月行动，单次增兵上限与开局 AI 出征阈值是为了战役节奏加入的现代临时规则。手动战场已接入兼容层的普通攻防、伤害公式、原版基础移动力、五天气和八状态语义，并提供方向部署、六张现代结构化战场、路径/伤害/计谋预览、十项现代计谋、控制区、主将、粮草/天数胜负、经验成长和确定性评分 AI。地图、地形移动/攻防修正、攻击范围、计谋目录和 AI 权重仍是可替换的现代临时规则；单挑与原版地图尚未接入。

当前所有新增差异证据来自文件哈希吻合但无 `.git` 元数据的本地快照。具体限制见 `source-manifest.json` 和 `fixtures/README.md`。

随机序列、确定性规则和现代呈现的边界见 `docs/design/compatibility-policy.md`。项目不要求未知 BBK `SysRand` 的逐次序列一致，但仍要求保留随机调用位置、取值范围和概率边界。
