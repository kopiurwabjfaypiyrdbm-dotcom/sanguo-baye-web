# sanguo-baye-web

一个以步步高电子词典版《三国霸业》为规则和体验基线的现代 Web 重写项目。项目通过解析、验证和差分测试还原原版数据与行为，同时使用现代化界面、可编辑数据和可扩展规则架构重新呈现。

## 项目原则

- 固定版本的 `baye_c` C 移植核心是原版规则解析的首要事实源。
- React 和 Phaser 负责现代化表现，不能自行改变未经记录的规则语义。
- 当前 TypeScript 战斗、经济和 AI 是架构验证用临时实现，尚未达到原版一致。
- 原版二进制、美术、字体和来源不明资源默认只作本地参考，不进入正式发布资产。
- 每项已还原规则都要有源码定位、固定输入和可重复验证。

## 当前阶段

当前已经完成可测试的 TypeScript 核心玩法闭环：

- 12 城、3 势力示例剧本与完整性校验
- CSV 武将导入和地图 JSON 往返
- 确定性自动战斗、逐武将伤亡和城池占领
- 月度资源增长、体力恢复、月份与跨年推进
- 按性格阈值选择目标的基础 AI
- 玩家行动、AI 行动、经济结算组成的完整核心回合

当前 React 页面仍是静态布局，Phaser 主地图和操作面板将在下一阶段接入。暂不包含手动战斗棋盘。

原版兼容证据已开始与临时玩法层分离：`src/compat/baye/` 包含经过参考样本验证的 Web 移植 RNG、战术攻防/伤害和战略自动战斗公式，但尚未接管 `src/core/` 的演示流程。范围和剩余不确定性见 `references/parity-matrix.md`。

## 本地运行

要求 Node.js 20 或更高版本。

```powershell
npm ci
npm run check
npm run dev
```

`npm run check` 会依次运行全部 Vitest 测试和生产构建。

## 获取复刻参考

参考源固定到 `references/upstream-lock.json` 中的上游提交，并按需获取到被 Git 忽略的 `.reference/`：

```powershell
.\scripts\fetch-baye-reference.ps1
```

规则差异、界面采集和来源边界记录在 `references/`。不要直接把上游 `.lib`、字体、WASM 或图片复制进主源码目录。

对于不含 Git 元数据的本地 ZIP 快照，使用哈希清单验证本阶段权威文件：

```powershell
.\scripts\verify-baye-local-reference.ps1 -SourcePath <path-to-Baye>
```

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
src/compat/baye/   经过独立参考输出验证的原版兼容算法
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

当前临时战斗使用 `GameState.rngSeed`，相同状态和命令会得到相同结果。规则函数不会修改传入状态，地图导入和每个完整回合都会执行数据完整性检查。后续将逐模块替换为经过原 C 引擎验证的兼容实现。

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
