# MB00 自治推进控制层报告

- 日期：2026-08-02
- 基线：`codex/godot-migration-spike` / `0cdcc3f`

## 结果

- 新增不可由执行者自行弱化的完整迁移总委托 `docs/mission-briefs/MB00-godot-full-migration-program.md`。
- 新增机器路线图、唯一当前状态账本、人类路线图、决策/报告约定和根 `AGENTS.md` 恢复协议。
- 新增 `npm run godot:program-check`；该命令在独立 Node 进程中只读取仓库证据，验证章程、路线图、账本、依赖、文件、分支及已完成提交，然后输出唯一恢复快照。
- 状态账本恢复出的当前工作为 `MB02 / brief_pending`，已完成 Mission 为 `MB01`，无阻塞 Mission，下一动作是使用 `$mission-brief` 只生成 MB02。

## 恢复演练

执行：

```powershell
npm run godot:program-check
```

结果：

- 程序：`godot-full-migration`
- 分支：`codex/godot-migration-spike`
- 当前 Mission：`MB02 Deterministic migration verification platform`
- 阶段：`brief_pending`
- 当前简报：不存在，符合“下一步骤只生成简报”的协议
- 完成：`MB01`
- 阻塞：无

同一命令进行了四项内存故障注入，均被校验器拒绝：重复完成记录、选择依赖未满足的 MB03、在执行阶段缺少当前简报，以及未经批准把 `charterRevision` 改为 2。

## 恢复结论

新执行上下文不需要继承本对话即可从 `AGENTS.md → MB00 → roadmap JSON → state JSON → 最近报告 → parity matrix → Git` 重建唯一当前位置。对话压缩摘要不再承担程序状态职责；若摘要与账本冲突，校验器和 `AGENTS.md` 明确要求以账本为准。

该演练只证明仓库控制面可恢复，不承诺外部网络、权限、设备或宿主进程永不中断。此类中断恢复后仍需重新运行同一检查。
