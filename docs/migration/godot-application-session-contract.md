# Godot 生产应用会话契约

## 状态所有权

`godot/src/application/game_session/game_session.gd` 是原生客户端唯一的战役状态所有者。它是场景树外的 `RefCounted`，不作为 Node、Autoload 或全局单例。场景只能提交命令、执行只读查询并取得深拷贝快照；领域命令接收旧 `GameState` 并返回独立的 `next_state`，完整校验成功后由会话一次提交。

主场景固定启动时期 1、`rulerSourceIndex: 1`（曹操）。生产会话从 MB03 catalog 加载时期 1–4，可选择 catalog 明列的任一君主。玩家切换只更新 `playerFactionId`、`activeFactionId` 和按稳定 faction ID 排序处理的唯一 `isPlayer` 标记，不调用 RNG。MB01 的 v1 JSON、专用启动入口和最小存档格式继续作为历史兼容证据。

## 命令协议 v1

请求 envelope 是闭合对象：

```json
{
  "commandEnvelopeVersion": 1,
  "commandId": "strategy-screen-000001",
  "expectedStateSha256": "<canonical state SHA-256>",
  "kind": "develop_farming",
  "parameters": { "cityId": "city-12", "officerId": "officer-1" }
}
```

结果 envelope 固定包含 `resultEnvelopeVersion`、请求身份、`ok/code/error`、`stateChanged`、前后 state SHA-256、领域 `receipt` 和当前深拷贝状态。摘要复用 MB02 的 `canonical-json-v1`，不建立应用层专用序列化。

`CommandDispatcher` 先按排序后的字段名稳定拒绝未知字段，再校验版本、身份、前置摘要、命令种类和闭合参数。MB06 时显式注册 11 项生产命令：七项内政以及奖赏、任命太守、赏赐道具、卸下装备；扩展必须新增 adapter 注册，不把规则复制到场景。

## 事务和幂等

- `expectedStateSha256` 是乐观并发门；陈旧请求不进入领域命令。
- 成功请求按 `commandId + canonical request SHA-256` 进入显式有序的 256 条紧凑幂等窗口，缓存不含完整状态。紧邻的完全相同重复可重建首次 result；状态已继续前进时返回 `ok: true / code: already_committed / stateChanged: false` 和当前快照，不再次消耗 RNG；同 ID 不同请求返回 `command_id_conflict`。超出窗口的旧请求因 before 摘要陈旧而拒绝，窗口淘汰不依赖 Dictionary 顺序。
- 领域拒绝、错误 envelope、陈旧摘要、ID 冲突、next state 校验或摘要失败均不替换状态。
- ID 由调用者的显式稳定序号产生，不使用系统时间、随机 UUID、帧序或默认 RNG。
- UI 在事务后重新读取会话快照，绝不把 result 中的证据状态反向写进会话。

## 查询边界

`game_session_queries.gd` 负责城市详情、内政候选以及人物管理 DTO。默认执行者和城内人物只按领域 `officerOrder` 选择，库存与装备保持数组顺序；人物 DTO 包含太守、装备槽、基础/有效属性和逐操作可用性。查询从深拷贝读取且不改变 seed、日志或行动列表。表现层仍可用快照绘制地图，但不自行判断命令合法性。

`restore_snapshot()` 提供 MB04 范围内的内存恢复演练：先深拷贝、完整校验和计算 canonical 摘要，再一次替换状态并清空进程内命令缓存。它不是生产存档 schema；多槽存档、命令幂等记录持久化和版本迁移仍属于 MB20。

生产会话只加载并缓存当前时期的 catalog entry、envelope 和初始状态；切换时期时替换该缓存，不在 Android 主线程常驻四时期解码状态。MB01 `sanguo-baye-godot-spike` 存档仓库只接受 `dataContractVersion: 1`；生产 v2 主场景禁用存读入口，避免在 MB20 前伪装成样片存档。

## 跨语言证据

`src/core/migration/applicationSessionContract.ts` 是 Web oracle 适配器；`godot/data/fixtures/application-session-suite-v1.json` 记录时期 1/曹操的成功、完全重复、陈旧摘要、领域拒绝、ID 冲突、未知命令、未知版本、缺失/错误参数、稳定字段错误顺序及 Unicode 空白字符串拒绝。双方以显式 ECMAScript TrimString 码点集合定义“非空字符串”，不依赖宿主 `trim()`/`strip_edges()` 差异。生成器与 Godot runner 分别为：

```powershell
npm run godot:application-session:generate
npm run godot:application-session:check
npm run godot:application-session:verify
```

MB05 在同一 fixture 内追加紧凑的内政序列；MB06 继续追加人物/装备连续序列和独立边界矩阵。新增步骤保存 result core 和 state SHA，不重复嵌入完整状态。支持命令及参数见 `docs/migration/godot-internal-affairs-contract.md` 与 `docs/migration/godot-officer-management-contract.md`。

验证脚本把 Windows `APPDATA/LOCALAPPDATA` 和跨平台 `XDG_CONFIG_HOME/XDG_CACHE_HOME/XDG_DATA_HOME` 重定向到被忽略的 `godot/.godot/runtime/`。`npm run godot:project:verify` 统一覆盖领域、表现/触控、editor import 和主场景启动；隔离不改变游戏运行时路径或 APK 内容。
