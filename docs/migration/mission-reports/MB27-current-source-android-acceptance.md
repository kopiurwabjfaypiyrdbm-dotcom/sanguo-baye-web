# MB27 当前源码 Android 验收与 Goal 决策报告

## 最终决策（2026-08-04）

**MB00 Goal：不通过，不算完成。程序 Goal 保持 `active`。**

用户人工触控验证结论：

- 当前 Godot Android 客户端**无法以触控正常游玩**；
- 玩法与交互**质量严重不达标**；
- 因此 **Android-first 验收失败**，不得将自动化门禁、ADB/键盘诊断或冷启动成功表述为 Goal 完成。

MB27 作为决策 Mission **关闭**：证据已足够作出“不通过 / 继续整改”的结论，而不是“等待不可得证据”的空等。后续必须先做可玩性整改，再重新进入 Goal 门。

## 决策含义

| 项 | 结论 |
|---|---|
| MB00 Outcome | **未达成** |
| Android-first P1 | **失败（质量）**，非“尚未观察” |
| 自动化 `npm run check` / presentation runners | 仅证明代码侧准备度，**不能覆盖**本失败 |
| 发布 / 推送 / PR | 仍然禁止，直至用户另批 |
| 下一动作 | 启动可玩性整改 Mission（MB28），见 Brief |

## 当前源码 APK（决策时基线，非合格候选）

- 路径：`godot/builds/sanguo-baye-godot-mb27-touch-debug.apk`
- 导出：Godot 4.7.1 stable `a13da4feb`，GDScript，2026-08-04 12:17:16
- 大小：57,825,764 bytes；SHA-256：`6498C8B827D34385EB8E9B6B71F4C69E8283A447D173367306F4454BAF80EBE8`
- 包：`com.sumo91.sanguobaye.godotspike`，versionName `0.1.0-spike`
- 该 APK 仅作失败验收基线与回归对照，**不是**发布候选。

## 此前自动/诊断证据（不提升为通过）

- MuMu 安装与冷启动、键盘进入战役设置、高密度/安全区/战役卡片等代码侧修复与 runners 通过记录仍有效，但**已被人工触控失败结论压过**。
- ADB tap / 无可见窗口会话等不得再写作触控通过。

## 自动回归（历史，非 Goal 证据）

- tactical presentation、production save/recovery、campaign setup presentation、Web 378 tests、聚合 `npm run check` 等曾通过；在 Goal 门上**无效化为通过理由**。

## 本轮关闭说明

- 不修改 MB00 固定条款。
- 不把 Web 对齐功能补齐（征兵/出征等）冒充触控可玩性通过。
- 对齐计划 [`godot-web-alignment-plan.md`](../godot-web-alignment-plan.md) 继续有效，但 **Wave 0 Goal 门已判定失败**；可玩性整改优先于或至少不晚于军事对齐切片进入验收。
