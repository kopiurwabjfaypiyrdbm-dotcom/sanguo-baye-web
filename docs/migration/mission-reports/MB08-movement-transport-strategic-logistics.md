# MB08 跨城调动与战略输送完成报告

日期：2026-08-03  
引擎：Godot 4.7.1 stable official `a13da4feb`  
语言：GDScript

## 结果

生产 `GameSession` 已支持己方城市间的确定性武将调动和金钱、粮草、后备兵输送。纯 `RefCounted` 领域模块实现稳定己方道路 BFS、事务式签发、冻结路线、多月推进、条件式 LCG、目标易主/满载/失地回退、人物在途安置与生命周期取消；application adapter、query 和完整 runtime validator 已把战略订单升级为生产状态。场景树只调度并表现这些能力。

原生战略地图新增金色路线预览、方向反馈和青色活动订单路线；城池空间卡片新增“后勤”入口。紧凑原生面板显示模式、目标、月份、执行者、三类货物、立即扣除与 20% 级风险、活动订单和推进入口。针对实机发现的 Godot `SpinBox` 触摸箭头命中问题，新增 52px“三类小批”快捷键，保留精细鼠标/键盘输入。

## 确定性与状态证据

共享 application-session fixture 从 83 路扩展至 106 路事务，Godot 断言从 723 项扩展至 838 项。新增序列覆盖两段调动、成功输送、seed `1972` 受损、目标满载、目标易主、两订单稳定处理，以及空货、负数、非整数、库存不足、多余字段、安全整数溢出、已行动和体力不足。

TypeScript oracle 与 Godot 对每步 result core、receipt、返回 state、before/after canonical SHA-256、订单、人物、城市货物、日志和精确 seed 逐项比较。`strategic-order-10`/`strategic-order-2` 合成状态明确固定受约束 ASCII ordinal 顺序，能识别数值排序或容器遍历错误。只有有效抵达分支调用 LCG；目标满载/易主等结构分支保持 seed 不变。

validator 现检查订单 ID、kind、引用、冻结路线与道路、日期和已流逝月份、三项安全整数货物、单人物唯一活动订单、在途/驻城互斥及递增序号。处斩、流放等人物失效路径会取消相关战略订单并安全安置货物；外交订单仍留待 MB10。

## 原生交互与设备

- 1280×720：时期 1 马腾合法多城样例显示西凉→安定/天水的原生路线；实机签发并完成韩遂跨城调动，月份从 190-1 推进至 190-2，seed 不变。
- 1280×720：实机触摸“三类小批”后签发韩遂输送，源城金 `202→192`、粮 `436→426`、后备兵因库存为 0 保持 0，seed 在签发时保持 `48641`；此前的有效抵达实测把 seed 推进为 `373686124`。
- 844×390：完整后勤面板、路线、活动订单与“推进一月 / 三类小批 / 签发输送”三按钮行动行均在状态栏上方，无全局滚动或横向溢出；主要控件保持 48px 级目标。
- 最终包覆盖安装和离线启动成功，`DisplayFrames` 已分别验证 1280×720 与 844×390；日志显示 Godot 4.7.1、OpenGL ES 3.2、`OnGodotSetupCompleted` 和 `OnGodotMainLoopStarted`，无 script error 或 fatal exception。验收后 MuMu 恢复为 2560×1440 override。

## 验证检查点

- `npm run godot:application-session:verify`：106 路事务、Godot 838 项断言通过。
- `npm run godot:project:verify`：144 项领域/历史断言、101 项表现与输入断言、editor import 和主场景启动通过。
- `npm run check`：程序恢复演练、四时期数据、106 路应用事务、51 个只读 C 参考文件、375 个 Web 测试（另 4 个条件性跳过）及生产构建通过。
- 最终 Debug APK：`godot/builds/sanguo-baye-godot-mb08-debug.apk`，57,468,375 bytes，SHA-256 `15DAE25780D2537378AA91143EC07E621F32603590DE56FC08AA7E56CE1EC67E`。包内 196 个条目；扫描未发现 Web runtime、tests/fixture、`builds/`、WASM、`dat.lib`、字体、音频、视频或 vendor reference。

## 规则身份

固定 C 证据入口为 `references/vendor/baye-c-core/src/citycmd.c:TransportationDrv/MoveDrv` 与 `citycmdc.c:TransportationMake/MoveMake`。Godot 与 Web 的多月己方道路、现代规则集成本、20% 级货损、安全整数上限和回退分摊属于当前产品语义，由共享 fixture 提供差异验证；本 Mission 不提升其原设备兼容等级。

## 边界与后续

MB08 的 `advance_strategic_orders()` 是隔离结算能力，不是完整月循环。侦察/情报属于 MB09，外交订单属于 MB10，事件/生命周期/继承/胜负属于 MB11，AI 与完整月度编排属于 MB12。征兵与城内兵力分配应在 MB12 的战略闭环收口前明确纳入战略命令归属；本 Mission 未擅自扩展。

正式全局订单浏览器、AI 后勤、生产存档 schema、战斗出征物流和运输动画均未实现。最终三路只读审查及其修复结果将在本报告的审查关闭段补录。

