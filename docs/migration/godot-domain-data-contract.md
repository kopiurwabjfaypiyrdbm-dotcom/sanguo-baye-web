# Godot 生产领域数据契约

## 边界

`godot/data/campaigns/catalog-v1.json` 是四时期入口；`period-1.json` 至 `period-4.json` 是独立 envelope。它们由 `src/core/migration/productionDataContract.ts` 从 Web `createBundledScenario` 生成，不是第二份手工权威数据。

Godot 只读取这些 JSON，不执行 Node、TypeScript 或浏览器代码。应用层的 `ProductionDataRepository` 是 `RefCounted`，负责 allowlist 路径和 JSON IO；纯领域 `ProductionDataValidator` 与 `GameStateValidator` 接收已解析值并在场景树外完成验证，repository 只在验证通过后构造 `GameState`。

## 版本

- `productionCatalogVersion: 1`：目录格式。
- `productionDataContractVersion: 2`：生产 envelope 与初始状态格式。
- `state.schemaVersion: 6`：当前 Web 运行时/存档状态版本；它与数据契约版本不是同一概念。
- `rulesetId: baye-classic-v1`：本契约唯一允许的初始规则身份。
- 摘要：MB02 的 `canonical-json-v1`、`safe-integer-or-decimal-6-v1`、SHA-256。

未知版本、规则身份或路径必须拒绝，不做猜测式迁移。未来 schema 升级需增加版本门和显式转换。
v2 对 envelope、usage、provenance、scenario、候选、facts、state 根、graph 和实体记录使用闭合字段集合与双端一致的字段类型/枚举；领域可选字段单独列明且可选引用不得为空。结构或类型失败会在进入关系和排序转换前稳定返回。Web 新增字段不会被 v2 静默透传，必须显式投影或升级契约。

## Envelope

每个时期文件只允许以下顶层字段：

- `productionDataContractVersion`、`id`
- `usage`：内部迁移用途和再分发审查状态
- `provenance`：生成器、Web scenario factory、固定来源仓库/提交/归档摘要
- `scenario`：时期、标题、年份、规则身份、默认君主和完整玩家候选
- `facts`：城市、道路、势力、人物、道具和兵种计数
- `stateSha256`
- `state`：完整、稳定排序的初始 `GameState`

目录为每个时期固定 allowlisted 路径、envelope 摘要、state 摘要和 facts。envelope 摘要绑定元数据与状态；state 摘要只绑定权威状态。

## 稳定顺序

- 城市、人物、道具优先按上游 `sourceIndex/sourceId`，再按 ID。
- 兵种按 ID。
- 势力 record 按君主上游序号；`factionOrder` 保留领域回合语义。
- 城市道路按 `cityOrder` rank；装备槽保留语义顺序。
- 活动命令和情报 record 按 ID；人物行动/发现列表按 `officerOrder`。
- canonical object 键按 Unicode 标量排序，数组始终保留领域顺序。

修改语义数组顺序会改变 state 摘要；缺失、重复和悬空 ID 会由关系校验器拒绝。

## 生成与检查

```powershell
npm run godot:domain-data:generate
npm run godot:domain-data:check
npm run godot:domain-data:verify
```

只有 `generate` 写文件。`check` 重新从 Web oracle 构造内存期望并与版本控制内容比较，不自动修复漂移。`verify` 先运行 check，再由 Godot 4.7.1 独立加载四时期并执行正负验证。

## 兼容关系

MB01 的 `godot/data/period-1.json` 与 `dataContractVersion: 1` 保留，旧 runner、fixture 和显式 `start_spike_period_1()` 继续使用它，因此历史技术样片证据不变。生产文件使用 version 2；`GameStateValidator` 明确接受 v1 样片初态和 v2 生产初态。自 MB04 起，主场景通过生产 `GameSession` 固定启动时期 1、曹操候选。
