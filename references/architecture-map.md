# 上游架构映射

## 已确认结构

```text
baye_offline
  HTML / CSS / Canvas / 触摸与键盘 / 存档和版本选择
                 │
                 ▼
          JavaScript bridge
                 │
                 ▼
       baye.v2.js + baye.v2.wasm
                 │
                 ▼
baye_c
  C 游戏主循环 / 内政 / 战斗 / AI / 数据 / LCD 绘制
                 │
                 ▼
       platform/js 或 platform/win
```

`baye_c/src/CMakeLists.txt` 将同一套核心 C 文件与不同平台适配层链接。Web 入口最终调用 `GamConInit()` 和 `GamBaYeEng()`，因此 Web 版本属于原 C 引擎的 WASM 移植，而不是 JavaScript 规则重写。

`baye_doc` 是 Sphinx 生成的 JavaScript 脚本与 MOD API 文档。它解释 `baye.data` 数据绑定和 `baye.hooks` 钩子，但不是完整游戏设计文档。

## 本项目映射

| 上游 | 本项目 | 当前策略 |
|---|---|---|
| C 全局结构和 `.lib` 数据 | `src/core/types.ts`、未来导入器 | 解析后建立显式领域模型 |
| C 内政、战斗和 AI | `src/core/*` | 逐模块重写并做差分测试 |
| LCD 和菜单状态机 | React + Phaser | 保留流程语义，现代化表现 |
| JS bridge、WASM loader | 参考工具 | 不直接复制 GPL 实现 |
| JavaScript hooks | 可配置规则层 | 评估为 MOD/兼容扩展接口 |

## 权威级别

1. 固定提交中的 C 行为与可重复运行结果。
2. C 源码中的结构、常量和默认公式。
3. `baye_doc/_sources` 中明确标注的引擎默认算法。
4. 上游 README、MOD 说明和社区经验。
5. 当前项目中的临时实现和未经验证的推测。
