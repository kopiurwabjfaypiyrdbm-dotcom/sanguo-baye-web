# sanguo-baye-web

最新开发记录见 [`docs/DEVELOPMENT_LOG.md`](docs/DEVELOPMENT_LOG.md)，当前交接状态见 [`docs/HANDOFF.md`](docs/HANDOFF.md)。

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
- 饥荒、旱灾、水灾、暴动的持久城池状态、治理恢复和确定性年度人物演进
- 先经营、调兵，再按性格阈值决定出征的确定性战略 AI
- 可保存的多月道路调动、资源输送和在途武将唯一归属
- 需要本月侦察人物名单的离间、招揽、策反与劝降跨月谋略
- 可选且随存档锁定的战死、自然死亡与俘虏逃脱政策
- 可选且随存档锁定的“经典校准 / 现代平衡”规则身份
- 处斩、流放、没收、装备回收、君主继承与无继承势力瓦解
- 玩家行动、AI 行动、经济结算组成的完整核心回合
- 版本化完整状态存档、自动续玩、3 个本地槽位和 JSON 导入导出

当前 React 页面已经接入参考原版流程的“新君登基 → 选择时期 → 选择君主”开局界面，以及可拖动、缩放和选择城池的 Phaser 战略地图。董卓弄权、曹操崛起、赤壁之战和三国鼎立四个时期都已转换为随应用发布的结构化数据；玩家无需选择本地文件即可进入 38 城完整地图。开局可选择“经典校准”或“现代平衡”：经典身份使用源码已确认的 100 初始兵力、命令成本与自动太守规则，现代身份保留旧存档的 400 初始兵力和手动太守体验；规则身份随 schema 6 存档锁定。开垦、招商、治理、出巡、交易、宴请、掠夺、征兵、搜寻、登用、赏金、装备、侦察、谋略、俘虏处置、道路调动、资源输送、出征和月度推进均已接入，AI 与 UI 使用同一规则成本。出征可快速结算或进入 Phaser 手动战场；战场现有七张现代结构化地图、五种天气、八种状态、十项明确标注为现代的数据驱动计谋、控制区、主将、粮草/天数胜负、攻守双方全军撤退和确定性战术 AI。普通攻击已恢复骑/水/玄四向近战、步/极八向近战、弓兵距二环射击的原版语义；道具替换攻击形状的机制已接入，但现有临时道具尚未绑定未获合法固定的原版射程表。

当前界面以手机横屏全屏游玩为首要目标：战略阶段使用地图常驻、城池情境抽屉、五类全局目录和独立“结束本月”入口，战术阶段使用全屏地图、底部触控动作栏和按需边缘面板。667×375 至 915×412 手机横屏、1024×768 平板等效视口和 1280×720 桌面浏览器已完成模拟验收；真实 iOS Safari 与 Android Chrome 仍列为发布前真机验证项。设备矩阵和剩余风险见 [`docs/design/mobile-device-acceptance.md`](docs/design/mobile-device-acceptance.md)。

应用已经具备 PWA 安装清单、确认式离线更新和核心游戏壳预缓存，并提供 Capacitor 8 Android 工程。Android 调试壳锁定正反横屏、使用沉浸式系统栏和刘海短边区域，并将系统返回键依次用于关闭当前层级、返回上一级或最小化标题页。PWA 与 Android 构建、临时包名和真机验收要求见 [`docs/design/pwa-android-shell.md`](docs/design/pwa-android-shell.md)。

固定 C 的 `LoadPeriod` 已确认时期载入后把人物体力与兵力设为 100。新开局默认使用这一经典校准值；schema 1–5 旧存档迁移为现代平衡身份，不会因升级静默改变既有 400 兵力战役。

原版兼容证据已与临时玩法层分离：`src/compat/baye/` 包含经过参考样本验证的 Web 移植 RNG、战术攻防/伤害、状态驱动、普通攻击形状和战略自动战斗公式。战场按战略方向部署，从七张代码定义地图中确定性选择，并提供路径/伤害/计谋预览、中文兵种与状态、明确胜因和目标/主将评分 AI；每方最多部署 10 名武将。地图逐城对应、十项计谋目录、地形移动/攻防修正、粮草消耗和 AI 权重仍是现代临时规则。仓库不保存原版 `.lib` 或生成资源数组，只保留允许的语义、偏移、长度与哈希证据。范围和剩余不确定性见 `references/parity-matrix.md`。

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

验证可安装 PWA 时使用生产构建，不要用开发服务器代替：

```powershell
npm run build
npm run preview
```

Android Studio 与 SDK Platform 36 安装完成后，可生成并同步原生工程：

```powershell
npm run android:doctor
npm run android:assets
npm run android:sync
npm run android:open
```

直接生成 Debug APK 使用 `npm run android:apk`，产物位于 `android/app/build/outputs/apk/debug/app-debug.apk`。`android:add` 只用于原生目录不存在时的首次生成，日常开发不要重复执行。

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

生成器会先校验原始库 SHA-256，只输出 schema 2 的城市、道路、人物、时期和稀疏未来登场字段，不复制完整条件表、二进制资源、美术或字体。

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
src/platform/      Web 与 Android 原生壳之间的最小平台适配
src/ui/            React UI
android/           Capacitor Android 原生工程
public/            PWA 图标与静态安装资源
```

## 核心回合

```text
玩家经营与出征
  -> 自动战斗与状态更新
  -> 结束玩家阶段
  -> AI 势力按固定顺序经营、谋略、调兵并判断出征
  -> 日历推进
  -> 跨月道路命令与外交谋略结算
  -> 俘虏逃脱、年度人物/道具、资源、体力、城池事件与自然死亡结算
  -> 若君主失效则暂停并完成继承或势力瓦解
  -> 返回玩家阶段
```

当前快速结算与手动战斗都使用确定性状态；相同状态、命令与随机种子会得到相同结果。手动战斗以独立会话运行，只有最终结果可以原子写回战略状态，陈旧或重复结果会被拒绝。规则函数不会修改传入状态，地图导入和每个完整回合都会执行数据完整性检查。后续将逐模块替换为经过原 C 引擎验证的兼容实现。

选择君主并开始战役后会立即建立自动存档，后续每次战略状态更新继续覆盖。进入手动进攻或 AI 守城前还会写入版本化战斗恢复日志；刷新后从相同战前状态确定性重开该战斗，不保存进行中的格子局面。战果通过战斗 ID、回合、随机种子和完整战略指纹校验，并采用“待决 → 已提交 → 自动存档 → 清理日志”的两阶段流程，避免崩溃窗口重复应用或丢失结果。标题屏的“重返沙场”可以直接续玩；顶部存档区另提供 3 个手动槽位以及完整战役 JSON 的导入、导出。存档只保存已经解析的游戏状态，不包含原版 `.lib` 文件。

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
