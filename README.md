# sanguo-baye-web

一个使用 Web 技术栈制作的三国策略游戏原型，目标是保留《三国霸业》的策略味道，同时采用现代化界面、可编辑数据和可扩展规则架构。

## 当前阶段

v0.1 原型范围：

- 虚拟可编辑主地图
- 城池节点与道路关系
- 城池详情与武将列表
- 回合推进
- 自动结算战斗
- 基础 AI 回合

暂不包含手动战斗棋盘。战斗棋盘会在主地图循环跑通后接入。

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
src/core/          规则、状态、公式、AI
src/data/          数据导入与校验
src/game/          Phaser 场景与地图渲染
src/ui/            React UI
```

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
