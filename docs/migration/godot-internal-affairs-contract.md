# Godot 内政命令迁移契约

## 范围

MB05 将 Web `src/core/cityCommands.ts` 的完整内政组接入 MB04 生产事务边界：

| Godot kind | 参数 | RNG |
|---|---|---|
| `develop_farming` | `cityId`, `officerId` | 1 次 |
| `develop_commerce` | `cityId`, `officerId` | 1 次 |
| `govern_city` | `cityId`, `officerId` | 1 次 |
| `inspect_city` | `cityId`, `officerId` | 1 次 |
| `trade_food` | `cityId`, `officerId`, `direction`, `amount` | 0 次 |
| `banquet_officer` | `cityId`, `targetOfficerId` | 0 次 |
| `plunder_city` | `cityId`, `officerId` | 0 次 |

`direction` 只接受 `buy`/`sell`；`amount` 是正安全整数。所有对象参数闭合，未知字段按 Unicode 标量顺序稳定拒绝。字符串继续使用 MB04 显式 ECMAScript TrimString 码点集合。

## 领域与应用边界

- `godot/src/domain/commands/internal_affairs_commands.gd` 是招商、治理、出巡、交易、宴请与掠夺的纯领域实现；历史开垦实现继续作为已固定证据保留。
- `godot/src/application/commands/internal_affairs_adapter.gd` 只处理语言无关参数契约并调用领域层。`CommandDispatcher.ADAPTERS` 显式注册七项命令。
- `GameSession` 继续独占权威状态、校验 before/after、计算 canonical SHA-256、处理乐观并发和幂等窗口。领域失败与参数失败都不提交状态。
- `GameSessionQueries.city()` 返回按固定顺序排列的七项 DTO。UI 只读取 `allowed/reason/executors/targets/trade defaults`，不复制规则。

## 跨语言证据

`godot/data/fixtures/application-session-suite-v1.json` 保留 MB04 的 13 路完整事务，并新增 12 路连续内政序列、11 路独立边界和 1 路无效状态，共 37 路。连续序列挑战命令顺序、随机/非随机混合、负向参数、资源和已行动路径；独立矩阵固定农商上限、灾害治理、出巡上限、装备增益、宴请/掠夺边界以及现代规则成本。Godot runner 对每个 result core、receipt、seed、返回 state 载荷 SHA、会话 state SHA 和最终 canonical state 与 TypeScript oracle 对照。

运行时 validator 对城市、人物和道具的非负整数字段统一约束在 JavaScript 安全整数域内，使无效输入在领域前置校验阶段拒绝，而不是延迟到 canonical hash/事务提交阶段。

fixture 另固定 `modern-balanced-v1` 治理成本案例，防止只移植新战役使用的经典规则集。`baye-classic-v1` 与 `modern-balanced-v1` 的内政成本均来自 Web `src/core/rulesets.ts`；这只声明 Godot 与当前产品一致，不提升相对 BBK 设备的证据等级。

## 原生交互

城池卡片使用原生 Godot `OptionButton`、`SpinBox`、`ConfirmationDialog` 和触控按钮：

- 七项命令可由下拉菜单或前后 48px 切换按钮访问；
- 交易只显示当前资源允许的方向，并给出安全默认数量；
- 宴请选择稳定排序的合法目标；
- 掠夺必须经过中文危险确认；
- 844×390 的交易模式压缩为金/粮单行摘要，避免操作按钮越界，其他模式保留完整城市统计。

月度经济结算、灾害发生与自然恢复不在此契约内，仍归 MB11。
