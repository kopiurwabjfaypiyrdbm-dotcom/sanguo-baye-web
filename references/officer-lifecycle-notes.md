# 人物生命周期与君主继承对照笔记

## 结论范围

本阶段以锁定的 MIT C 参考子集为第一事实源，完成可保存的人物死亡、处置、装备回收和君主继承闭环。这里区分三类结论：

- 固定移植路径：随机调用位置、处斩装备回城、流放目的地、没收忠诚、战败俘获/逃脱/极低概率死亡及继承候选语义。
- 现代安全规则：战役开局显式选择并版本化死亡/逃脱政策、玩家继承保存点、君主不可流放、人物死亡事务同时清理命令和太守。
- 现代可选规则：年龄 90 岁后的逐年 50% 自然死亡、每月俘虏逃脱。它们有源码动机，但不是固定移植当前默认运行路径。

项目不据此声称 BBK 设备上的默认开关值或完整人物关系已经还原。

## 固定参考行为

| 行为 | 上游入口 | 可重复结论 | Web 落点 |
|---|---|---|---|
| 处斩 | `citycmdb.c:KillMake` | 仅从本城俘虏选择；两个装备位依次回到城池；消耗一次 `rand % 3` 对话随机；随后从城中删除人物 | `compat/baye/officerLifecycle.ts` 保留随机调用位置；`core/officerLifecycle.ts:executeCaptive` 原子回收装备并记录死亡 |
| 流放 | `citycmdb.c:BanishMake` | 本城在职与俘虏都可成为目标；人物转为无所属并通过一次 `rand % CITY_MAX` 落到任意城市 | `rollBayeBanishDestination` 与 `banishOfficer`；现代安全规则禁止流放当前君主 |
| 没收 | `citycmde.c:ConfiscateMake` | 从本城在职人物选择一个装备；非玩家君主消耗一次对话随机并扣 20 忠诚，最低为 0；装备回城 | `applyBayeConfiscationLoyalty` 与 `confiscateOfficerEquipment` |
| 战败结果 | `citycmdd.c:TheLoserDeal/LostEscape/HoldCaptive` | 先取 `rand % 100`；结果大于智力时被俘，否则若原势力仍有城则再取一次随机选择逃往的城；无逃脱城市且第一次结果为 0 时，战死开关可允许死亡 | `rollBayeDefeatedOfficerOutcome` 与 `core/battle.ts` |
| 城陷留守人物 | `citycmdd.c:BeOccupied` | 未进入战斗队列的留守君主被俘，其他留守人物转无所属，全员兵力清零；参战败将仍按战斗队列依次进入 `TheLoserDeal` | `core/battle.ts` 保持队列 RNG 顺序，并把留守君主送入统一继承闭包 |
| 君主失效 | `citycmdd.c:KingOverDeal/KingDeadNote` | 原势力仍有城且有人物时必须立新君；玩家选择，电脑选最高智力；新君忠诚设为 100；无人可继时势力城池转为无所属 | `handleRulerLoss`、`resolveSuccession` 与势力瓦解事务 |
| 年龄增长 | `infdeal.c:PersonUpDatadate`、`attribute.h:EngineConfig` | 若未禁用年龄增长，每年 1 月全员加一岁；年龄死亡区块存在但被整体注释 | `annualProgression.ts` 受 `lifecyclePolicy.ageGrowth` 控制；自然死亡仅作为开局可选现代政策 |

## 本项目政策

`GameState.schemaVersion` 5 保存 `LifecyclePolicy`。新战役和旧存档迁移的安全默认值为：

```text
年龄增长：开启
战败死亡：关闭
自然死亡：关闭
俘虏月度逃脱：关闭
```

开局可以选择：

- `baye-rare`：仅在战败者无可逃城市且参考路径第一次随机结果为 0 时战死。
- `age-90-coinflip`：对年满 90 岁且仍在场的人物逐年作 50% 判定；来自注释块，只作为现代可选模式。
- `modern-monthly`：俘虏每月按智力获得 5%–25% 的逃脱机会；这是明确的现代玩法规则，不声明原版一致。

开局后政策锁定并随存档保存，避免同一战役在不同客户端隐式改变随机调用和人物结果。

## 原子状态与恢复

- `dead` 是持久人物状态，附带原因、年月、回合、装备回收城市和可选责任势力。
- 死亡、被俘或势力瓦解会取消人物关联的调动、输送和谋略；输送货物按确定性城市优先级完整返还，不静默丢失。
- 装备实例在人物、城池发现库存和隐藏库存之间全局唯一。schema 1–4 迁移会把同类型的历史重复目录 ID 规范化为稳定实例 ID，schema 5 损坏重复则直接拒绝。
- 玩家君主失效且有候选人时进入持久 `succession` 阶段。城池命令、月末和 AI 继续推进被冻结，但保存、导出和返回标题可用；选择继承人后恢复原来的玩家或 AI 游标。
- AI 君主先按含装备的有效智力，再按忠诚、统率和原始人物顺序稳定排序自动继承。没有候选人的势力立即瓦解；玩家势力因此结束战役。

## 尚未声称一致

- BBK 设备版及特定发行配置的死亡开关默认值。
- 固定移植处斩后未显式清空装备槽造成的悬空引用；Web 版按唯一所有权安全清空。
- 人物血缘、婚姻、结义、遗嘱与历史继承谱系。
- `modern-monthly` 俘虏逃脱概率。
- 处置成本、完整原版对话与表现资源。

## 验证入口

- `src/compat/baye/officerLifecycle.test.ts`
- `src/core/officerLifecycle.test.ts`
- `src/core/battle.test.ts`
- `src/core/saveGame.test.ts`
- `src/core/validation.test.ts`
- `src/core/campaignSoak.test.ts`
