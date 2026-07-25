# Baye Reference Workspace

本目录记录步步高电子词典版《三国霸业》复刻工作的事实来源、版本锁定、差异状态和来源边界。

常用的 MIT C 规则与结构源码已按允许清单固定在 `vendor/baye-c-core/`，用于无需额外下载的日常差分开发。它保留许可证、固定提交和逐文件 SHA-256，并由以下命令校验：

```powershell
npm run reference:check
```

普通开发无需初始化额外参考。只有允许清单不足时，才从以下互斥级别中选择一个，把固定版本获取到被 Git 忽略的 `.reference/`：

```powershell
npm run reference:setup          # 少量补充参考
npm run reference:setup:full     # 完整 C 工程与技术文档
npm run reference:setup:offline  # 完整参考再加 GPL 离线运行壳
```

这些命令不能顺序执行，需求更高的级别已经包含较低级别。PowerShell 兼容入口 `scripts/fetch-baye-reference.ps1` 仍然保留。

如果参考仓库由 ZIP 或其他本地方式提供，可先校验本阶段使用的权威文件：

```powershell
.\scripts\verify-baye-local-reference.ps1 -SourcePath <path-to-Baye>
```

`source-manifest.json` 保存关键文件哈希。当前清单来自不含 `.git` 的用户快照，因此只能证明这些文件内容一致，不能证明快照对应锁文件中的提交；不得把两种验证混写。

参考资料的角色：

- `Baye/baye_c`：C 语言多平台移植核心，规则解析的首要事实源。
- `Baye/baye_doc/_sources`：JavaScript 数据绑定、钩子和 MOD API 文档。
- `Baye/baye_offline`：只在显式选择 offline 级别时获取的 GPL Web/WASM 适配参考。

## 协作原则

1. 所有规则结论必须记录到 `parity-matrix.md`，并链接到具体 C 函数或文档钩子。
2. 没有源码证据或可重复实验的规则标记为“推测”，不能标记为已还原。
3. `.lib`、字体、头像、地图块和原版截图默认只作本地研究，不进入正式资产。
4. 复制上游代码前先查看 `provenance/code.md`；不同目录的许可证并不一致。
5. 更新上游版本必须修改 `upstream-lock.json`，并重新执行所有差分验证。
6. `vendor/baye-c-core/` 不能手工扩充；更新时使用 `npm run reference:sync-core` 并审查生成差异。

## 文档索引

- `architecture-map.md`：上游三层架构与本项目对应关系。
- `source-manifest.json`：本阶段权威文件与内容哈希。
- `data-structure-map.md`：人物、城市、道具和剧本装载的字段/宽度/哨兵映射。
- `parity-matrix.md`：规则和行为一致性状态。
- `screen-catalog.md`：原版界面采集模板。
- `fixtures/`：可再生的最小 RNG、战斗与 `.lib` 结构参考输出。
- `provenance/`：代码、数据和美术来源边界。
- `vendor/baye-c-core/`：已获准入库的 MIT C 核心只读基线。
