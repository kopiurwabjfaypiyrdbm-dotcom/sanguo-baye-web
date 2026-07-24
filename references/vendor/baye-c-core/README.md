# Baye C comparison core

本目录是为差分开发筛选并固定的上游 C 参考源码，不参与产品构建。

协作者可以直接在这里查阅人物、城池、战略命令、战斗、AI、时期加载、资源结构和主循环，不必先下载完整上游仓库。来源提交和逐文件哈希见 `UPSTREAM.md` 与 `MANIFEST.json`。

## 使用规则

1. 实现规则前先定位具体 C 函数，并在 `references/parity-matrix.md` 记录入口。
2. 复制或移植非平凡实现时，在 `references/provenance/code.md` 补充来源记录。
3. 可重复输入和原版输出进入 `references/fixtures/`，产品代码进入 `src/compat/baye/` 或 `src/core/`。
4. 本目录只作只读基线；不要直接手改上游源码。
5. 更新必须通过 `npm run reference:sync-core`，随后执行 `npm run reference:check`。

## 明确排除

- `dat.lib.orig` 及生成的数据数组；
- 字体、图片、音视频、WASM 和其他二进制；
- GPL 离线 Web 运行壳；
- 未确认独立再分发许可证的技术文档；
- 平台工程、生成资源和无关第三方子模块。

这些资料需要时通过 `npm run reference:setup` 获取到被 Git 忽略的 `.reference/`，不能从该目录反向补入。
