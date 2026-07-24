# Baye Reference Workspace

本目录记录步步高电子词典版《三国霸业》复刻工作的事实来源、版本锁定、差异状态和来源边界。

上游代码或原版二进制不会直接复制进本仓库。协作者使用脚本将固定版本获取到被 Git 忽略的 `.reference/`：

```powershell
.\scripts\fetch-baye-reference.ps1
```

需要研究离线 Web 运行壳时可以显式加入 GPL 运行时文件：

```powershell
.\scripts\fetch-baye-reference.ps1 -IncludeOfflineRuntime
```

默认参考范围：

- `Baye/baye_c`：C 语言多平台移植核心，规则解析的首要事实源。
- `Baye/baye_doc/_sources`：JavaScript 数据绑定、钩子和 MOD API 文档。
- `Baye/baye_offline` 中少量说明及桥接文件：Web/WASM 适配参考。

## 协作原则

1. 所有规则结论必须记录到 `parity-matrix.md`，并链接到具体 C 函数或文档钩子。
2. 没有源码证据或可重复实验的规则标记为“推测”，不能标记为已还原。
3. `.lib`、字体、头像、地图块和原版截图默认只作本地研究，不进入正式资产。
4. 复制上游代码前先查看 `provenance/code.md`；不同目录的许可证并不一致。
5. 更新上游版本必须修改 `upstream-lock.json`，并重新执行所有差分验证。

## 文档索引

- `architecture-map.md`：上游三层架构与本项目对应关系。
- `parity-matrix.md`：规则和行为一致性状态。
- `screen-catalog.md`：原版界面采集模板。
- `provenance/`：代码、数据和美术来源边界。
