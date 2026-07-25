# 原版核心数据结构映射

本页记录固定参考中 C 数据布局到当前 TypeScript 领域模型的映射。事实源是 `source-manifest.json` 中经过 SHA-256 校验的文件；用户提供的快照不含 `.git`，因此这些结论是“内容已验证、提交身份未验证”。

## 二进制约定

- `dictsys.h` 将 `U8/U16/U32` 定义为 8/16/32 位无符号整数，并把多字节类型对齐设为 1。`fixtures/structure-layout.json` 的 GCC 探针得到当前移植运行期的 `sizeof(PersonType) == 19`、`sizeof(CityType) == 37`、`sizeof(GOODS) == 66`。
- 本地 `dat.lib.orig` 不是上述扩宽结构的直接内存镜像。它使用 12 字节 `RCHEAD`、4 字节 `RIDX`，人物/道具 ID 仍为 `U8`；当前 `datman.h` 与运行期结构已经扩宽，必须作为另一格式显式处理。
- `PersonID`、`ToolID`、`SkillID` 都是 `U16`。人物、君主、太守和装备引用通常使用 `index + 1`，`0` 表示空引用；调用点会在访问数组前减 1。
- 人物 `Belong == 0xffff` 在死亡/失去归属流程中出现，不能当作普通君主 ID。`OldBelong` 的实际用途是暂存旧归属并在部分月度事件中恢复；`LoadPeriod` 会把它重置为 `0`。
- `g_PersonsQueue` 和 `g_GoodsQueue` 是全局连续队列，城池中的 `*Queue` 是起点、`Persons/Tools` 是长度，并不是独立数组。
- `g_GoodsQueue` 的低 15 位保存道具索引，高位 `0x8000` 是已发现/可取得状态。人物 `Equip[2]` 中 `0` 表示无装备，正值访问道具资源时减 1。

## PersonType（19 字节）

| C 字段 | 宽度 | 已确认语义 | 当前 TypeScript 对应 | 差异/决定 |
|---|---:|---|---|---|
| `OldBelong` | U16 | 旧归属或流程哨兵 | 无 | 兼容导入层必须保留，不能折叠进 `factionId` |
| `Belong` | U16 | `0` 无归属；通常为君主索引 + 1；`0xffff` 为特殊状态 | `Officer.factionId` | 领域层可转字符串 ID，但原值需可追溯 |
| `Level` | U8 | 等级，直接进入战斗攻防公式 | 无 | 必须新增原版兼容字段，不能由年龄或统率推导 |
| `Force` | U8 | 武力 | `Officer.force` | 一对一 |
| `IQ` | U8 | 智力 | `Officer.intelligence` | 一对一 |
| `Devotion` | U8 | 忠诚 | `Officer.loyalty` | 一对一 |
| `Character` | U8 | 性格枚举 0–4 | 无 | 当前 AI profile 不是替代物 |
| `Experience` | U8 | 经验 | 无 | 战斗层保留原值 |
| `Thew` | U8 | 体力 | `Officer.stamina` | 一对一；新剧本载入后强制为 100 |
| `ArmsType` | U8 | 原始兵种 0–5 | `Officer.armsTypeId` | 映射顺序见 `fight.h`，不得按名称排序 |
| `Arms` | U16 | 兵力 | `Officer.troops` | 一对一；新剧本载入后先强制为 100，随后非玩家势力初始化为 800 |
| `Equip[0..1]` | 2×U16 | 两个装备槽，ID 为资源索引 + 1 | 三个具名道具槽 | 当前武器/智力道具/坐骑三槽是现代模型，不能无损回写原版 |
| `Age` | U8 | 年龄 | `Officer.age` | 一对一 |

当前 `Officer.leadership` 和 CSV 的“统率”没有 `PersonType` 对应字段，属于现有原型扩展。原版默认攻击取武力、防御取智力；不得让统率进入原版兼容公式。

### 原版库中的 Person 记录（15 字节）

时期 1 人物条目为 3000 字节，即 200 个 15 字节槽位。前 185 个是常规人物，随后包含 2 个特殊人物和未使用槽；时期 1 城市队列实际引用 157 名当前驻城人物。旧布局的 `Belong` 与 `Equip[2]` 各元素为 `U8`，首字节在常规人物中通常等于槽位索引，但特殊人物并不满足这一规律，因此解析器把槽位位置作为 `sourceIndex`、把首字节单独保留为 `legacyIndexMarker`。原版数据解码器必须读取 15 字节记录，再显式扩宽为现代领域值，不能使用当前 `PersonType` 的 `sizeof` 切片。

## CityType（37 字节）

| C 字段 | 宽度 | 已确认语义 | 当前 TypeScript 对应 | 差异/决定 |
|---|---:|---|---|---|
| `State` | U8 | 正常/饥荒/旱灾/水灾/暴动 0–4 | 无 | `LoadPeriod` 后重置为正常 |
| `Belong` | U16 | 城主君主索引 + 1；`0` 为空城 | `City.ownerId` | 需要显式空城表示 |
| `SatrapId` | U16 | 太守索引 + 1；`0` 为空 | 无 | 不能从驻军第一人隐式推导 |
| `FarmingLimit` / `Farming` | 2×U16 | 农业上限/当前值 | `City.farming` | 当前缺少上限 |
| `CommerceLimit` / `Commerce` | 2×U16 | 商业上限/当前值 | `City.commerce` | 当前缺少上限 |
| `PeopleDevotion` | U8 | 民忠 | 无 | 与人物忠诚不同 |
| `AvoidCalamity` | U8 | 防灾 | 无 | 与当前 `defense` 不是同一字段 |
| `PopulationLimit` / `Population` | 2×U32 | 人口上限/当前人口 | `City.population` | 当前缺少上限 |
| `Money` / `Food` | 2×U16 | 金钱/粮食 | `City.money` / `City.food` | 一对一，但必须保留 16 位溢出语义 |
| `MothballArms` | U16 | 后备兵力 | `City.reserveTroops` | 一对一 |
| `PersonQueue` / `Persons` | 2×U16 | 全局人物队列切片 | 由 `Officer.cityId` 反向表示 | 导入时展开，回写时需重建稳定顺序 |
| `ToolQueue` / `Tools` | 2×U16 | 全局道具队列切片 | 无 | 导入层必须保留发现位与顺序 |

当前 `City.defense`、`type`、`region` 和 `neighbors` 是现代地图/自动战斗模型，不是 `CityType` 原字段。原版 `AvoidCalamity` 只映射到 `disasterPrevention`，不得再作为城防值使用。城市坐标来自独立资源 `dCityPos`，也不在 `CityType` 内。

### 原版库中的 City 记录（31 字节）

时期城市条目固定为 1180 字节：38×31 字节城市记录，末尾紧跟一个小端 `U16` 年份。四个时期实测年份为 190、198、208、225。旧布局中 `Belong`、`SatrapId`、`PersonQueue`、`Persons`、`ToolQueue`、`Tools` 为 `U8`；其余字段顺序与当前结构一致。`attribute.h` 的旧“30 Bytes”注释仍少算了 1 字节，不能作为切片长度。

## GOODS（66 字节）

| C 字段 | 宽度 | 已确认语义 | 当前 TypeScript 对应 |
|---|---:|---|---|
| `idx_` / `useflag` | 2×U8 | 资源内部序号/使用标志 | 无 |
| `atRange[30]` / `changeAttackRange` | 31 字节 | 攻击范围数据与启用标志 | 无 |
| `reserved[29]` | 29 字节 | 保留区 | 不解释、不导入领域层 |
| `at` / `iq` / `move` / `arm` | 4×U8 | 武力、智力、移动、兵种修正 | `Item` 的三个 bonus 与 `armsTypeOverride` |

当前 `Item` 是便于现代界面使用的归一化视图。名称不在 `GOODS` 结构内，通过资源字符串入口取得；正式导入器必须把数值记录、名称资源和来源索引分开处理。

## 剧本装载

- `LoadPeriod` 接受 1–4，对应董卓弄权、曹操崛起、赤壁之战、三国鼎立。
- 城市记录来自 `CITY_RESID`，紧随全部城市记录之后读取 `g_YearDate`；默认配置为 38 城、主地图 12×9。
- 当前扩宽版运行时按 19 字节 `PersonType` 计算人物数；原版 `dat.lib.orig` 的时期人物条目则是 200×15 字节。人物队列和道具队列分别来自 `GENERAL_QUEUE`、`GOODS_QUEUE`，时期 1 实测长度为 200 和 33 字节。
- 装载完成后月份设为 1、城池灾害状态清零、人物体力和兵力设为 100、`OldBelong` 清零。这些是运行期初始化规则，不能误写成资源文件字段。

## `.lib` 容器已确认

- 资源目录是按一基资源 ID 索引的绝对 `U32` 小端偏移，`0xffffffff` 表示缺失；资源条目和变长索引内部偏移同样使用一基条目编号。
- 原版 legacy 头为 12 字节（`ItmLen: U16`），变长 `RIDX` 为 `U16 offset + U16 length`；当前移植 wide 头/索引分别为 14/8 字节。`src/compat/baye/libArchive.ts` 要求显式选择格式并进行全部边界检查。
- `ResKey` 非零时，每个存储字节减去密钥并按 `U8` 回绕。城市名、人物名和道具名资源已能按 ID/条目定位和解密；字符编码与正式文本导出策略留待下一阶段。
- `dFgtLandF` 已从资源 2、条目 4 取得 48 个有符号字节，并固化为 `BAYE_TERRAIN_SHIFTS`。资源证据见 `fixtures/lib-original.json`。
- 本地 `dat.lib.orig` 只作研究输入，未进入版本控制。仓库额外保存由已锁定哈希版本生成的四时期结构化城市、人物和道路记录；不包含资源容器、图片或字体。
- `compat/baye/legacyScenario.ts` 已能解析四时期容器条目、GBK 名称、自定义字形、城市坐标和道路；`data/legacyScenario.ts` 可将四个时期转换为可玩的 `GameState`。未出仕人物的出现条件尚未接入领域状态。
