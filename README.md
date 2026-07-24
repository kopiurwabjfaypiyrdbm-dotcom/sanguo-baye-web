# sanguo-baye-web

一个使用 Web 技术栈制作的三国策略游戏原型，目标是保留《三国霸业》的策略味道，同时采用现代化界面、可编辑数据和可扩展规则架构。

## 当前阶段

当前已经完成可测试的 TypeScript 核心玩法闭环：

- 12 城、3 势力示例剧本与完整性校验
- CSV 武将导入和地图 JSON 往返
- 确定性自动战斗、逐武将伤亡和城池占领
- 月度资源增长、体力恢复、月份与跨年推进
- 按性格阈值选择目标的基础 AI
- 玩家行动、AI 行动、经济结算组成的完整核心回合

当前 React 页面仍是静态布局，Phaser 主地图和操作面板将在下一阶段接入。暂不包含手动战斗棋盘。

## 本地运行

要求 Node.js 20 或更高版本。

```powershell
npm ci
npm run check
npm run dev
```

`npm run check` 会依次运行全部 Vitest 测试和生产构建。

## 技术方向

- Vite + TypeScript
- React
- Phaser
- CSV/JSON 数据驱动
- Vitest

## 目录

```text
data/source/       整理出的原始/编辑用数据表
docs/design/       设计文档
src/core/          状态、校验、战斗、经济、回合和 AI
src/data/          数据导入与校验
src/game/          Phaser 场景与地图渲染
src/ui/            React UI
```

## 核心回合

```text
玩家出征
  -> 自动战斗与状态更新
  -> 结束玩家阶段
  -> AI 势力按固定顺序各行动一次
  -> 月度资源和体力结算
  -> 日历推进
  -> 返回玩家阶段
```

所有随机战斗使用 `GameState.rngSeed`，相同状态和命令会得到相同结果。规则函数不会修改传入状态，地图导入和每个完整回合都会执行数据完整性检查。

## 数据

当前已整理：

- `data/source/person-leadership-template.csv`：武将编辑表
- `data/source/person-leadership-by-period.csv`：按时期展开的武将原始表
- `data/source/tool-catalog.csv`：道具属性索引

武将表当前列：

```text
武将ID,名字,武力,智力,统率,兵种,武器,智力道具,坐骑
```

## 说明

本仓库用于协作开发新的 Web 原型。iBaye / baye-alpha 仅作为参考实现和数据来源，长期主架构会使用 TypeScript 重写规则层。
