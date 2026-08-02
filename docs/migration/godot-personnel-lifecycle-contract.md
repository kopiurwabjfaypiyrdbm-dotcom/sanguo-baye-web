# Godot 人才与俘虏生命周期契约

本契约固定 MB07 在 TypeScript 产品 oracle 与 Godot 4.7.1/GDScript 客户端之间共享的人才、俘虏和装备处置语义。它证明两个客户端对当前产品规则一致，不把尚未取得设备证据的细节提升为原版一致。

## 命令边界

全部命令进入 `GameSession` 的版本化事务 envelope，经 `CommandDispatcher` 的显式 adapter 注册后执行。参数对象只接受列出的字段；缺失、类型错误、Unicode 空白和未知字段使用既有稳定错误优先级。领域拒绝、adapter 拒绝、摘要冲突与非法 next-state 均不修改状态或 seed。

| 命令 | 参数 | 行动/资源 | 核心结果 |
|---|---|---|---|
| `search_city` | `cityId`, `officerId` | 体力 8，占行动 | 按稳定候选顺序确定性尝试无收获、发现/直接登用人才、道具、金钱或粮草 |
| `recruit_free_officer` | `cityId`, `executorOfficerId`, `targetOfficerId` | 体力 8，占行动 | 只处理本城已发现的在野人物；成功转为本势力在职，失败保持已发现 |
| `recruit_captive` | `cityId`, `executorOfficerId`, `captiveOfficerId` | classic：体 15/金 100；modern：体 4/金 0；占行动 | 依有效智力、忠诚与性格按条件推进 RNG；成功清理俘虏元数据并入仕，失败合法消耗成本 |
| `release_captive` | `cityId`, `captiveOfficerId` | 无，不占行动 | 转为羁押城已发现在野人物，清理俘虏元数据 |
| `execute_captive` | `cityId`, `captiveOfficerId` | 无，不占行动 | 转为死亡，记录死亡元数据，全部装备按原顺序回收至羁押城 |
| `banish_officer` | `cityId`, `officerId` | 无，不占行动；推进一次 RNG | 非君主在职人物或本城俘虏成为显式排序后随机目标城的在野人物，兵力/体力清零，并修复太守与相关运行时引用 |
| `confiscate_equipment` | `cityId`, `officerId`, `itemId` | 无，不占行动；除玩家君主外推进一次 RNG | 单件装备回城；除玩家君主外忠诚降低 20，玩家君主不推进 seed 且不降低忠诚 |

所有影响结果的人员、城市、装备和发现集合使用显式顺序；Godot 默认随机数与 `Dictionary` 遍历顺序不参与结果。随机调用沿用 Web LCG 和显式 seed，并且只在对应前置条件成功后发生。

## 状态不变量

- `serving` 人物必须属于实际势力和城市；`free` 人物必须属于 `neutral`，且发现集合只引用在野人物。
- `captive` 人物必须属于 `neutral`，同时具有合法且互不混淆的 `captorFactionId`、`formerFactionId` 与羁押 `cityId`。
- `dead` 人物必须具有完整死亡记录，不能留在行动、发现或城市管理引用中。
- 每件装备只能由一名人物或一座城持有一次；处斩、流放和没收保持唯一所有权与有序回收。
- 人物离任后太守必须按稳定人物顺序修复；玩家君主不得被处斩或流放。
- 每笔成功事务在完整 `GameState` 校验后才提交，并返回 result core、receipt、完整 state 以及 before/after canonical SHA-256。

## 查询与呈现

`GameSessionQueries.city()` 的 `personnelLifecycle.commands` 是场景唯一规则读取边界，固定返回七项命令的显式顺序、模式、风险、成本、摘要、稳定默认项，以及执行者、目标、装备和不可用原因。DTO 为深拷贝；`PersonnelLifecyclePanel` 只渲染 DTO 和发送 command intent，不计算资格、概率、忠诚、随机目的地或装备回收。

原生面板从空间城池卡片的“人才”入口进入，支持鼠标和触摸切换命令、目标、执行者和装备。处斩、流放与没收必须经过原生确认框；紧凑布局与确认按钮保持至少 48px 级物理触控目标，并在执行、取消或拒绝后保留城池上下文。

## 共享验证证据

`application-session-suite-v1.json` 由 TypeScript oracle 生成，Godot runner 对相同输入逐项比较 result core、receipt、返回 state、before/after SHA-256 和最终 canonical state。MB07 将共享矩阵从 56 路扩展到 83 路、Godot 断言从 589 项扩展到 723 项，覆盖：

- 搜寻各结果、显式登用成败及发现集合；
- 招降的有效智力、忠诚、性格、条件式 RNG 和 classic/modern 成本；
- 释放、带装备处斩、在职/俘虏流放、38 城稳定目的地；
- 非君主与君主没收、忠诚和 seed 特例；
- 跨命令身份转换、失败原子性、参数边界和新增运行时状态校验。

正式时期数据不注入测试俘虏。合成俘虏只存在于语言无关 fixture 与呈现烟雾测试构造的、通过完整校验的临时状态中。
