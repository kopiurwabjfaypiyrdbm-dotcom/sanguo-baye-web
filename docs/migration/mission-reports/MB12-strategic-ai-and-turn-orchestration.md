# MB12 完成报告：战略 AI 与完整月循环

## 结论

MB12 已在 Godot 4.7.1 GDScript 客户端完成。战略客户端现在可以从玩家阶段通过原生“结束本月”入口执行确定性的十步非战术经营序列、在途战略/外交订单、月度经济、城市事件、年度阶段、人物生命周期、继承/结局检查，并回到玩家阶段。战术出征与战斗 AI 仍按边界留给 MB13–MB19。

实现基线提交：`002cb2e feat(godot): implement MB12 strategic turn orchestration`；最终收口提交将在本报告随本阶段代码一并记录。

## 实现范围

- `godot/src/domain/ai/strategic_ai.gd`：按 Web oracle 的十步固定经营顺序运行可审计的经营 AI；已迁移粮食、俘虏、外交、道具、兵力分配、征募后备兵、城市改善、搜索和后勤操作，资源不足、目标失效、君主/太守暴露与无路由安全跳过。战术攻击规划保留到 MB13–MB19。
- `godot/src/domain/progression/monthly_economy.gd`：移植月度金钱/粮食/人口增长、维护、饥荒、驻军损失、季度防灾衰减与体力恢复，保留显式 LCG 调用位置。
- `godot/src/domain/progression/strategic_turn.gd`：编排 AI 阶段、战略/外交订单、月度结算、事件、年度、生命周期和结局，阶段间运行 validator 并生成 receipt。
- `GameSession.advance_turn_month()` 与策略界面“结束本月”按钮：场景只负责输入、忙碌态、摘要/纪事和反馈，核心状态不挂在场景树。
- 共享 `godot/data/fixtures/application-session-suite-v1.json` 新增 7 路月循环案例：四时期月循环、AI 粮食稳定、未冻结但资源/身份阻断的 AI、含活动战略输送订单的月循环，并比较 receipt、日志、完整 canonical state SHA、seed、turn/calendar。应用 runner 另验证 exact duplicate/stale digest、ended/succession guard 和两个月连续与恢复后下一步一致。

## 证据

| 检查 | 结果 |
|---|---|
| Godot 引擎 | `4.7.1.stable.official.a13da4feb` |
| `npm run godot:project:verify` | 通过；领域 211 项、展示输入冒烟 212 项、主场景/导入通过 |
| `npm run godot:application-session:verify` | 通过；250 transaction cases、追加 selector 覆盖/月循环/幂等/守卫后 1689 assertions |
| `npm run check` | 通过；Web 47 个测试文件、378 passed、4 skipped，TypeScript/Vite build 通过 |
| fixture | TypeScript 生成与 Godot 逐案比较通过；MB12 新增 8 strategic-turn cases，含未冻结支持操作、AI selector 覆盖、资源阻断两月 oracle 对照、活动输送与 guard |
| APK | 最近一次成功导出的审查 APK `godot/builds/sanguo-baye-godot-mb12-final-debug.apk`，57,656,845 bytes，SHA-256 `4D64FAE483E38561379A0533A71FBE3DCD83482F54252510F5BD4B8F0426E322`；最终 selector/完整安全纪事改动已由源代码验证覆盖，但本机当前缺少 Godot 4.7.1 Android export template，重新导出待获组件安装授权 |
| MuMu | `emulator-5554` 恢复为 device；修复后 APK 离线安装成功并以 `com.sumo91.sanguobaye.godotspike` 启动。 |
| 设备尺寸 | MuMu override `1280×720` 与 `844×390` 均实际启动、点击“结束本月/结束”并显示公元 190 年 2 月、AI 摘要和战役纪事；最终截图分别为 `godot/builds/mb12-final-mumu-1280x720-end-turn.png` 与 `godot/builds/mb12-final-mumu-844x390-end-turn.png`。 |

设备截图为被忽略的本地证据；验证结束后已恢复 MuMu 原始 `wm size`。1280×720 与 844×390 的点击均通过横屏窗口坐标完成，纪事面板展示月份、诸侯行动摘要和滚动日志。

## 审查

MB12 完成前已派发三路只读审查：

1. Godot 架构与场景树：复核领域/应用/表现边界、AI 与月循环调度。
2. 确定性规则与 fixture：复核排序、RNG、receipt、state SHA、连续/恢复路径。
3. Android/触控体验：复核 4.7.1 APK、MuMu 启动、横屏尺寸、按钮目标、纪事和包审计。

三路最终只读复审结论为 P0=0、P1=0、P2=2。确定性复审提出的外交 loyalty/intelligence/id 与 ruler/唯一守将 guard、道具属性/armsType 过滤、搜索与城市改善排序、俘虏 aggressive 处决 fallback、在途武将粮食支持均已对齐；新增 selector 覆盖 fixture 与 TypeScript/Godot SHA 对照通过。移动复审确认 APK、包审计、MuMu 双尺寸和敌方纪事 ACL 通过；长纪事改为保留完整安全日志并由 ScrollContainer 承载。保留的 P2 是现有应用契约对即时重复命令仍允许返回原始 `ok`（必须保持 TypeScript oracle 语义），以及月循环 receipt 尚未细化为阶段级审计 DTO；战术攻击/出征仍待 MB13–MB19。

## 已知风险与后续

- AI 目前完成战略经营和月循环闭环；攻击决策、战场创建、战术部署与战术 AI 不在 MB12，下一阶段为 MB13“确定性战斗状态、部署与回合框架”。
- MuMu 当前通过上次审查 APK 的离线安装和启动验证；本次最终工作树重新导出受本机缺少 Godot 4.7.1 Android export template 阻塞，真机、正式 Android 性能/签名仍属于后续平台硬化验收。组件安装需用户明确授权。
- 月循环采用当前 Web/modern ruleset 语义，不提升尚未有设备证据的原版 AI 权重、月份单位或默认生命周期策略的原版一致性等级。

## 人工复验步骤

1. 在 Godot 4.7.1 打开 `godot/project.godot`，运行主场景。
2. 横屏 1280×720 与 844×390 下确认 38 城地图、拖动/缩放/点选和“结束本月”按钮。
3. 点击“结束本月”，确认 AI/月份结算后回到玩家阶段，纪事显示新月份、日志与 seed。
4. 用顶栏保存/读取，确认保存前后 state SHA 和下一次月循环结果一致。
5. 在 MuMu 或横屏真机安装上述 APK，断网启动并重复第 2–3 步。
