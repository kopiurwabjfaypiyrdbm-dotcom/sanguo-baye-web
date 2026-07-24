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
| 剧本加载 | `tactic.c:LoadPeriod`、`.lib` | `sampleState.ts` | 已定位 | 解析资源容器并校验四时期最小记录 |
| 城池、人物与道具结构 | `dictsys.h`、`attribute.h`、`bind-objects.c` | `types.ts`；`data-structure-map.md` | 已定位 | 用人工最小二进制夹具验证 19/37/66 字节解析 |
| 城池命令 | `citycmd*.c` | 无 | 未开始 | 列出全部命令、消耗和执行条件 |
| 月度结算 | `tactic.c`、阶段钩子 | `economy.ts` | 临时实现 | 固定城池数据对照一个月结果 |
| 战场进入 | `Fight.c`、`g_FgtParam` | 无 | 未开始 | 对照将领、方向、粮草和地图加载 |
| 攻防属性 | `FgtCount.c:BuiltAtkAttr` | `compat/baye/tacticalBattle.ts` | 差异验证 | 从 `.lib` 解析实际 `dFgtLandF` 字节表 |
| 普通攻击伤害 | `FgtCount.c:CountAtkHurt` | `compat/baye/tacticalBattle.ts` | 差异验证 | 用可运行战场状态复核一组端到端伤害 |
| 兵种克制 | `FgtCount.c:SubduModu`、文档默认钩子 | `BAYE_SUBDUE_MATRIX` | 差异验证 | 锁定提交检出后重生成 C oracle |
| 战略自动战斗 | `FgtCount.c:FgtCountWon` | `resolveBayeStrategicBattle` | 差异验证 | 明确双方零兵力时依赖的外围状态 |
| 战术和状态 | `tactic.c`、战场状态常量 | 无 | 未开始 | 整理技能、命中、持续时间和解除条件 |
| 战斗 AI | `FgtPkAi.c` | 无 | 未开始 | 录制固定战场 AI 决策 |
| 战略 AI | `gamEng.c`、城市命令流程 | `ai.ts` | 临时实现 | 定位电脑月度命令顺序 |
| 存档格式 | `fsys.c`、数据管理代码 | 无 | 未开始 | 识别头部、版本和数据段 |
| 随机数（Web 移植） | `comIn.c:rand_r`、WASM `bayeRand` | `compat/baye/rng.ts` | 差异验证 | 从锁定提交重生成 WASM 样本 |
| 随机数（BBK 设备） | `fsys.h:SysRand` | 无 | 已定位 | 取得 `SysRand` 实现或设备输出序列 |
| 经典 LCD 表现 | `gamEng.c`、`exportjs.c`、LCD 缓冲 | 静态 React 壳 | 已定位 | 在本地运行时采集首批原始截图 |

当前 `battle.ts`、`economy.ts`、`ai.ts` 和 `core/random.ts` 仅证明现代 TypeScript 架构可运行，不代表原版规则已经还原。`src/compat/baye/` 是隔离的兼容证据层，尚未接管应用主流程。

当前所有新增差异证据来自文件哈希吻合但无 `.git` 元数据的本地快照。具体限制见 `source-manifest.json` 和 `fixtures/README.md`。
