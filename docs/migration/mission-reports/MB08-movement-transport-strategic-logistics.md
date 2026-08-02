# MB08 跨城调动与战略输送完成报告

日期：2026-08-03  
引擎：Godot 4.7.1 stable official `a13da4feb`  
语言：GDScript

## 结果

生产 `GameSession` 已支持己方城市间的确定性武将调动和金钱、粮草、后备兵输送。纯 `RefCounted` 领域模块实现稳定己方道路 BFS、事务式签发、冻结路线、多月推进、条件式 LCG、目标易主/满载/失地回退、人物在途安置与生命周期取消；application adapter、query 和完整 runtime validator 已把战略订单升级为生产状态。场景树只调度并表现这些能力。

原生战略地图新增金色路线预览、方向反馈和青色活动订单路线；城池空间卡片新增“后勤”入口。紧凑原生面板显示模式、目标、月份、执行者、三类货物、立即扣除与 20% 级风险、活动订单和推进入口。针对实机发现的 Godot `SpinBox` 触摸箭头命中问题，新增 52px“三类小批”快捷键，保留精细鼠标/键盘输入。

## 确定性与状态证据

共享 application-session fixture 从 83 路扩展至 125 路事务，另有 2 路独立路线案例和 2 路生命周期取消案例；Godot 应用断言从 723 项扩展至 928 项。新增序列覆盖两段调动、生产时期 3 天然同长路线、合法断路、成功输送、seed `1972` 受损、目标满载/易主、源城失守、三类货物跨三城分摊、全城无容量原子回滚、无城君主输送和两订单稳定处理，以及空货、负数、非整数、库存不足、多余字段、安全整数溢出、损坏城市/邻接/cargo 输入、已行动和体力不足。生命周期案例另固定源城失守时仍按 Web 源/目标优先回收，以及其余候选按 `sourceIndex`、ID 而非城市 ID 字符串排序。

TypeScript oracle 与 Godot 对每步 result core、receipt、返回 state、before/after canonical SHA-256、订单、人物、城市货物、日志和精确 seed 逐项比较。`strategic-order-10`/`strategic-order-2` 合成状态明确固定受约束 ASCII ordinal 顺序，能识别数值排序或容器遍历错误。只有有效抵达分支调用 LCG；目标满载/易主等结构分支保持 seed 不变。

validator 现对订单/cargo 执行 closed-shape 检查，并验证严格 `strategic-order-[1-9][0-9]*` ID、kind、引用、冻结路线与道路、日期和已流逝月份、三项安全整数货物、单人物唯一活动订单、在途/驻城互斥及递增序号。无城势力的君主约束与 Web 对齐；生命周期取消 helper 的成功返还与无容量失败均有纯领域原子性测试。外交订单仍留待 MB10。

## 原生交互与设备

- 1280×720：时期 1 马腾合法多城样例显示西凉→安定/天水的原生路线；实机签发并完成韩遂跨城调动，月份从 190-1 推进至 190-2，seed 不变。
- 1280×720：实机触摸“三类小批”后签发韩遂输送，源城金 `202→192`、粮 `436→426`、后备兵因库存为 0 保持 0，seed 在签发时保持 `48641`；推进后 seed 为 `373686124`，状态栏明确显示“途中受损、10 金/10 粮全部损失、人员返回西凉”，不再只显示订单消失和 seed。
- 844×390：完整后勤面板、路线、活动订单与“推进一月 / 三类小批 / 签发输送”三按钮行动行均在状态栏上方，无全局滚动或横向溢出；主要控件保持 48px 级目标。
- 最终包覆盖安装和离线启动成功，`DisplayFrames` 已分别验证 1280×720 与 844×390；日志显示 Godot 4.7.1、OpenGL ES 3.2、`OnGodotSetupCompleted` 和 `OnGodotMainLoopStarted`，无 script error 或 fatal exception。验收后 MuMu 恢复为 2560×1440 override。

## 验证检查点

- `npm run godot:application-session:verify`：125 路事务、2 路独立路线、2 路生命周期取消案例、Godot 928 项断言通过。
- `npm run godot:project:verify`：156 项领域/历史断言、109 项表现与输入断言、editor import 和主场景启动通过。
- `npm run check`：程序恢复演练、四时期数据、125 路应用事务、51 个只读 C 参考文件、375 个 Web 测试（另 4 个条件性跳过）及生产构建通过。
- 最终 Debug APK：`godot/builds/sanguo-baye-godot-mb08-debug.apk`，57,472,471 bytes，SHA-256 `CB2D1EC630321945B5344A5D8AEB674C8B6A2A32EB9260C267EE702C33C34F31`。包内 196 个条目；扫描未发现 Web runtime、tests/fixture、`builds/`、WASM、`dat.lib`、字体、音频、视频或 vendor reference。

## 规则身份

固定 C 证据入口为 `references/vendor/baye-c-core/src/citycmd.c:TransportationDrv/MoveDrv` 与 `citycmdc.c:TransportationMake/MoveMake`。Godot 与 Web 的多月己方道路、现代规则集成本、20% 级货损、安全整数上限和回退分摊属于当前产品语义，由共享 fixture 提供差异验证；本 Mission 不提升其原设备兼容等级。

## 边界与后续

MB08 的 `advance_strategic_orders()` 是隔离结算能力，不是完整月循环。侦察/情报属于 MB09，外交订单属于 MB10，事件/生命周期/继承/胜负属于 MB11，AI 与完整月度编排属于 MB12。征兵与城内兵力分配应在 MB12 的战略闭环收口前明确纳入战略命令归属；本 Mission 未擅自扩展。

正式全局订单浏览器、AI 后勤、生产存档 schema、战斗出征物流和运输动画均未实现。

## 审查关闭

- 架构/场景树：把无法安置货物的 `assert` 改为可恢复、全字段预检后提交的 failure 链；`advance`、人物生命周期取消和 application 均保持原子。战略订单/cargo 加入 closed-shape，ID grammar、路线、时钟、重复执行者和序号均有负例。目标 cargo 上限、目标不可用原因和风险阈值由 domain query 单一提供，Control 不再组合库存规则；终审 P0/P1/本阶段 P2 清零。
- 确定性/fixture：修正伪 success seed，补 seed `0` 的真实入库、天然同长路线、断路、源城失守、逐字段跨城分摊、全城无容量回滚、无城君主、生命周期源/目标优先与 `sourceIndex` 回收，以及稳定 `10/2` 订单顺序；终审 P0/P1/本阶段 P2 清零。
- Android/触控：为不可靠的 `SpinBox` 小箭头增加 52px“三类小批”路径；推进状态栏消费 receipt 结算日志，在途摘要显示 cargo，每目标满载原因可读。1280×720/844×390、109 项表现烟测和最终 APK 实跑通过；终审 P0/P1/本阶段 P2 清零。
