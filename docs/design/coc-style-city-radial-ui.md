# Clash of Clans 式据点情境 UI 规范（战略地图）

本文是进入战役后的**点城交互**权威规范。全局底栏目录仍可用边缘 Sheet；**据点第一层不得使用整侧工作台**。

相关文档：[`mobile-landscape-ui-v1.md`](./mobile-landscape-ui-v1.md)（壳与分步命令）、[`mobile-campaign-navigation.md`](./mobile-campaign-navigation.md)（底栏索引）。若与「右侧抽屉作城情境首屏」冲突，**以本文为准**。

## 总原则

1. 地图是唯一主舞台（约 75%–90% 面积）。
2. 点对象，不点页面：第一交互是选中据点。
3. 操作就近出现：控件围着据点或贴在拇指近区。
4. 一层一事：同时只服务一个选中据点。
5. 轻确认、重回地图：做完默认回纯地图。
6. 取消成本极低：点空白 / 点其他据点 / Back。
7. 状态画在地图上，不靠常驻大面板。

## 层级

| 层 | 名称 | 问题 | 形态 |
|----|------|------|------|
| L0 | 浏览 | 态势？ | 地图 + 薄顶栏 + 底栏全局入口 |
| L1 | 选中 | 点的是谁？ | 据点高亮 + 可选一行摘要 |
| L2 | 四叶草 | 哪一类事？ | 围着据点的 3–6 花瓣 |
| L3 | 类别短板 | 具体哪条命令？ | 底部命令条 / 近侧短板（可滚列表，CTA 钉底） |
| L4 | 分步配置 | 谁、目标、数量？ | 单步卡片 + 地图高亮 |
| L5 | 确认反馈 | 确定？结果？ | 就近确认 + 短 toast |

**禁止**：L2 直接展开成全高右侧长列表工作台。

## L2 四叶草

- 选中己方城后立即出现；敌方仅「情报」等可行动作。
- 花瓣绕据点屏幕坐标均分；半径约 56–88 dp；每瓣 ≥ 48×48 dp。
- 花瓣只放短标（详情 / 内政 / 人事 / 军事 / 谋略），不放多行说明。
- **点花瓣**：立刻收起整圈 L2 → 保持选中 → 打开对应 L3。
- **点空白**：关 L2 并取消选中（回 L0）。
- **点其他城**：关当前 L2，切换选中并开新 L2。
- 贴边时平移花瓣环；仍放不下则降级为据点旁横向键条（仍非右侧整页）。

## L3 之后

- Back / 关闭 L3：回到 **L1+L2**（再次展开四叶草）。
- 点具体命令 → L4 分步 → 下令成功后建议全部收起回 L0，仅 toast + 地图状态变化。
- 未实装命令：可见禁用 + 一行原因。

## 与底栏边界

- 底栏 = 全局索引（情报 / 城池 / 人物 / 宝物 / 委任）与推进（结束本月）。
- 打开底栏 Sheet 时关闭 L2–L4。
- 从目录跳到城：关目录 → 镜头落到城 → 开 L1/L2。

## Back 栈

`L4 → L3 → L2 → L1 → L0`，逐层剥开。

## 命令证据：原版 C 三类 ↔ 产品五瓣

权威来源（禁止脑补 L3 项）：

1. 原版顶层：`references/vendor/baye-c-core/src/citycmdb.c` `OrderMenu`（内政 / 外交 / 军备 / 城市状况）；命令 ID 见 `baye/order.h`。
2. 产品命令分组：`src/ui/cityCommandCatalog.ts` 的 `CITY_COMMAND_GROUPS`（Godot 镜像：`godot/src/presentation/city_command_catalog.gd`）。
3. 壳交互：本文 L2→L3→L4。

**已锁定映射**：L2 五瓣沿用 Web 分组，**不**改回原版「仅三类」顶栏。下表说明对应关系；列表内容以 catalog 为准。

| 原版 OrderMenu | 产品 L2 花瓣 | 说明 |
|----------------|--------------|------|
| 城市状况 | 详情 | 只读摘要（visibility / snapshot），无命令列表 |
| 内政 | 内政 + 人事（部分） | C 内政菜单含搜寻/赏赐/输送等；产品把人事拆到独立花瓣 |
| 外交 | 谋略 | catalog 单入口 `diplomacy`；子计策在外交面板内 |
| 军备 | 军事（+ 内政掠夺） | C 掠夺属军备；产品 catalog 将 `plunder` 放在 `internal` |

### 差异标注（有意保留）

| 项 | 原版 C | 产品 catalog | 处理 |
|----|--------|--------------|------|
| 掠夺 `DEPREDATE` | 军备 | `internal` / `plunder` | **以 catalog 为准** |
| 任命 | 菜单注释掉 | `personnel` / `appoint` | 保留为现代管理项；UI 标「现代」 |
| 反间 `REALIENATE` | 驱动为空 | 不暴露 | 不新增入口 |
| 出征 `BATTLE` | 军备有 | `military` / `attack` | 编辑器未闭环则禁用 + 原因 |

### 逐瓣仅允许的 CityCommandId（与 catalog 逐字一致）

**详情**：无命令；只读摘要。

**内政 `internal`**

| id | label |
|----|-------|
| `develop` | 开垦 |
| `commerce` | 招商 |
| `govern` | 治理 |
| `inspect` | 出巡 |
| `trade` | 交易 |
| `banquet` | 宴请 |
| `plunder` | 掠夺 |

**人事 `personnel`**

| id | label |
|----|-------|
| `search` | 搜寻 |
| `recruit-officer` | 登用 |
| `reward` | 奖赏 |
| `move` | 调动 |
| `transport` | 输送 |
| `appoint` | 太守 |
| `item` | 道具 |
| `captive` | 俘虏 |
| `banish` | 流放 |

**军事 `military`**

| id | label |
|----|-------|
| `recruit-troops` | 征兵 |
| `distribute` | 调兵 |
| `recon` | 侦察 |
| `attack` | 出征 |

**谋略 `intrigue`**

| id | label |
|----|-------|
| `diplomacy` | 谋略行动 |

子计策证据（`order.h`）：离间 / 招揽 / 策反 / 劝降；以 `DiplomaticOrderPanel` 已实现集合为准，不新增无证据项。反间不暴露。

### L3 → L4 路由

| L3 id | L4 |
|-------|-----|
| 内政七项 | CityCard 单命令执行器（domain kind 映射） |
| `reward` / `appoint` / `item` | OfficerManagementPanel |
| `search` / `recruit-officer` / `captive` / `banish` | PersonnelLifecyclePanel |
| `move` / `transport` | StrategicLogisticsPanel（仅从人事进入） |
| `recruit-troops` / `distribute` | CityCard 征兵/调兵 |
| `recon` | ReconnaissancePanel |
| `attack` | 禁用说明（不冒充正式出征） |
| `diplomacy` | DiplomaticOrderPanel |

敌城：仅「详情/情报」花瓣；不出现内政/人事/军事/谋略。

## 验收

1. 点己方城 → 城旁花瓣，无右侧整页 L2。
2. 点「内政」→ 花瓣消失，出现内政短列表 7 项且 label 与 catalog 一致（L3）。
3. 点「人事」→ L3 九项；「军事」→ L3 四项。
4. L3 Back → 花瓣回来。
5. 花瓣可点（命中不被遮罩吞掉）；844×390 / 高密度 CTA 在视口内。
6. 敌城只有情报类花瓣。
7. 「详情」为只读摘要，无混用 OptionButton 主路径。
