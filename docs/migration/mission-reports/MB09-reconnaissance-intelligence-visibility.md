# MB09 侦察、情报快照与可见性完成报告

日期：2026-08-03
引擎：Godot 4.7.1 stable official `a13da4feb`
语言：GDScript

## 结果

生产 `GameSession` 已支持确定性城市侦察。纯 `RefCounted` 领域模块负责可用性、classic/modern 成本、稳定目标与人物排序、原子资源扣减、行动登记、覆盖式情报报告、日志和可见性判定；统一 command adapter、query 与 runtime validator 将 `intelReports` 纳入生产状态。`Node`/`Control` 只调度命令并渲染 visibility DTO，没有将规则或权威状态放入场景树。

原生城池空间卡片新增“侦察”入口，敌城卡片明确区分“情报未知”和带观察年月的旧报告。侦察面板显示来源、目标、执行者、成本、禁用原因与报告摘要；地图用 Godot 原生 `_draw()` 和 `Tween` 表现青色来源—目标扫描，不依赖动画完成提交状态。

## 确定性与状态证据

共享 application-session fixture 从 125 路扩展至 150 路事务，Godot 应用断言从 928 增至 1036。MB09 新增两步连续序列：经典成功报告后，在不改旧报告的情况下改变目标实时金钱与驻将，再用另一执行者覆盖报告。另有 11 个边界案例，覆盖 modern 成本、未知来源、己方目标、异地/已行动武将、体力/金钱不足、聚合兵力安全整数溢出、`officer-100` 先于 `officer-99` 的稳定 ID 次序、稳定未知参数和缺失参数；12 个 validator 负例覆盖畸形 record、未知/缺失字段、未来 turn/calendar、重复/未知人物、人数不一致、key/cityId 不一致，以及合法报告与畸形 calendar/turn/calendar 成员并存时返回 issues 而不崩溃。旧式无 `officerIds` 报告可恢复且不会被查询补造名单。

经典首步 state SHA 从 `74bd11a4ad3bc131979749534878570cca20c4b2d2f7b494c31ae48b6576ee38` 变为 `d84621f796e1ec01cc745b86c2c7d0fddea58770e8faf3824a46613f18a4628d`；seed 始终为 `48641`，濮阳金钱 `135→115`，曹操体力 `100→90`。西凉报告固定 190 年 1 月、金 202、粮 436、人物 `officer-56/officer-57`、2 将与 200 兵。覆盖步骤把新观察值更新为金 777、单将 100 兵，不受第一次报告引用影响。旧式报告 canonical SHA 为 `ffc30eff6bf92ff0277cb789c66130af5d366d8642b6428d5a60018cf3c1072b`。

保存恢复通过 `restore_snapshot()` 演练：完整 validator 和 canonical SHA 通过后一次替换状态，恢复后的 visibility DTO 与恢复前逐字段一致。该能力仍是 MB04 范围的内存恢复证据，不冒充 MB20 的生产多槽存档与 schema 迁移。

## 可见性边界

- 己方城市返回实时状态并显示“己方实时”。
- 未侦察敌城只显示公开城名与当前势力，资源、治理、人物和兵力均显示为未知。
- 已侦察敌城只显示持久报告、观察年月和旧情报标记；测试在实时目标金钱变化后仍显示旧报告值。
- 报告人物名单保存当时 ID；旧报告缺名单时不读取实时驻将补齐。

战略地图为了节点与势力色仍持有只读战役快照；敌城敏感详情只消费 visibility DTO，snapshot 仅提供公开城名/归属与己城实时字段。表现/输入与应用断言共同覆盖未侦察不泄漏、缺失/伪造 visibility fail-closed、敌城来源查询净化、报告不追踪实时变化、面板排序/成本/禁用原因、原生扫描竞争、静态标签与公开势力可读性、触控目标和真实 command envelope 执行。

## Android 与触控结果

- 1280×720：从濮阳空间卡片实际触控打开侦察面板，西凉显示“未知”；执行后原生扫描线与节点环反馈可见，报告显示 190 年 1 月、2 将/200 兵、金 202、粮 436，状态栏显示日志与 seed `48641`。随后打开西凉卡片，只显示保存报告。
- 844×390：城池卡片五个入口、侦察面板、两项选择器、执行与关闭按钮完整位于状态栏上方；实际触控完成同一侦察。主要控件由响应式布局保持 48px 级物理目标。另打开未侦察安定，卡片以两行紧凑文案只显示公开城名、当前势力和“未侦察”，底边保持在状态栏上方；西凉旧报告卡片同样无重叠或横向溢出。
- APK 覆盖安装、离线启动成功。日志显示 `OnGodotSetupCompleted`、`OnGodotMainLoopStarted`、Godot 4.7.1 与 OpenGL ES 3.2，无 `SCRIPT ERROR` 或 `FATAL EXCEPTION`。以上均为 MuMu 模拟器证据，不表述为真机证据。验收后分辨率 override 恢复为 2560×1440。

## 验证检查点

- `npm run godot:application-session:verify`：150 路事务、1036 项 Godot 应用断言通过。
- `npm run godot:project:verify`：156 项领域断言、151 项表现/触控断言、editor import 和主场景启动通过。
- 最终 Debug APK：`godot/builds/sanguo-baye-godot-mb09-debug.apk`，57,506,097 bytes，SHA-256 `3A6AE836A9B76650A4D103FE9ECC1FBE23C04A9B1025DB93D9BAA60FEB98F322`。
- 包内 204 个条目；manifest 没有申请权限；扫描未发现 Web runtime、tests/fixture、`builds/`、WASM、`dat.lib`、字体、音频、视频或 vendor reference。

## 审查关闭

实施完成后分别派发只读架构、确定性规则、Android/触控审查。三路最终结论均为 P0=0、P1=0、P2=0。审查期间关闭了查询 DTO 泄漏与重复深拷贝、validator 畸形类型崩溃、安全整数聚合溢出、稳定 ASCII ID 次序、扫描预览 Tween 竞争和 844×390 紧凑敌城卡片与状态栏重叠；修复后重新运行共享 fixture、Godot 项目验证、Web 全量检查、APK 导出与 MuMu 双尺寸触控复验。

## 规则身份与边界

C 证据入口为 `references/vendor/baye-c-core/src/citycmd.c:ReconnoitreDrv`、`citycmdc.c:ReconnoitreMake` 和 `order.h`。经典 10 体力/20 金有固定参考依据；Godot 与 Web 的持久快照、观察时间、人物名单、modern 4 体力/50 金和可见性呈现属于当前产品语义，由共享 fixture 提供跨客户端差异验证，不提升为原设备一致。

外交谋略及其情报目标锁定属于 MB10；月度情报策略与战略 AI 属于 MB12；生产存档 schema、多槽与全局导航分别属于 MB20/MB21。本 Mission 不实现战场视野、逐单位战争迷雾或正式美术。

## 人工复验步骤

1. 用 Godot 4.7.1 打开 `godot/project.godot` 并运行主场景，确认 38 城地图启动。
2. 选择己方濮阳，点“侦察”，确认西凉初始标为未知且成本为 20 金、10 体力、不使用随机数。
3. 点“执行侦察”，观察青色扫描反馈；核对状态栏 seed 仍为 48641，面板显示 190 年 1 月、2 将/200 兵、金 202、粮 436。
4. 关闭面板和濮阳卡片，再点西凉；确认只显示报告及观察年月。点任一未侦察敌城，确认不显示实时资源、人物或兵力。
5. 在 MuMu 分别用 `adb shell wm size 1280x720` 与 `844x390` 重复步骤 2–4；结束后恢复原 override。
