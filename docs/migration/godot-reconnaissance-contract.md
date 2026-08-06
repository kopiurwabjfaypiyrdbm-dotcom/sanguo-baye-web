# Godot 侦察与情报可见性契约

## 状态与事务

`intelReports` 属于纯 `GameState`，不属于场景树。`reconnoitre_city` 通过统一 command envelope 执行，只接受 `sourceCityId`、`targetCityId`、`officerId` 三个参数。成功事务一次性扣除来源城金钱和执行者体力、登记本月行动、覆盖目标报告并追加日志；失败不提交任何字段。

侦察不调用 RNG。经典 `baye-classic-v1` 成本为 10 体力、20 金，现代 `modern-balanced-v1` 为 4 体力、50 金。目标城按 `sourceIndex`、稳定 ID 比较排序，报告中的在职人物 ID 也使用显式稳定 ID 比较，不依赖 `Dictionary` 顺序或本地化排序；当前实体 ID 属于受约束 ASCII 域，共享 fixture 以 `officer-100` 先于 `officer-99` 固定其字典序。

## 报告字段与兼容

新报告保存观察时的 turn/year/month、人口、金粮、后备兵、农业、商业、防御、可选民忠和太守名，以及人物 ID、人数与总兵力。报告创建后是值快照；目标城市或人物的实时变化不会反写旧报告，再次合法侦察才会整体覆盖。

runtime validator 对报告执行 closed-shape、城市键/引用、非负整数、时间不在未来、人物引用/重复和 `officerCount` 自洽检查。Web 旧报告可能没有 `officerIds`，因此该字段保持可选；查询不会推测或补造名单。

## 表现层可见性

`city_visibility_query()` 是敌城详情的数据权限边界：

- 己方城市：`knowledge = current`，可以显示实时城市状态。
- 未侦察敌城：`knowledge = public`，只提供城名和当前公开势力归属。
- 已侦察敌城：`knowledge = report`，只提供保存报告和观察年月，并明确标为旧情报。

战略地图仍可从只读战役快照绘制公开节点和势力色，但 `CityCard` 与侦察面板必须依据 visibility DTO 渲染，不得读取敌城实时资源、驻将或人物属性补全旧报告。

## 跨语言证据

`scripts/generate-godot-application-session-fixture.ts` 以 TypeScript 产品实现为 oracle，生成 `godot/data/fixtures/application-session-suite-v1.json`。MB09 的共享证据包括两步覆盖序列、11 个命令边界、12 个 validator 负例和一个旧式报告恢复案例；TypeScript 与 Godot 比较 result/receipt、完整 canonical state SHA-256 和精确 seed。命令边界显式覆盖聚合兵力安全整数溢出和 `officer-100`/`officer-99` 稳定次序；validator 负例覆盖完整 calendar、turn 及 calendar 成员畸形时返回 issues 而不是类型崩溃。

经典首步从 state SHA `74bd11a4ad3bc131979749534878570cca20c4b2d2f7b494c31ae48b6576ee38` 变为 `d84621f796e1ec01cc745b86c2c7d0fddea58770e8faf3824a46613f18a4628d`，seed 保持 `48641`；城市 `city-12` 金钱 `135→115`，`officer-1` 体力 `100→90`，报告锁定 `city-0` 的 190 年 1 月观察值与排序人物 `officer-56`、`officer-57`。旧式无人物名单报告摘要为 `ffc30eff6bf92ff0277cb789c66130af5d366d8642b6428d5a60018cf3c1072b`。

这些证据证明与当前 Web 产品 oracle 一致。C 证据只支持侦察入口与经典成本；持久情报快照和可见性策略仍是明确的现代产品语义。
