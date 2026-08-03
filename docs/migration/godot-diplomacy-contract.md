# Godot 外交谋略运行契约

本契约定义 MB10 在 Godot 4.7.1/GDScript 中已经固定的跨客户端边界。TypeScript 产品仍是行为 oracle；固定 C 参考只支持随机比较、整数宽度、性格阈值、隐藏对话 RNG 消耗和主要结果，不支持把现代状态闭包笼统称为原版一致。

## 权威状态

`diplomaticOrders` 与 `nextDiplomaticOrderSerial` 属于纯领域 `GameState`。订单记录只能包含 `id`、`kind`、`factionId`、`officerId`、`sourceCityId`、`targetOfficerId`、`targetFactionId`、`targetCityId`、创建 turn/year/month、`durationMonths`、`remainingMonths` 和 `moneyCost`。validator 同时约束 closed shape、数字序号、引用、创建时间、持续时间、执行者唯一占用及下一序号单调性。

场景树不拥有或修改订单。`DiplomaticOrderPanel` 只发出 command envelope 或“推进回报”意图；`GameSession` 在完整校验、canonical SHA 和事务提交边界内一次性替换状态。签发拒绝不扣资源、不登记行动、不创建订单、不消耗 RNG。

战略运输/移动与外交谋略共享同一个原子月份边界：应用层固定先结算战略订单、再结算外交订单，只在两类结算全部完成后做一次最终校验和提交。两个面板的推进入口均调用该协调器，不能各自独立增加 `turn`。这只定义订单协调，不代替 MB12 的完整 AI、经济、事件与月循环编排。

## 命令与产品成本

| command kind | 规则类型 | classic | modern |
|---|---|---:|---:|
| `issue_alienate_order` | 离间 | 20 体力 / 50 金 | 4 体力 / 50 金 |
| `issue_canvass_order` | 招揽 | 20 体力 / 50 金 | 4 体力 / 50 金 |
| `issue_counterespionage_order` | 策反 | 20 体力 / 50 金 | 4 体力 / 50 金 |
| `issue_induce_order` | 劝降 | 10 体力 / 50 金 | 4 体力 / 50 金 |

四类命令均占用执行者本月行动并以一个产品月份回报。固定参考只写入 `TimeCount=10`，其时间单位和运行时成本表未进入许可 allowlist，因此上表与“一月”是明确的规则集产品契约。

## 情报边界

玩家目标只能来自 `observedTurn == state.turn` 且包含 `officerIds` 的侦察报告。查询 DTO 对每个目标只返回稳定 ID、名字、报告城池/势力名称和观察 turn/year/month；禁止返回实时忠诚、智力、兵力、体力、当前位置或当前归属。旧报告、兼容报告缺少人物名单、人物已移动或归属变化时，签发使用统一失效原因，不能转而读取隐藏列表。

## 确定性结算

- 订单按 `diplomatic-order-N` 的数字 `N` 排序，不依赖 `Dictionary` 插入或遍历顺序。
- 签发不调用 RNG；只有结算时仍合法的目标进入 `baye_diplomacy.gd`。
- 固定 LCG seed、无符号宽度、严格比较方向和隐藏对话调用位置与 TypeScript 一致；Godot RNG、渲染时钟、Tween 和本地化排序不参与结果。
- 目标移动/变更势力、劝降优势失效、执行者状态改变或执行方失去全部城市的路径不会误耗 RNG。
- 连续运行与把在途状态经 `snapshot()`/`restore_snapshot()` 重建后结算，必须产生相同 result、receipt、日志、完整 canonical state SHA-256 与最终 seed。
- 战役进入结束态前必须调用确定性的外交订单终止闭包；结束态不得残留战略或外交订单。

成功结果复用共同归属闭包：招揽修复太守；策反创建或复用稳定反叛势力并处理驻城人物/俘虏；劝降吸收城池、人物和符合条件的俘虏；任何失去全部城市的势力，其在途战略/外交命令按数字序号终止，执行者和物资使用稳定安置规则。来源城易主时执行者返回该势力按 ID 排序的首个仍有城池；无城时转为中立在野。

## 表现边界

原生面板显示四类谋略、报告目标、执行者、成本、一个月回报、禁用原因和在途列表。地图紫色曲线、签发 Tween 与结算脉冲均为可取消的表现反馈；动画不触发或延迟领域提交。所有关键信息均有文本语义，不依赖颜色。
