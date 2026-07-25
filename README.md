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
- 先经营、调兵，再按性格阈值决定出征的确定性战略 AI
- 玩家行动、AI 行动、经济结算组成的完整核心回合
- 版本化完整状态存档、自动续玩、3 个本地槽位和 JSON 导入导出

当前 React 页面已经接入参考原版流程的“新君登基 → 选择时期 → 选择君主”开局界面，以及可拖动、缩放和选择城池的 Phaser 战略地图。董卓弄权、曹操崛起、赤壁之战和三国鼎立四个时期都已转换为随应用发布的结构化数据；玩家无需选择本地文件即可进入 38 城完整地图。原始资源库和来源不明的图片、字体没有进入发布包。开垦、征兵、搜寻、登用、奖赏、相邻城市调动、太守任命、出征和月度推进已经接入；手动战斗棋盘尚未实现。

原版兼容证据已开始与临时玩法层分离：`src/compat/baye/` 包含经过参考样本验证的 Web 移植 RNG、战术攻防/伤害和战略自动战斗公式，但尚未接管 `src/core/` 的演示流程。范围和剩余不确定性见 `references/parity-matrix.md`。

兼容范围、随机数策略和允许的现代化差异见 `docs/design/compatibility-policy.md`。兼容层现已包含原版 `.lib` 的安全容器解析器；原始资源仍只在本地使用，仓库只保存结构元数据和哈希证据。

## 项目交接

新协作者应先阅读 [`docs/HANDOFF.md`](docs/HANDOFF.md)。其中集中记录了当前可玩范围、关键架构、未完成系统、推荐接手重点、参考资料边界、存档注意事项和已知易踩点。

协作规范与参考基线更新方式见 [`CONTRIBUTING.md`](CONTRIBUTING.md)，自动化协作者还必须遵循 [`AGENTS.md`](AGENTS.md)。状态发生实质变化时，应同步更新交接文档，避免仅依赖聊天记录或个人环境。

## 本地运行

要求 Node.js 20 或更高版本。

首次拉取仓库时安装依赖并验证基线：

```powershell
npm ci
npm run check
```

日常开发只需启动一个开发服务器：

```powershell
npm run dev
```

`npm run check` 用于首次接手和提交前验证，会依次校验已入库参考基线、并行运行 Vitest 并执行生产构建；不需要在每次启动开发服务器前运行。测试和构建会短暂使用多个 CPU 核心，完成后自动退出。

不要重复启动 `npm run dev`。开发服务器会持续监视仓库文件，应在原终端按 `Ctrl+C` 关闭；若端口已被占用，项目会直接报错而不会自动改用下一个端口。

## 获取复刻参考

常用的 MIT C 规则与结构源码已筛选到 `references/vendor/baye-c-core/`，协作者普通拉取后即可开展对比，不依赖任何个人电脑上的外部路径。逐文件哈希和来源提交由 `npm run reference:check` 验证。

普通开发不需要运行任何 `reference:setup*` 命令。只有入库参考不足时，才从以下三个互斥级别中选择一个：

- `npm run reference:setup`：获取少量补充参考。
- `npm run reference:setup:full`：替代上一命令，获取完整 C 工程和技术文档。
- `npm run reference:setup:offline`：替代前两个命令，同时获取仅供本地研究的 GPL 离线运行壳。

参考源固定到 `references/upstream-lock.json` 中的上游提交，按需资料放在被 Git 忽略的 `.reference/`。规则差异、界面采集和来源边界记录在 `references/`。不要直接把上游 `.lib`、字体、WASM 或图片复制进主源码目录。

对于不含 Git 元数据的本地 ZIP 快照，使用哈希清单验证本阶段权威文件：

```powershell
.\scripts\verify-baye-local-reference.ps1 -SourcePath <path-to-Baye>
```

正式游戏不需要上述参考目录。若权威 `dat.lib.orig` 发生变化，可在本地重新生成四时期结构化数据：

```powershell
npx vite-node scripts/generate-bundled-scenarios.ts <path-to-Baye>
```

生成器会先校验原始库 SHA-256，只输出城市、道路、人物和时期等解析记录，不复制二进制资源、美术或字体。

完整的首次拉取、差分验证和上游更新流程见 `CONTRIBUTING.md`。

## 技术方向

- Vite + TypeScript
- React
- Phaser
- CSV/JSON 数据驱动
- Vitest

## 目录

```text
data/source/       整理出的原始/编辑用数据表
docs/HANDOFF.md    当前状态、接手入口和已知风险
docs/design/       设计文档
references/vendor/ 已筛选并锁定的上游只读参考源码
src/core/          状态、校验、战斗、经济、回合和 AI
src/compat/baye/   经过独立参考输出验证的原版兼容算法
src/data/          CSV、原版剧本到领域状态的转换与校验
src/game/          Phaser 战略地图、事件桥与生命周期
src/ui/            React UI
```

## 核心回合

```text
玩家经营与出征
  -> 自动战斗与状态更新
  -> 结束玩家阶段
  -> AI 势力按固定顺序经营、调兵并判断出征
  -> 月度资源和体力结算
  -> 日历推进
  -> 返回玩家阶段
```

当前临时战斗使用 `GameState.rngSeed`，相同状态和命令会得到相同结果。规则函数不会修改传入状态，地图导入和每个完整回合都会执行数据完整性检查。后续将逐模块替换为经过原 C 引擎验证的兼容实现。

选择君主并开始战役后会立即建立自动存档，后续每次状态更新继续覆盖。标题屏的“重返沙场”可以直接续玩；顶部存档区另提供 3 个手动槽位以及完整战役 JSON 的导入、导出。存档只保存已经解析的游戏状态，不包含原版 `.lib` 文件。

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
