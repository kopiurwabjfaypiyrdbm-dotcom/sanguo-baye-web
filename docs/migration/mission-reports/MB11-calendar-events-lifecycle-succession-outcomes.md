# MB11 月历、城池事件、人物生命周期、继承与结局完成报告

日期：2026-08-03  
引擎：Godot 4.7.1 stable official `a13da4feb`  
语言：GDScript  
分支：`codex/godot-migration-spike`

## 结果

MB11 已把月历、城池灾害、年度人物/道具阶段、俘虏逃脱、自然死亡、君主继承、势力瓦解和玩家胜负接入同一套纯 `GameState`/`GameSession` 闭包。`Node`/`Control` 只读取快照、显示纪事并提交意图；权威状态、LCG seed、canonical JSON/SHA-256、事务命令和校验器不挂在场景树中。

新增领域/应用边界为：

- `godot/src/domain/progression/calendar_events.gd`：固定城市顺序、灾情影响/恢复、条件式 LCG 和日志 receipt。
- `godot/src/domain/progression/annual_progression.gd`：跨年一次性年度阶段、年龄、未来人物和道具入库去重。
- `godot/src/domain/progression/officer_lifecycle.gd`：逃脱、自然死亡政策、人物引用/装备/订单清理及继承候选排序。
- `godot/src/domain/progression/campaign_outcome.gd`：victory/defeat、在途订单终止、结束态幂等。
- `godot/src/application/commands/succession_adapter.gd`：玩家继承选择的事务边界。
- `godot/src/presentation/campaign_chronicle_panel.gd` 与对应场景：年月、事件日志、灾情文本、候选继承人、结局和明确的技术样片验收入口。

`GameSession.restore_snapshot()` 现在保留不可变的初始战役来源，同时允许合法继承后当前君主改变，避免恢复时把继承人错误还原为开局君主。

## 规则身份与确定性证据

固定参考入口为 `references/vendor/baye-c-core/src/infdeal.c:CitiesUpDataDate/RandEvents/EventStateDeal/GoodsUpDatadate/PersonUpDatadate`、`tactic.c:ConditionUpdate`、`citycmdd.c:LostEscape/KingOverDeal/KingDeadNote`。Godot 是独立 GDScript 重写，不链接 C、TypeScript 或 GPL Web 包；当前 TypeScript 产品是可执行行为 oracle。原版证据、固定移植配置和现代产品政策在 `references/parity-matrix.md` 与 `references/provenance/code.md` 分开记录。

共享 `godot/data/fixtures/application-session-suite-v1.json` 已扩展为 242 路事务：12 路 `lifecycleOutcomeCases` 覆盖逃脱启用/禁用、自然死亡启用/非一月 no-op、玩家继承暂停/恢复、AI 继任、无继承瓦解、victory/defeat，以及 victory/defeat 同时带战略运输和外交订单的终止闭包；4 路 `annualProgressionPeriodCases` 分别覆盖时期 1–4 的跨年；6 路新增 validator 负例覆盖 `pendingSuccession`、阶段/结局关系及畸形嵌套。所有序列比较 result、receipt、日志、完整 canonical state SHA-256 和精确 seed。

| 序列 | 初始 SHA-256（前 8） | 最终 SHA-256（前 8） | seed | 结果 |
|---|---|---|---|---|
| `captive-escape-success` | `74fd531c` | `d5fed6f1` | `1972 → 628748038` | 俘虏按稳定顺序逃脱并回城 |
| `natural-death-non-ruler` | `702ca80c` | `ddeb5224` | `1972 → 1380227` | 非君主死亡并留下审计日志 |
| `player-ruler-death-pauses-for-succession` | `74bd11a4` | `5c113204` | `48641` | 进入 `succession`，候选为 `officer-34,37,36,32,33,35` |
| `resolve-player-succession` | `5c113204` | `f48c6a26` | `48641` | 李典继任，恢复 `player` 阶段 |
| `ai-ruler-deterministic-successor` | `74bd11a4` | `ede30de9` | `48641` | 关羽按稳定候选规则继任 |
| `player-faction-dissolves-without-successor` | `ec259e51` | `2de2e3a3` | `48641` | 无继承人进入 `ended/defeat` |
| `campaign-victory` | `03bd8b16` | `41d79c9a` | 不耗 RNG | 所有敌对势力失地后 `ended/victory` |
| `campaign-defeat` | `74a9b41d` | `2dbaeab8` | 不耗 RNG | 玩家失去全部城池后 `ended/defeat` |
| `campaign-victory-with-active-orders` / `campaign-defeat-with-active-orders` | 由 fixture 生成 | 由 fixture 生成 | 订单终止不额外抽取 | 战略运输 escrow、外交执行者和日志在结局前闭合 |

`npm run godot:application-session:verify`：fixture 生成 242 路通过，Godot 应用 1563 项断言通过。`npm run godot:project:verify`：领域 211、表现/输入 197 项断言通过，资源导入和主场景启动通过。表现烟测明确验证：普通推进在 `succession` 被拒绝且 digest/seed 不变；继承后 faction ruler 更新、pending 清除；结束态推进是无状态变化 no-op；纪事打开会清除物流/侦察/外交预览并使用可滚动日志区；灾情使用“水/水灾/防灾”文字和非颜色 badge，不泄漏敌城情报。继承恢复还与连续生命周期路径比较了下一条命令的 receipt、完整 state 和 SHA。

## Android 与横屏设备证据

指定引擎重新导出 Debug APK：

- 文件：`godot/builds/sanguo-baye-godot-mb11-reviewed-debug.apk`（本地忽略产物）
- 大小：57,619,209 bytes
- SHA-256：`029D6D959803D26E9D7E79668F3C29450374B2BAE165745CD2149E3161312C9B`
- 包：`com.sumo91.sanguobaye.godotspike`，min SDK 24，target SDK 36
- ABI：`arm64-v8a`、`x86_64`；APK v2/v3 签名有效；无权限声明
- 包审计：228 个条目，未发现 Web/JS/TS/HTML/CSS/WASM、测试/fixture、`dat.lib`、字体、音频、视频或 vendor/reference 路径。

MuMu `emulator-5554`（Android 15/API 35，模拟器证据，不表述为真机）已通过 `adb install -r` 覆盖安装并离线启动。1280×720 实测打开“纪事”，触发水灾反馈，触发君主自然死亡，选择李典拥立并显示“新君已拥立”，再触发并显示“战役胜利”。844×390 重复启动和纪事/继承路径；面板在状态栏上方完整可见，候选选择、拥立和三个验收入口均保留 48px 级物理触控目标。截图保存在被忽略的 `godot/builds/mb11-*.png`，最终已恢复 MuMu `2560×1440` override。

logcat 显示 Godot 4.7.1、`OnGodotSetupCompleted`、`OnGodotMainLoopStarted`，未出现 `SCRIPT ERROR` 或 `FATAL EXCEPTION`。首次启动的 GLES shader cache 重编译警告为引擎缓存提示，不是脚本或崩溃问题。

## 自检、审查与已知风险

- `npm run check` 必须在提交前通过，Web 版路径、规则 oracle 和构建保持不变。
- 三路只读终审均为 P0=0、P1=0、P2=0。架构审查提出的结束态全局订单清理、畸形人物字段防崩溃和 ended 关系校验已修复；确定性审查提出的 succession/ended 月推进 guard、活动订单结局 fixture 和连续/恢复下一步对照已补齐；移动审查提出的纪事 stale preview 清理与长日志裁剪已通过可滚动 `ScrollContainer` 修复。
- `naturalDeath`、月度逃脱、继承候选和胜负关闭的默认值是当前产品的版本化规则，不声明为 BBK 默认配置；`SysRand` 设备序列仍未被虚构为已知事实。
- MB11 只提供供 MB12 调用的确定性阶段和玩家继承暂停点，不实现战略 AI 完整月循环；完整战略 AI/月份协调、战术战场、生产多槽存档仍按路线图属于后续 Mission。

## 人工复验步骤

1. 用 `D:\03_Godot\01_Engine\Godot_v4.7.1-stable_win64.exe` 打开 `godot/project.godot`，运行主场景并确认时期 1 的 38 城地图。
2. 点右上“纪事”，确认年月、日志和技术样片入口；点“水灾反馈”，确认濮阳节点出现“水”标记、纪事显示水灾和防灾值。
3. 点“继承决策”，确认曹操失效、月份/普通命令冻结；从候选中选择李典并点“拥立”，确认回到玩家阶段且状态栏显示新君已拥立。
4. 点“胜利结局”，确认所有地图节点转为我方旗帜，纪事显示战役胜利；结束后尝试推进，确认状态和 seed 不变化。
5. 在 MuMu 以 `adb shell wm size 1280x720` 和 `844x390` 重复步骤 2–4，确认面板不遮挡底部状态栏；验收后恢复 `adb shell wm size 2560x1440`。
