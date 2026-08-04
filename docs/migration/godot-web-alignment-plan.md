# Godot ↔ Web 产品对齐修正计划

更新日期：2026-08-04  
权威位置：本文件描述**产品对齐意图与切片顺序**；当前执行 Mission 仍以 `godot-program-state.json` 为准。本计划**不**修改 MB00 固定条款，**不**预生成全部 Mission Brief。

## 1. 问题定义

对照 `docs/HANDOFF.md` §2 与 Godot 现状，核心不是「领域一片空白」，而是：

1. **军事可玩闭环未齐**：玩家征兵、兵力分配、正式出征、AI 进攻守城打断缺失；战术多为样片入口。
2. **存档/开局产品壳不对等**：Web 多槽 + JSON 导入导出 + ruleset 选择；Godot 单档路径且生产锁 classic。
3. **Goal 验收失败**：MB27 用户人工触控结论为无法游玩、质量严重不达标；**Goal 不通过**（见 `mission-reports/MB27-current-source-android-acceptance.md`）。功能对齐不得冒充 Goal 完成。
4. **证据口径不可混**：Web-oracle 对齐 ≠ BBK 原机对齐；对齐修正默认只追 Web 产品语义。

## 2. 目标与非目标

### 目标

在保留 Web 为 oracle 与回退基线的前提下，使 Godot 客户端达到与 Web **同一玩家军事与战役产品闭环**：

- **先决**：Android/横屏触控达到可连续游玩质量（MB28），再次 Goal 评估前必须通过人工复验。
- 玩家可征兵、分兵、对邻城出征（快速结算 / 手动战场）。
- AI 进攻玩家时可暂停月度、进入守城战斗，结束后续推。
- 存档具备多槽与导入导出的最小对等能力（可分 Mission）。
- 开局可显式选择并锁定 `baye-classic-v1` / `modern-balanced-v1`。
- 每一切片有语言无关 fixture + Godot runner + 纳入 `npm run check` 的组件门禁。

### 非目标（本计划不做）

- 宣称 BBK 原机 ABI / `SysRand` / 原版技能目录 / 逐城原版战场一致。
- 用 Godot 替换或削弱 Web 测试与构建。
- 正式美术、商店发布、推送/PR（除非用户另批）。
- 把 gdeck 日常门禁升级为唯一权威（gdeck 仍只做日常安全带）。
- 在触控可玩性未复验通过前关闭 MB00 Goal。

## 3. 与现行程序的关系

| 事项 | 处理 |
|---|---|
| MB27 | **已关闭**：Goal **不通过**；失败原因是人工触控无法游玩/质量不达标。 |
| MB28（当前） | 触控可玩性整改至可连续游玩；通过后仅允许**申请**再次 Goal 评估。 |
| MB00 Goal | 保持 `active`；不得因自动化绿或功能切片完成而标完成。 |
| Web 对齐切片 | 原建议 MB28–MB33 **顺延为 MB29+**；可与 MB28 后衔接，但验收优先级低于可玩性门。 |
| 新 Mission | 每次只生成一份 Brief；实施前写入机器路线图/账本。 |

## 4. 对齐原则

1. **Web 权威**：命令结果、seed、canonical state SHA 以 TypeScript 生成的 fixture 为准。
2. **先 domain，后 UI**：adapter/dispatcher/query 先绿，再接线城卡/面板。
3. **AI 已有实现要升格为玩家命令**：Godot `strategic_ai.gd` 已含 `_recruit_reserves` / `_balance_troops`；应抽成共享 domain 命令，避免双轨公式。
4. **出征复用既有战术链**：正式 `AttackOrder` → 快速 `resolveBattle` / 手动 `createTacticalBattle` → 既有 settlement/recovery；淘汰「仅样片邻城」作为唯一入口。
5. **一次只开一个实施 Mission**；失败测试用于诊断，不改期望迎合错误实现。
6. **parity-matrix**：只记录 Web-oracle 等级提升；BBK 行保持原状除非有新原版证据。

## 5. 差距优先级矩阵

| ID | 缺口 | 严重度 | 依赖 | 建议切片 |
|---|---|---|---|---|
| G1 | 玩家征兵 | P0 | Web `recruitTroops` | A |
| G2 | 玩家兵力分配 | P0 | Web `distributeTroops` | A |
| G3 | 正式出征订单校验与快速结算 | P0 | Web `AttackOrder` / `executeAttack` | B |
| G4 | 手动战场由出征进入（替换样片唯一路径） | P0 | G3 + 既有战术 session | B |
| G5 | AI 进攻 → pending 守城 → 续月 | P0 | G3 + Web turn pending 语义 | C |
| G6 | 开局 ruleset 选择并写入存档 | P1 | 生产数据/存档契约 | D |
| G7 | 多槽存档 + 导入导出最小对等 | P1 | MB20 仓库 | D |
| G8 | 战术计谋从 `rally` 扩到 Web 十项目录 | P2 | MB16 模式 | E |
| G9 | 高密度字体/真机手感 | P1（并入 MB28） | 设备复验 | MB28 |
| G10 | Android Goal / 触控可玩 | **失败** | MB27 已判定不通过 | MB28 整改后复评 |

## 6. 分波实施计划

### Wave 0 — MB27 Goal 门（已关闭：不通过）

**结果**：用户人工触控验证失败——无法游玩、质量严重不达标；**Goal 不通过、不算完成**。

**基线 APK**：`godot/builds/sanguo-baye-godot-mb27-touch-debug.apk`（SHA-256 `6498C8B8…0EBE8`）仅作失败对照。

**完成标准**：决策已写入 `mission-reports/MB27-current-source-android-acceptance.md`；程序 Goal 保持 active。

### Wave 0b — MB28 触控可玩性整改（当前）

见 `docs/mission-briefs/MB28-android-touch-playability-remediation.md`。通过人工复验前，不得再次宣称 Goal 完成。

---

### Wave A — 征兵与兵力分配（建议 MB29）

**结果**：玩家可对己城执行征兵与兵力分配；成本、行动占用、上限、拒绝码与 Web oracle 一致。

**工作包**

- Domain：`recruit_troops` / `distribute_troops`（从 AI 私有逻辑抽出共享实现）。
- Application：adapter + dispatcher + queries（可用性/禁用原因）。
- Presentation：城卡或人事/兵力面板入口。
- Fixture：扩展 `application-session-suite` 或独立 military-manpower fixture。
- 回归：Godot runner + `npm` 组件脚本；AI 路径改调同一命令。

**证据**：成功/重复/体力不足/非本城/单次增兵上限/行动占用等边界与 Web SHA 对照。

---

### Wave B — 正式出征：快速结算 + 手动战场入口（建议 MB30）

**结果**：玩家可对合法目标下达出征；可选快速结算或进入既有战术屏；战后资源/俘虏/经验经既有 settlement 回接。

**工作包**

- Domain：`AttackOrder` 校验、快速 `resolveBattle`/`executeAttack` 对齐 Web。
- Application：出征事务、battleId、与 pause/recovery 契约衔接。
- Presentation：出征编辑器（目标城、将领、快速/手动）；战略屏样片按钮降为 debug 或删除产品路径。
- Fixture：快速战与「出征→创建战术→撤退/终局→回写」各至少一条 canonical 链。
- 更新 full-loop / parity manifest 覆盖新命令。

**证据**：非法目标拒绝且不耗 seed；快速战与手动战后 state SHA 与 Web 对照；旧样片路径不得成为唯一生产入口。

---

### Wave C — AI 进攻与守城打断（建议 MB31）

**结果**：月度 AI 可对玩家城生成 pending 进攻；推演暂停；玩家快速/手动守城后从下一势力续推。

**工作包**

- 对齐 Web `turn` / `App` pendingAttack 语义（可保存 pending 为佳，至少热路径正确）。
- Strategic AI：在既有十步经营序之后或按 Web 顺序接入出征规划（严格跟 oracle，禁止自创频率）。
- UI：守城提示与战场进入；取消/失败闭包与 Web 一致。
- Soak：至少一条「AI 攻→守城→续月」deterministic fixture。

**证据**：暂停点、续推势力顺序、战后状态与 Web 同 seed 双跑一致。

---

### Wave D — 开局规则身份与存档产品壳（建议 MB32）

**结果**：新战役可选 classic/modern 并锁定；至少 3 手动槽 + 自动槽语义；JSON 导入/导出不伪装 Web envelope。

**工作包**

- Campaign setup UI + `GameSession` / save schema 字段。
- 槽位仓库 API（可复用 MB20 原子写模式）。
- 导入：接受 Godot production envelope；Web v1 迁移保持显式、拒绝伪装。
- Presentation：主菜单槽列表与导出/导入入口。

**证据**：ruleset 锁定后成本差异用例；槽覆盖/损坏恢复；导入非法档原子拒绝。

---

### Wave E — 战术广度（建议 MB33，可拆）

**结果**：Web 十项计谋中尚未对照的技能按 MB16 `rally` 模式逐项扩 fixture；不宣称原版技能 ABI。

**策略**：每 Mission 最多 2–3 个技能或一组共享目标选择规则，避免大爆炸。

---

### Wave F — 回归与产品对齐证明（建议 MB34）

**结果**：对齐缺口 G1–G7 关闭证明；更新 `parity-matrix` Godot 行；扩展 full-loop；复跑 `npm run check`；只读审查清零本波引入 P0/P1。

**不自动等于** MB00 Goal 完成（若设备/provenance 仍开着，Goal 保持 active）。

## 7. 建议执行顺序

```text
MB27 Goal 门 ──失败（无法游玩/质量不达标）──→ MB28 触控可玩性整改 ──人工复验──┐
                                                                              ├─→ 再次申请 Goal 评估（不自动通过）
                                                                              ├─→ MB29 征兵/分兵
                                                                              ├─→ MB30 出征快速+手动入口
                                                                              ├─→ MB31 AI 守城打断
                                                                              ├─→ MB32 ruleset+多槽存档
                                                                              ├─→ MB33 计谋扩容（可后置）
                                                                              └─→ MB34 对齐回归收口
```

MB28 未通过人工复验前，不得关闭 Goal。功能对齐可在 MB28 之后启动；若用户明确要求并行，须保持 Goal 仍为失败态直至触控复验通过。

## 8. 每切片强制门禁

1. TypeScript oracle fixture 生成器 + check（无 `--write` 漂移）。
2. Godot 4.7.1 headless runner 断言。
3. 对应 presentation smoke（若有 UI）。
4. `npm run godot:gdeck:verify:fast`（日常）+ 相关 `godot:*:verify`。
5. 变更合并前组件级通过；整波结束跑完整 `npm run check`。
6. 完成报告 + 本地提交 + 账本更新；再用 `$mission-brief` 生成下一份 Brief。

## 9. 风险与决策点（需用户时再问）

| 风险 | 影响 | 默认策略 |
|---|---|---|
| AI 出征频率/目标选择与 Web 细微差 | C 波 deterministic 失败 | 严格跟 `src/core/ai.ts` / turn 顺序，禁止「更好玩」改动 |
| 快速战公式现代临时 | 不提升 BBK | matrix 保持临时/已取样，只锁 Web-oracle |
| 多槽与现有单档并存 | 迁移复杂 | 新槽 schema 显式版本；旧单档自动导入槽 0 |
| 触控验收长期不可得 | Goal 挂起 | 功能对齐继续；Goal 保持 active + handoff |
| 时期数据再分发许可 | 发布 | 不在本计划内代用户做许可决定 |

## 10. 即时下一步

1. **执行 MB28**：按 Brief 整改触控可玩性，重导 APK，请用户人工复验。  
2. 复验通过后，再决定是重开 Goal 评估还是进入 MB29 军事对齐。  
3. **不**在可玩性复验前标 Goal 完成。

## 11. 成功图像（对齐完成时）

玩家在 Godot 上可以：**先**用触控稳定游玩主路径，**再**选时期与规则身份 → 经营城池（含征兵分兵）→ 出征快速或手动战 → 月末面对 AI 进攻并守城 → 多槽存读/导出 → 与 Web 同 seed 关键结果可审计。  
MB00 Goal 仅在 MB00 全部完成证据成立时关闭；触控可玩性是其中不可替代的一环。
