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

`CommandDispatcher` 先按排序后的字段名稳定拒绝未知字段，再校验版本、身份、前置摘要、命令种类和闭合参数。当前只注册 `develop_farming`；后续 Mission 通过新增命令适配扩展，不把规则复制到场景。

## 事务和幂等

- `expectedStateSha256` 是乐观并发门；陈旧请求不进入领域命令。
- 成功请求按 `commandId + canonical request SHA-256` 缓存。完全相同的重复提交返回首次结果，不再次消耗 RNG；同 ID 不同请求返回 `command_id_conflict`。
- 领域拒绝、错误 envelope、陈旧摘要、ID 冲突、next state 校验或摘要失败均不替换状态。
- ID 由调用者的显式稳定序号产生，不使用系统时间、随机 UUID、帧序或默认 RNG。
- UI 在事务后重新读取会话快照，绝不把 result 中的证据状态反向写进会话。

## 查询边界

`game_session_queries.gd` 负责城市详情、开垦可用性和默认执行者。默认执行者只按领域 `officerOrder` 选择；查询从深拷贝读取且不改变 seed、日志或行动列表。表现层仍可用快照绘制地图，但不自行判断命令合法性。

## 跨语言证据

`src/core/migration/applicationSessionContract.ts` 是 Web oracle 适配器；`godot/data/fixtures/application-session-suite-v1.json` 记录时期 1/曹操的成功、完全重复、陈旧摘要、领域拒绝、ID 冲突、未知命令和错误参数。生成器与 Godot runner 分别为：

```powershell
npm run godot:application-session:generate
npm run godot:application-session:check
npm run godot:application-session:verify
```

验证脚本把 `APPDATA` 和 `LOCALAPPDATA` 重定向到被忽略的 `godot/.godot/runtime/`。这是为了隔离 Godot 4.7.1 编辑器缓存并支持受限/CI 环境，不改变游戏运行时路径或 APK 内容。
