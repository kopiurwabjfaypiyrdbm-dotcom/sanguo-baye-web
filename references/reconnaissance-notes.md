# 侦察命令证据与现代化边界

## 固定参考事实

- `baye/order.h` 将 `RECONNOITRE` 定义为军备命令 23，并声明 `THEW_RECONNOITRE` 为 4；该宏未被运行时路径直接引用。
- `citycmdc.c:ReconnoitreMake` 先校验城池金钱和武将体力，再允许选择任意非本势力城市；选定后立即调用 `ShowCityPro` 展示目标城，扣除体力与金钱，并把武将加入执行时间为 1 的命令。
- `citycmd.c:ReconnoitreDrv` 在命令完成时只把执行武将加回原城市，没有成功率或随机分支。
- `citycmde.c:IsMoney/OrderConsumeMoney` 与 `IsManual/OrderConsumeThew` 分别从界面资源 `ConsumeMoney[RECONNOITRE]` 和 `ConsumeThew[RECONNOITRE]` 读取运行时成本。两张资源表均不在允许入库的 MIT C 子集内，因此当前不能把具体金额或 4 体力声明为运行时差异验证结果。

## 当前 Web 规则

- `src/core/reconnaissance.ts` 保留任意非己方目标和无随机失败；体力暂按 `order.h` 的声明值 4 对齐。
- 当前行动系统没有原版命令队列，侦察立即完成并占用武将本月行动。
- 4 体力与 50 金都是小而可替换的产品数值，不是运行时兼容声明。
- 现代界面不保留一次性模态城市报告，而把人口、金钱、粮草、后备兵、农业、商业、城防、民忠、太守、武将数和驻军总兵力保存为当月快照。敌城后续变化不会自动更新快照。
- 未侦察敌城只显示城市名称和公开的势力归属；实时资源、太守和驻军不再免费展示。

## 验证

- `src/core/reconnaissance.test.ts` 覆盖不可变状态更新、临时体力/金钱成本、无 RNG 推进、快照不随敌城变化、存档往返和非法命令原因。
- `src/core/saveGame.test.ts` 覆盖 schema 1/2 到 schema 3 的空情报层迁移。
- `src/core/campaignSoak.test.ts` 覆盖四时期长期推进与周期性保存重载。
