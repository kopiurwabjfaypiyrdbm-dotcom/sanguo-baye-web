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
| 剧本加载 | `tactic.c:LoadPeriod`、`.lib` | `compat/baye/legacyScenario.ts`；`data/legacyScenario.ts` | 差异验证 | 扩展到时期 2–4，并接入未出仕人物出现条件 |
| 城池、人物与道具结构 | `dictsys.h`、`attribute.h`、`bind-objects.c`、`dat.lib.orig` | `types.ts`；`data-structure-map.md` | 差异验证 | 解析道具记录并绑定两个原版装备槽 |
| 城池命令 | `citycmd*.c` | `cityCommands.ts`（开垦、征兵、分配）；`personnelCommands.ts`（搜寻、登用、奖赏、调动、任命） | 临时实现 | 接入搜寻伯乐条件、城池道具库存与原版道具赏赐；移动改为按道路距离进入命令队列 |
| 月度结算 | `tactic.c`、阶段钩子 | `economy.ts` | 临时实现 | 固定城池数据对照一个月结果 |
| 战场进入 | `Fight.c`、`g_FgtParam` | 无 | 未开始 | 对照将领、方向、粮草和地图加载 |
| 攻防属性 | `FgtCount.c:BuiltAtkAttr`、`.lib:dFgtLandF` | `compat/baye/tacticalBattle.ts` | 差异验证 | 在可运行战场状态中使用已验证的 6×8 地形表 |
| 普通攻击伤害 | `FgtCount.c:CountAtkHurt` | `compat/baye/tacticalBattle.ts` | 差异验证 | 用可运行战场状态复核一组端到端伤害 |
| 兵种克制 | `FgtCount.c:SubduModu`、文档默认钩子 | `BAYE_SUBDUE_MATRIX` | 差异验证 | 锁定提交检出后重生成 C oracle |
| 战略自动战斗 | `FgtCount.c:FgtCountWon` | `resolveBayeStrategicBattle` | 差异验证 | 明确双方零兵力时依赖的外围状态 |
| 战术和状态 | `tactic.c`、战场状态常量 | 无 | 未开始 | 整理技能、命中、持续时间和解除条件 |
| 战斗 AI | `FgtPkAi.c` | 无 | 未开始 | 录制固定战场 AI 决策 |
| 战略 AI | `gamEng.c`、城市命令流程 | `ai.ts`（兵力均衡、征兵、开垦、搜寻、边境支援、出征） | 临时实现 | 定位电脑月度命令顺序并逐项替换临时优先级 |
| 存档格式 | `fsys.c`、数据管理代码 | `saveGame.ts`、`saveStorage.ts`（现代 Web 存档） | 有意变化 | 识别原版头部、版本和数据段；保持与现代存档隔离 |
| 随机数（Web 移植） | `comIn.c:rand_r`、WASM `bayeRand` | `compat/baye/rng.ts` | 差异验证 | 从锁定提交重生成 WASM 样本 |
| 随机数（BBK 设备） | `fsys.h:SysRand` | 无 | 已定位 | 非阻塞考据；取得可信实现或设备序列后再新增参考模式 |
| 经典 LCD 表现 | `gamEng.c`、`exportjs.c`、LCD 缓冲 | React 面板；Phaser 战略地图 | 有意变化 | 采集城市命令界面，约束下一阶段操作顺序 |

当前 `cityCommands.ts`、`battle.ts`、`economy.ts`、`ai.ts` 和 `core/random.ts` 共同提供可玩产品闭环，但仍包含现代临时规则，不代表原版规则已经还原。征兵已改为进入城池后备兵，并通过独立“分配”调整武将兵力；出征已支持多武将与携粮，但仍立即自动结算，尚未进入原版命令队列或战术战场。`src/compat/baye/` 是隔离的兼容证据层，尚未接管应用主流程。

当前所有新增差异证据来自文件哈希吻合但无 `.git` 元数据的本地快照。具体限制见 `source-manifest.json` 和 `fixtures/README.md`。

随机序列、确定性规则和现代呈现的边界见 `docs/design/compatibility-policy.md`。项目不要求未知 BBK `SysRand` 的逐次序列一致，但仍要求保留随机调用位置、取值范围和概率边界。
