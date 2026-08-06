# Godot 人物任命与装备管理契约

## 命令范围

MB06 将 Web `src/core/personnelCommands.ts` 的四项既有产品能力接入生产 `GameSession`：

| Godot kind | 参数 | 行动 / RNG |
|---|---|---|
| `reward_officer` | `cityId`, `officerId` | 不占月度行动；0 次 RNG |
| `appoint_satrap` | `cityId`, `officerId` | 不占月度行动；0 次 RNG |
| `give_item` | `cityId`, `officerId`, `itemId` | 不占月度行动；0 次 RNG |
| `unequip_item` | `cityId`, `officerId`, `itemId` | 不占月度行动；0 次 RNG |

参数对象闭合并沿用 command envelope v1、Unicode 标量字段排序、ECMAScript TrimString、before-state 摘要和 256 条幂等窗口。成功会设置 `campaignStarted`、追加一条稳定日志并完整校验 next state；拒绝不改变任何状态、日志、行动列表或 seed。

## 规则语义

- 奖赏只在玩家阶段作用于本城非君主在职人物，支出 100 金，忠诚增加 8 并封顶 100。
- `baye-classic-v1` 由既有自动太守策略决定太守，手动任命稳定拒绝；`modern-balanced-v1` 允许把本城在职人物写入 `satrapOfficerId`。
- 人物有两个有序通用装备位。普通道具从城池 `itemIds` 原子转移到 `equipmentItemIds` 尾部；卸下指定槽位后保持其余顺序，并把道具追加回城池库存尾部。
- 三类兵符从库存消耗并覆盖 `armsTypeId`，不写入装备槽；但当前 Web oracle 先检查两个装备位是否已满，因此满槽人物也不能使用兵符。铁骑、太玄兵符分别要求有效武力、有效智力严格大于 105；水战兵符没有属性门槛。
- 普通人物受赏赐后忠诚增加 8 并封顶 100，君主保持 100；有效武力/智力只从两个有序槽位的道具加成计算。道具在隐藏库存、城池已发现库存与人物装备间保持唯一归属。

这些是当前 Web 产品语义。33 项道具内容仍为 provisional 数据；本契约只证明 Godot 与 TypeScript oracle 一致，不提升相对 BBK 设备的证据等级。

## 分层与查询

`officer_management_commands.gd` 是场景树外的纯领域实现；`officer_management_adapter.gd` 只校验闭合参数并适配 dispatcher。`GameSessionQueries.city().officerManagement` 是 UI 唯一资格查询边界：一次快照和完整校验后，按 `officerOrder` 返回城内人物，并保持库存/装备数组顺序。DTO 提供太守、兵种、忠诚、体力、基础/有效武智、装备、库存以及奖赏/任命/赏赐/卸装的 `allowed/reason`；Control 不复制成本、门槛或忠诚规则。

原生 `OfficerManagementPanel` 从空间化城池卡片进入，独立于七项内政选择。它使用 Godot `OptionButton`、`Button` 与 `ConfirmationDialog` 浏览人物、解释经典自动太守、确认金钱奖赏/库存消耗，并在每笔命令后重新查询 DTO。

## 跨语言证据

共享 `application-session-suite-v1.json` 共 54 路事务，其中 MB06 有 6 路连续序列和 11 路独立边界。矩阵覆盖奖赏成功与金钱/君主拒绝、忠诚封顶、经典拒绝与现代任命、普通装备/有序卸装、满槽拒绝、铁骑门槛及成功、太玄成功、水战成功、君主忠诚特例、未知字段排序、返回 state SHA 和失败原子性。Godot 4.7.1 runner 对 result core、receipt、返回 state、前后 SHA 和最终 canonical state 与 TypeScript oracle 逐项比较。
