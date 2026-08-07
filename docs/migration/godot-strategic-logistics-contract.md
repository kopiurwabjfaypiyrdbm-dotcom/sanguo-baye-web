# Godot 战略后勤契约

日期：2026-08-03  
状态：MB08 生产契约  
引擎：Godot 4.7.1 / GDScript

## 边界与所有权

跨城调动、物资输送、稳定寻路、订单推进、货物回退、RNG 和完整状态校验位于场景树外。`strategic_order_commands.gd` 是领域实现，`strategic_order_adapter.gd` 把玩家签发接入 MB04 command envelope；`GameSession.advance_strategic_orders()` 是供 MB11/MB12 月度编排调用的独立应用能力。Control 只读取 query DTO、展示路线与订单并发送 intent。

当前实现复现 Web 产品语义，不把现代多月道路、20% 级货损或安全回退宣称为原设备规则。固定 C 子集仅作为 `TransportationDrv/MoveDrv` 与 `TransportationMake/MoveMake` 的规则证据，不进入 Godot 构建。

## 签发契约

- `issue_move_order` 参数为 `sourceCityId`、`targetCityId`、`officerId`。
- `issue_transport_order` 另要求 `cargo`，且必须且只能含 `money`、`food`、`reserveTroops` 三个非负安全整数，至少一项大于零。
- 源城、目标城必须不同且同属活动势力；执行者必须是在源城的在职人物、未行动、没有战略或外交订单并有足够体力。
- 只允许经过己方城市的道路。BFS 的邻接 ID 显式按受约束 ASCII ID 的 ordinal 顺序排序；最短路线、月份和 `routeCityIds` 在签发时冻结。
- classic 调动体力为 0、输送为 8；modern 两者均为 4。签发占用行动，执行者离开驻城并修复太守；输送物资在同一事务内立即从源城扣除。
- 失败不提交部分状态，不改变 seed、资源、体力或行动集合。

## 排序与确定性

生产实体 ID 受 schema 约束为 ASCII 前缀加十进制序号。一般订单推进、道路邻接、常规结算回退、订单和查询结果采用这些受约束 ASCII 字符串的 ordinal 字典序，而不是本地化、自然数或 `Dictionary` 插入顺序。生命周期取消是一个明确例外：为与 Web `cancelOfficerOrders` 对齐，候选先取源城、目标城，再按城市 `sourceIndex`、ID 排序补入己方城和其余城市。

共享 fixture 把两个合法订单重命名为 `strategic-order-2` 与 `strategic-order-10`，要求 `strategic-order-10` 先处理，从而能识别错误的数值排序或容器遍历。TypeScript 现有 `localeCompare` 在该受约束 ASCII 域中的结果由 fixture 固定；若将来允许非 ASCII ID，必须先升级契约与双运行时 fixture。

订单 ID 使用 `strategic-order-N` 与单调 `nextStrategicOrderSerial`。创建时跳过已有冲突；runtime validator 要求序号大于所有活动订单后缀。

## 推进与 RNG

- 订单按上述稳定 ID 顺序处理。`remainingMonths > 1` 时只递减；到期才结算。
- 调动优先进入仍属己方的目标城，否则依次回源城、稳定首个己方城；势力无城时人物转为中立在野。
- 输送先验证人物、目标归属和容量。只有目标仍合法且可接收时才调用现有 Core LCG 一次；结果百分位大于 20 时全额入库，否则货物全损。
- 目标易主、目标满载、执行者失效或无城不抽 RNG。货物按源城、目标城、己方城市、全城市的稳定优先级逐字段安全退回或接收；任何字段都不得越过 JavaScript safe-integer 上限，无法安置与 Web 一样是事务错误，不允许静默丢失。
- 人物处斩或流放会先取消其活动订单。调动只终止；输送货物按同一安全回退协议结算。

`advance_strategic_orders()` 只提供 MB08 的隔离月结算入口：应用层先推进一个月、重置行动集合，再调用领域推进。城市经济、事件、自然死亡、外交、AI 和胜负顺序仍由 MB11/MB12 统一编排；场景节点不得自行倒计时。

## Runtime 状态

每个战略订单包含：`id`、`kind`、`factionId`、`officerId`、源/目标城市、冻结路线、创建 turn/year/month、`durationMonths`、`remainingMonths` 和三项 cargo。validator 检查：

- ID/引用/日期/安全整数和合法 kind；
- 路线首尾、道路连续、无重复、冻结时长和已流逝月份；
- 活动人物在职、同势力、无驻城且只占用一个订单；
- 货物字段精确、非负、安全整数；
- `nextStrategicOrderSerial` 单调。

外交订单在 MB10 前继续拒绝非空状态，但战略与外交共享人物占用检查，避免产生第二套冲突协议。

## Presentation 查询

`strategic_logistics_query(cityId)` 返回深拷贝 DTO：稳定可达目标及冻结路线/月份、执行者及每种命令可用性、规则集成本、源城货物上限、活动订单和不可用原因。地图以原生绘制显示金色预览与青色在途路线；面板不寻路、不算容量、不调用 RNG。

触控端提供 48px 级模式、目标、执行者、签发和推进按钮。Godot `SpinBox` 保留给鼠标/键盘精细输入；“三类小批”触控键一次把三种货物各填为 `min(10, 当前上限)`，解决原生小箭头在 Android 触摸源下命中不稳定的问题。

## 证据

- `godot/data/fixtures/application-session-suite-v1.json`：125 路完整应用事务、2 路独立路线案例和 2 路生命周期取消案例，含直达/多段/天然同长/断路、成功/受损、条件 RNG、三类货物跨城分摊、源城失守、无城君主、生命周期源/目标优先与 `sourceIndex` 回收、容量与安全整数、目标易主、全城无容量原子回滚、稳定订单顺序、closed-shape 损坏输入和失败原子性。
- `npm run godot:application-session:verify`：Godot 4.7.1 共 928 项断言，与 TypeScript result core、receipt、state、canonical SHA-256、生命周期日志和精确 seed 一致。
- `npm run godot:project:verify`：156 项领域/历史断言、109 项主场景表现与输入断言。
- MB08 完成报告记录 1280×720、844×390 与最终 Android Debug APK 的设备证据。
