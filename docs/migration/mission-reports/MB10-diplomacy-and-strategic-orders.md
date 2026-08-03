# MB10 外交谋略与跨月战略命令完成报告

日期：2026-08-03  
引擎：Godot 4.7.1 stable official `a13da4feb`  
语言：GDScript

## 结果

Godot 生产 `GameSession` 已拥有离间、招揽、策反、劝降四类真实外交谋略。纯 `RefCounted` 领域模块负责可用性、规则集成本、事务式签发、一个月在途状态、Baye 兼容 RNG、数字序号结算、人物/城市/势力/俘虏闭包、日志和完整 runtime 校验；`Node`/`Control` 只消费净化查询并提交意图，没有在场景树保存权威 `GameState` 或随机状态。

原生城市空间卡片新增“谋略”入口。外交面板显示四类命令、来源、报告人物、执行武将、精确成本、回报月数、禁用原因和在途订单；目标文本明确标注报告年月并声明不显示实时忠诚、智力和位置。地图使用 Godot `_draw()` 与 Tween 绘制紫色空间轨迹、节点环和结算脉冲，动画不控制提交。

## 规则身份与确定性证据

固定参考入口为 `references/vendor/baye-c-core/src/citycmd.c:AlienateDrv/CanvassDrv/CounterespiongeDrv/InduceDrv`、`citycmdc.c:*Make`、`tactic.c:ComputerTacticDiplomatism`、`order.h` 和 `attribute.h`。Godot 的 `baye_diplomacy.gd` 保留固定比较顺序、无符号宽度、性格阈值、严格比较和隐藏对话 RNG 消耗。`TimeCount=10` 的单位与运行时成本表未证实；一月持续时间、classic 离间/招揽/策反 20 体力、劝降 10 体力、四者 50 金，以及 modern 四者 4 体力/50 金均如实标为产品规则。

共享 `application-session-suite-v1.json` 当前包含 212 路事务。四类成功主序列的完整 SHA/seed 为：

| 序列 | initial SHA-256 | final SHA-256 | seed |
|---|---|---|---|
| alienate | `85f0560d...a86530` | `341e1605...a36736` | `1 → 2165703038` |
| canvass | `457e11b5...2c4783` | `388dec28...4700f0` | `2 → 3079534013` |
| counterespionage | `b2ec4c51...e781eb` | `ada7fb3e...09ff52` | `1 → 1` |
| induce | `6d9756a7...126b99d` | `58b548d6...18378b` | `8 → 1276464017` |

边界与 14 条结算序列覆盖 classic/modern 成本、当月/旧式/过期情报、目标移动或改属、执行者行动/体力/金钱、序号耗尽与超出 safe-integer、未知/缺失字段、四类成功、离间/招揽/策反/玩家劝降/AI 劝降失败及其不同对话占位抽数、目标失效/优势条件消失/执行者状态改变不耗 RNG、序号 9/10、装备有效智力、来源城易主后的稳定回城、执行方无城时转在野、战略与外交订单同月并存、反叛势力复用与俘虏释放、劝降吸收时清理旧势力战略订单并恢复俘虏。所有序列均比较 command result、receipt、日志、完整 canonical state SHA 与精确 seed；在途 snapshot 恢复结算与连续结算逐字段相同。

validator 新增外交订单 closed-shape、类型、引用、日期/turn、持续月份、moneyCost、执行者唯一占用、next serial 单调/安全整数和结束态不得残留订单的负例；畸形 `turn` 配合非空订单也只返回问题列表。`GameSession` 以固定顺序原子结算战略、外交两类订单，两个入口只增加一次月份并在全部完成后统一校验。领域还提供战役结束前的 `terminate_all`，稳定返城或释放执行者并追加中止日志。Godot 应用验证最终通过 1386 项断言；项目验证通过 186 项领域断言和 174 项表现/触控断言。

## 情报可见性

外交 query 只从当前 turn 报告保存的 `officerIds` 建立目标。DTO 仅保留 ID、名字、报告城池/势力和观察时间；应用测试逐项禁止 `loyalty`、`intelligence`、`stamina`、`troops`、实时 `cityId` 和实时 `factionId`。目标移动后仍只显示报告证据，签发返回统一的“目标无效或情报已经过期”；旧报告和无人物列表的兼容报告不生成目标。

应用查询还在入口验证来源城属于玩家；传入敌城 ID 会返回 `found: false`、空 `sourceCity` 和空外交 DTO，不再暴露敌城完整实时资源。

## Android、触控与包审计

- 审查修复后最终 APK：`godot/builds/sanguo-baye-godot-mb10-reviewed-debug.apk`，57,564,508 bytes，SHA-256 `67695DACAD7244984D32D942D36B04AAA5B851BB568F33638992F911F7622926`。
- MuMu 1280×720：覆盖安装、离线启动；从濮阳触控“侦察”，取得西凉 190 年 1 月人物名单；打开“谋略”，以夏侯惇签发对韩遂的离间，界面显示 50 金/20 体、余 1 月、seed 保持 48641；触控“结算回报”后进入 190 年 2 月，失败日志可见，seed 为 860746715。
- MuMu 844×390：重复同一完整闭环；六入口城市卡片、三个选择器、证据/在途/成本文本、签发/结算/关闭按钮均位于状态栏上方，48px 级触控目标可用，无横向溢出。验收后 override 恢复为 2560×1440。
- 审查修复后的 APK 已通过 `adb install -r` 覆盖安装并启动；进程保持运行。logcat 显示 Godot 4.7.1、`OnGodotSetupCompleted` 与 `OnGodotMainLoopStarted`，未出现 `SCRIPT ERROR` 或 `FATAL EXCEPTION`。这些是 MuMu 模拟器证据，不表述为真机结果。
- 最终 APK 有 214 个条目，原生架构为 arm64-v8a/x86_64；manifest 没有申请权限，v2/v3 签名有效。扫描未发现 Web/JS/TS/HTML/CSS/WASM、tests/fixture、`builds/`、vendor reference、`dat.lib`、原版/不明字体、音频或视频。`aapt2` 仍报告既有 themed icon 引用警告，不影响安装/启动，正式图标属于后续客户端打磨范围。

## 回归与限制

`npm run check` 通过：47 个测试文件、376 项 Web 测试、Godot program 恢复检查、领域数据、共享 fixture、reference allowlist 和生产构建全部成功。`npm run godot:application-session:verify` 与 `npm run godot:project:verify` 均通过。现有 Web 路径、运行产品与规则 oracle 未被替换。

三路只读审查最初发现 4 个 P1 和 3 个本阶段 P2：两类订单不能同月并存、敌城查询泄漏、畸形 turn 转换、结束态闭包缺失，以及 RNG 分支证据、safe-integer、跨城预览同步不足。全部修复并补回归后，架构、确定性规则、Android/触控三路定向复审均为 P0=0、P1=0、P2=0。

MB10 不包含战略 AI 自动发起谋略、包含经济/事件/AI 的完整月循环编排、事件/继承/结局、生产多槽存档或正式美术。它只新增两类在途订单共享的原子月份协调器与结束前订单终止原语；AI 和完整月循环仍属于 MB12，事件与继承/结局编排属于 MB11，生产存档属于 MB20。反间、朝贡、联盟、停战、婚姻和人物关系网继续不在本 Mission。

## 人工复验步骤

1. 用指定 Godot 4.7.1 打开 `godot/project.godot` 并运行现有主场景，确认时期 1 的 38 城地图启动。
2. 选择己方濮阳，点“侦察”，选择西凉并执行；确认 seed 不变且面板变为 190 年 1 月报告。
3. 关闭侦察，在濮阳空间卡片点“谋略”；确认目标为报告中的韩遂/马超，成本为 50 金/20 体，并且目标文案没有忠诚、智力、兵力或实时位置。
4. 签发离间，确认紫色空间轨迹、在途“余 1 月”和 seed 保持 48641；点“结算回报”，确认进入 190 年 2 月、订单消失、执行者返回且状态栏显示结果与 seed。
5. 在 MuMu 分别以 `adb shell wm size 1280x720` 和 `844x390` 重复步骤 2–4；结束后恢复 `adb shell wm size 2560x1440`。
