# 协作开发指南

## 首次拉取

```bash
npm ci
npm run check
```

`npm ci` 只在首次拉取或锁文件变化后执行。`npm run check` 用于首次接手和提交前验证，不是常驻服务；其中 Vitest 会短暂启动并行工作进程，任务完成后自动退出。

日常开发运行一个服务器即可：

```bash
npm run dev
```

不要在多个终端重复启动开发服务器。Vite 会持续监视整个仓库，应在原终端按 `Ctrl+C` 结束；配置已启用严格端口检查，避免端口被占用时悄悄产生第二个实例。

常用的 MIT C 核心已经筛选到 `references/vendor/baye-c-core/`，普通功能开发不依赖任何个人电脑上的外部目录，也不需要执行参考初始化命令。

需要额外资料时，只选择符合需求的一个命令：

```bash
npm run reference:setup          # 少量补充参考
npm run reference:setup:full     # 完整 C 工程与技术文档，替代上一命令
npm run reference:setup:offline  # 再加入 GPL 离线运行壳，替代前两个命令
```

这些命令不是顺序流程。它们按 `references/upstream-lock.json` 获取固定提交并放到被 Git 忽略的 `.reference/baye-fmj-app/`；GPL 内容只能作本地参考。

## 对比式开发闭环

1. 在 `references/vendor/baye-c-core/` 定位规则函数、结构体和常量。
2. 在 `references/parity-matrix.md` 记录事实源、当前状态与下一验证。
3. 把最小固定输入和参考输出写入 `references/fixtures/`。
4. 在 `src/compat/baye/` 重写已验证兼容算法，在 `src/core/` 接入可玩规则。
5. 对有意现代化的行为写清理由，不将其标记为“原版一致”。
6. 提交前运行 `npm run check`。

只有源码定位、可重复实验或固定参考输出支持的结论才能标记为已验证。无法确认的规则应标记为“推测”或“临时实现”。

## 更新参考基线

更新上游不是普通功能提交的一部分，应单独进行：

1. 修改 `references/upstream-lock.json` 的提交和树哈希。
2. 执行 `npm run reference:setup`。
3. 执行 `npm run reference:sync-core`。
4. 审查 `references/vendor/baye-c-core/` 的全部差异。
5. 更新来源记录、夹具和一致性矩阵。
6. 执行 `npm run check`。

同步脚本使用明确允许清单，不会自动引入原版资源、字体、图片、WASM 或未验证许可证的文档。

## 许可证与资产边界

- 已筛选 C 核心保留上游 MIT 许可证和逐文件来源。
- `baye_offline` 仅作本地 GPL 参考，默认不进入产品实现。
- `.lib`、字体、图片、音视频和原版截图默认只作本地研究。
- 不要把 `.reference/` 中的内容直接复制到 `src/` 或正式资产目录。
- 引入任何第三方内容前更新 `NOTICE.md` 和 `references/provenance/`。
