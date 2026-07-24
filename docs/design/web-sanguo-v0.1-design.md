# Web 三国霸业原型 v0.1 设计文档

## 目标

v0.1 的目标是用 Web 技术栈跑通一个“现代化三国霸业”战略循环。它保留《三国霸业》的城池、武将、势力、内政、出征、回合推进等策略味道，但界面和交互采用现代 Web 方式实现。

第一阶段暂不制作战斗棋盘。战斗先使用自动结算，等主地图和回合循环稳定后，再接入可操作的战斗棋盘。

## 技术路线

推荐技术栈：

- Vite + TypeScript：工程、构建、核心逻辑
- React：面板、列表、弹窗、表单、编辑器
- Phaser：主地图渲染、城池节点、道路连线、地图拖拽缩放、动画和后续战斗棋盘
- CSV/JSON：武将、城池、道具、势力、剧本、兵种数据
- Vitest：公式、AI、数据导入、战斗结算测试

原 iBaye / baye-alpha 作为参考实现和数据来源，不作为长期主架构。新项目的核心规则使用 TypeScript 实现，便于后续调整统率、战斗公式、AI 行为和数据结构。

渲染层选用 Phaser，而不是原生 Canvas 或 PixiJS。原因是 Phaser 已经提供游戏项目常用的场景、相机、输入、资源加载、补间动画和对象生命周期管理；它比原生 Canvas 少很多基础设施工作，也比 PixiJS 更适合直接组织游戏流程。PixiJS 的渲染能力很强，但更偏底层渲染器，地图场景、交互命中、相机、动画节奏和资源流程需要更多自建代码。

React 和 Phaser 的边界：

- Phaser 负责游戏画面：主地图、城池节点、道路、地图拖拽缩放、选中态、行军动画、后续战斗棋盘
- React 负责操作界面：顶部状态栏、右侧城池面板、武将列表、出征确认、日志、地图编辑表单
- TypeScript core 负责规则：回合推进、自动战斗、AI、数据校验、导入导出
- React 与 Phaser 不直接各自维护一份游戏状态，而是共同读写同一个 `GameState`

## v0.1 功能范围

v0.1 包含：

- 虚拟主地图
- 可编辑城池节点
- 城池之间的道路/邻接关系
- 势力归属显示
- 城池详情面板
- 城内武将列表
- 回合推进
- 基础资源增长
- 玩家从己方城池向相邻敌方城池出征
- 自动战斗结算
- 胜利后占领城池
- 失败后扣减兵力
- 简单 AI 回合

v0.1 不包含：

- 手动战斗棋盘
- 完整外交系统
- 完整计策系统
- 完整搜索、登用、离间、招降等内政命令
- 复杂剧情事件
- 完整原版地图美术复刻
- 存档兼容原版二进制格式

## 核心循环

```text
选择剧本/势力
  -> 进入主地图
  -> 点击城池
  -> 查看城池、资源、武将
  -> 选择己方城池出征
  -> 选择相邻目标城池
  -> 选择参战武将
  -> 自动结算战斗
  -> 更新城池归属、兵力、资源、日志
  -> 结束回合
  -> AI 势力行动
  -> 进入下一回合
```

## 可编辑地图设计

地图不是固定图片，而是数据驱动的节点地图。

地图由以下层组成：

- 背景层：v0.1 可使用纯色、网格或简化地形背景
- 城池节点层：每座城池是一个可点击、可拖动的数据节点
- 道路线层：城池之间的邻接关系
- 势力层：根据城池归属显示颜色
- 选中/路径层：显示当前选中城池、可攻击目标、出征路径

这些地图层由 Phaser Scene 渲染。Phaser Camera 负责缩放和拖拽视口；城池节点使用 Phaser GameObject 表示；道路连线使用 Graphics 绘制。地图编辑模式下，拖动节点会更新内存中的 `cities` 坐标，再由导出功能写出 `cities.json`。

城池数据示例：

```ts
type City = {
  id: string;
  name: string;
  x: number;
  y: number;
  type: 'capital' | 'city' | 'frontier';
  region: string;
  ownerId: string;
  neighbors: string[];
  population: number;
  farming: number;
  commerce: number;
  defense: number;
  money: number;
  food: number;
  reserveTroops: number;
};
```

v0.1 的地图编辑能力：

- 开关“编辑模式”
- 拖动城池改变坐标
- 点击城池编辑名称、区域、类型、归属
- 选择两个城池建立或取消道路连接
- 导出 `cities.json`
- 导入 `cities.json`

v0.1 可以先使用 12 到 20 个虚拟城池。后续可扩展为更大的地图，包括原三国核心城池、边疆城池和外族势力据点。

## 数据模型

武将：

```ts
type Officer = {
  id: string;
  sourceId?: number;
  name: string;
  force: number;
  intelligence: number;
  leadership: number;
  armsType: string;
  weapon?: string;
  intelligenceItem?: string;
  mount?: string;
  factionId: string;
  cityId: string;
  troops: number;
  loyalty: number;
  age: number;
  stamina: number;
};
```

势力：

```ts
type Faction = {
  id: string;
  name: string;
  rulerOfficerId: string;
  color: string;
  isPlayer: boolean;
  aiProfile: 'balanced' | 'aggressive' | 'defensive';
};
```

道具：

```ts
type Item = {
  id: string;
  name: string;
  forceBonus: number;
  intelligenceBonus: number;
  moveBonus: number;
  armsTypeOverride?: string;
};
```

兵种：

```ts
type ArmsType = {
  id: string;
  name: string;
  attackModifier: number;
  defenseModifier: number;
  mobility: number;
};
```

## 数据导入

v0.1 优先支持从当前整理的武将 CSV 导入：

```text
武将ID,名字,武力,智力,统率,兵种,武器,智力道具,坐骑
```

导入规则：

- `名字` 是主要匹配键
- 名字中带 `（时期X）` 的记录视为同名武将的剧本变体
- `武将ID` 保留为 `sourceId`，用于追溯原始数据
- `统率` 使用用户编辑后的数值
- 武器、智力道具、坐骑中的括号加成只作为显示和解析辅助
- 真正计算加成时以 `items.json` 为准

后续如果用户上传新的三维数据表，导入器应先解析为临时预览，再显示匹配结果和冲突项，确认后写入项目数据。

## 自动战斗结算

v0.1 自动战斗不追求最终平衡，只要求规则透明、可测试、可调参。

基础公式：

```text
武将战力 =
  兵力 * 兵种基础系数
  + 武力 * 攻击权重
  + 智力 * 谋略权重
  + 统率 * 组织权重
  + 装备加成
  + 随机浮动

守方额外获得：
  城防修正 + 本城资源/地形修正
```

建议初始权重：

```ts
const battleConfig = {
  troopWeight: 1.0,
  forceWeight: 8,
  intelligenceWeight: 4,
  leadershipWeight: 10,
  defenseWeight: 0.4,
  randomRange: 0.12,
};
```

结算输出：

- 胜负方
- 参战武将损兵
- 城池归属是否变化
- 战斗日志
- 关键影响因素说明

## AI 设计

v0.1 AI 只做最低限度行为，保证回合循环成立：

- 每回合给己方城池少量资源增长
- 优先补强边境城池
- 如果相邻敌城明显弱于己方，则发起自动进攻
- 如果没有合适目标，则跳过军事行动

AI 不需要一开始很聪明，但必须可解释。每次 AI 行动都写入日志，例如：

```text
曹操军从许昌进攻陈留，战力优势 1.34，判定发起攻击。
```

## UI 结构

主界面由四个区域组成：

- 顶部状态栏：年份、月份、当前势力、金钱/粮草概览、结束回合按钮
- 中央地图：Phaser 渲染的城池节点、道路、势力颜色、可缩放拖拽地图
- 右侧城池面板：选中城池的信息、驻守武将、操作按钮
- 底部日志：战斗、资源、AI 行动、系统提示

地图编辑模式可以复用右侧面板，显示坐标、邻接城池、归属、资源字段。

React 与 Phaser 通过轻量事件桥通信：

- Phaser 发出事件：选择城池、拖动城池、点击道路、请求打开编辑面板
- React 发出命令：开始出征、确认目标、切换编辑模式、保存地图、结束回合
- core 层处理命令并返回新 `GameState`
- Phaser 和 React 都根据新状态重新渲染

## 状态管理

游戏运行状态集中保存在一个 `GameState`：

```ts
type GameState = {
  calendar: { year: number; month: number };
  playerFactionId: string;
  factions: Record<string, Faction>;
  cities: Record<string, City>;
  officers: Record<string, Officer>;
  items: Record<string, Item>;
  armsTypes: Record<string, ArmsType>;
  logs: GameLog[];
};
```

所有规则函数接收旧状态，返回新状态：

```ts
function resolveBattle(state: GameState, order: AttackOrder): BattleResult;
function applyBattleResult(state: GameState, result: BattleResult): GameState;
function advanceTurn(state: GameState): GameState;
```

这样便于测试、回放和未来存档。

## 测试策略

v0.1 至少覆盖：

- CSV 武将导入
- 城池邻接合法性
- 不能攻击非相邻城池
- 自动战斗胜负稳定性
- 统率影响战斗结果
- 城防影响守方结果
- AI 不会从无武将或无兵城池出征
- 地图编辑导出的 `cities.json` 可再次导入

## 后续扩展

v0.1 之后可以逐步加入：

- 手动战斗棋盘
- 更完整的内政命令
- 外交系统
- 计策系统
- 外族势力
- 多剧本
- 武将成长
- 事件脚本
- 存档系统
- 地图美术替换

战斗棋盘接入时，自动战斗模块保留为“委任战斗/快速战斗”，棋盘战斗模块复用同一套武将、兵种、装备和公式配置。

## 验收标准

v0.1 完成时应满足：

- 启动 Web 应用后能进入主地图
- 地图上至少有 12 座可点击城池
- 城池归属用势力颜色区分
- 点击城池能看到资源和武将
- 玩家能从己方城池攻击相邻敌城
- 自动战斗能产生日志和结果
- 胜利后城池归属变化
- 结束回合后 AI 会执行至少一种可见行动
- 地图编辑模式能修改城池坐标和邻接关系
- 编辑后的地图能导出并重新导入
- 武将 CSV 能导入，并保留统率字段
