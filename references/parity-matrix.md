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
| 剧本加载 | `tactic.c:LoadPeriod`、`.lib` | `compat/baye/legacyScenario.ts`；`data/legacyScenario.ts`；`generated/baye-periods.json` | 差异验证 | 已处理原版名字表自定义字形（含李傕）；接入未出仕人物出现条件，并继续核对时期 2–4 的初始差异 |
| 开局兵力 | 时期人物记录兵力字段为 0；原版另有初始化流程待定位 | `data/legacyScenario.ts:DEFAULT_STARTING_TROOPS`，所有在职势力对称初始为 400 | 临时实现 | 定位原版选君主后的兵力/粮草初始化；不再使用玩家 100、AI 800 的人为不对称 |
| 城池、人物与道具结构 | `dictsys.h`、`attribute.h`、`bind-objects.c`、时期结构夹具 | `types.ts`；`core/equipment.ts`；`data/itemCatalog.ts`；`data/legacyScenario.ts`；`data-structure-map.md` | 已取样 | 城池隐藏/发现队列、两个有序通用装备位和初始装备已接入；33 项道具内容仍来自早期整理表，固定上游与内容哈希重新关联前按临时数据处理 |
| 城池命令 | `citycmd*.c` | `cityCommands.ts`（开垦、征兵、分配）；`personnelCommands.ts`（搜寻、登用、赏金、道具赏赐/卸装、道路调动、任命）；`strategicOrders.ts`（schema 4 调动/输送在途命令）；`reconnaissance.ts`（侦察快照）；`captiveCommands.ts`（招降、释放） | 临时实现 | 调动/输送已成为可保存跨月道路命令。固定 C 证实输送创建时扣货离城、成功区间 `rand%100 > 20`，正常结算时执行者回来源城；产品保留这些常规语义。排序 BFS、每段 1 月、4 体力，以及来源或目标易主后的安全安置/资源守恒为现代规则；数组版 `PolicyExec` 同月执行且忽略 `TimeCount`，`SearchRoad` 函数体未入 allowlist。其余经营命令仍待实现 |
| 月度结算 | `tactic.c`、阶段钩子 | `economy.ts` | 临时实现 | 固定城池数据对照一个月结果 |
| 战场进入 | `citycmdd.c`、`Fight.c`、`g_FgtParam`、`fight.h:FIGHT_ORDER_MAX` | `core/tacticalBattle.ts:createTacticalBattle`；`ui/App.tsx` | 临时实现 | 已按固定参考限制每方最多 10 人；继续对照原版战场编号、进攻方向与部署位置；当前结构化战场为现代临时地图 |
| 战败俘虏与招降 | `citycmdd.c:FightResultDeal/TheLoserDeal/HoldCaptive/LostEscape/KingOverDeal`；`citycmd.c:SurrenderDrv` | `core/battle.ts`；`core/captiveCommands.ts`；`ui/CityPanel.tsx` | 临时实现 | 已接入确定性捕获、羁押、招降、释放和 AI；战死、装备缴获、君主继承选择与原版 U8 概率回绕后置 |
| 攻防属性 | `FgtCount.c:BuiltAtkAttr`、`.lib:dFgtLandF` | `compat/baye/tacticalBattle.ts`；`core/tacticalBattle.ts:attackTacticalUnit` | 差异验证 | 扩大端到端地形和装备兵种样本 |
| 普通攻击伤害 | `FgtCount.c:CountAtkHurt` | `compat/baye/tacticalBattle.ts`；`core/tacticalBattle.ts:attackTacticalUnit` | 差异验证 | 兼容公式继续使用原版 U16 攻击兵力输入，战术会话保留现代战略层完整兵力以避免截断写回；继续复核原版兵力上限和战后经验值 |
| 战术计谋、天气与状态 | `fight.h`；`Fight.c:FgtDealBout`；`FightSub.c:FgtJNAction/FgtChgWeather`；`FgtCount.c:CountSklHurt/CountBaseAttr` | `core/tacticalBattle.ts`；`ui/TacticalBattleScreen.tsx` | 临时实现 | 已接入五天气、火计/扰乱/激励、混乱和 AI；原版技能资源表、完整状态、地形与兵种倍率后置 |
| 战后经验与等级 | `FightSub.c:FgtGetExp`；`Fight.c:FgtChkAtkEnd`；`tactic.c:LevelUp` | `compat/baye/tacticalGrowth.ts`；`core/tacticalBattle.ts`；`core/battle.ts` | 有意变化 | 平方根经验、100 经验升级和 20 级上限已接入；Web 战后原子升级，快速战按总损失抽象分配 |
| 兵种克制 | `FgtCount.c:SubduModu`、文档默认钩子 | `BAYE_SUBDUE_MATRIX` | 差异验证 | 锁定提交检出后重生成 C oracle |
| 战略自动战斗 | `FgtCount.c:FgtCountWon` | `resolveBayeStrategicBattle` | 差异验证 | 明确双方零兵力时依赖的外围状态 |
| 战术移动力 | `fight.h:MOV_*`、`FgtCount.c:FgtIntMove/CountMoveP` | `compat/baye/tacticalBattle.ts:BAYE_BASE_MOBILITY`；`core/equipment.ts`；四时期兵种数据 | 已定位 | 加入外部参考夹具逐项验证装备移动加成和 8 点上限 |
| 战术移动与范围 | `FgtCount.c:CountMoveP/FgtTransMove`、`FightSub.c:FgtGetTerrain`、`.lib:dFgtLandR/dFgtAtRange` | `core/tacticalBattle.ts`（最短路径、河流/山林消耗、近战/远程范围） | 临时实现 | 从合法本地原版资源抽取 `dFgtLandR`和`dFgtAtRange`固定样本，逐格替换临时表 |
| 战场部署与目标 | `citycmdd.c:g_FgtParam`、`Fight.c:FgtDealMan/FgtDealCmp` | 按战略城市方位布阵、两类结构化战场、占城后结束攻方阶段判胜 | 有意变化 | 原版在进攻单位进入城格后立即判胜；Web 版增加一次阶段确认，并等待可再分发的战场编号/部署证据 |
| 战术状态与反馈 | `Fight.c:FgtChkEnd`、`FightSub.c`战斗日与地形接口 | `core/tacticalBattle.ts`（普通攻击、计谋、天气、混乱、待命、阶段、粮草、胜因）；`ui/TacticalBattleScreen.tsx` | 临时实现 | 核对主将败退、战斗日/粮草与攻守方阶段语义 |
| 战斗 AI | `FgtPkAi.c:FgtGetMCmd/FgtCmpMove/FgtAtkCmd` | `core/tacticalBattle.ts:runBasicTacticalAi`（击破优先、可攻击位置、攻城/守点与粮草紧迫度） | 临时实现 | 录制固定战场 AI 决策并替换当前确定性启发式 |
| 战略 AI | `gamEng.c`、城市命令流程 | `ai.ts`（兵力均衡、征兵、开垦、搜寻、边境支援、出征） | 临时实现 | 定位电脑月度命令顺序并逐项替换临时优先级 |
| 存档格式 | `fsys.c`、数据管理代码 | `saveGame.ts`、`saveStorage.ts`（schema 4、情报快照、在途战略命令、现代 Web 存档及 AI 守城战前检查点） | 有意变化 | schema 1/2/3 迁移已覆盖；识别原版头部、版本和数据段；保持与现代存档隔离；当前不保存战中战术局面 |
| 随机数（Web 移植） | `comIn.c:rand_r`、WASM `bayeRand` | `compat/baye/rng.ts` | 差异验证 | 从锁定提交重生成 WASM 样本 |
| 随机数（BBK 设备） | `fsys.h:SysRand` | 无 | 已定位 | 非阻塞考据；取得可信实现或设备序列后再新增参考模式 |
| 经典 LCD 表现 | `gamEng.c`、`exportjs.c`、LCD 缓冲 | React 开局流程与面板；Phaser 战略地图 | 有意变化 | 采集城市命令界面，约束下一阶段操作顺序 |

当前 `cityCommands.ts`、`battle.ts`、`economy.ts`、`ai.ts` 和 `core/random.ts` 共同提供可玩产品闭环，但仍包含现代临时规则，不代表原版规则已经还原。征兵已改为进入城池后备兵，并通过独立“分配”调整武将兵力；分配会消耗武将月行动，单次增兵上限与开局 AI 出征阈值是为了战役节奏加入的现代临时规则。手动战场已接入兼容层的普通攻防、伤害公式和原版基础移动力，并提供方向部署、两类现代结构化战场、路径/伤害预览、五天气、三项临时计谋、混乱、经验成长和改进的确定性 AI。地形移动表、攻击范围、粮草消耗、完整技能/状态和 AI 仍是可替换的现代临时规则；单挑与原版地图尚未接入。

当前所有新增差异证据来自文件哈希吻合但无 `.git` 元数据的本地快照。具体限制见 `source-manifest.json` 和 `fixtures/README.md`。

随机序列、确定性规则和现代呈现的边界见 `docs/design/compatibility-policy.md`。项目不要求未知 BBK `SysRand` 的逐次序列一致，但仍要求保留随机调用位置、取值范围和概率边界。
