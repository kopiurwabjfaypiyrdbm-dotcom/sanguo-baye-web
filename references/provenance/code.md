# 代码来源边界

## 已确认

| 来源 | 上游位置 | 许可证标记 | 本项目策略 |
|---|---|---|---|
| C 多平台移植核心 | `Baye/baye_c` | MIT，Copyright 2015 loongw | 可研究；复用时保留许可证与声明 |
| 离线 Web 发布包 | `Baye/baye_offline` | 目录内为 GPL v2 文本 | 默认仅参考，不复制实现 |
| 脚本 API 文档 | `Baye/baye_doc` | 尚未找到独立许可证声明 | 仅作事实参考和链接引用 |

## 规则

1. 当前仓库尚未声明整体开源许可证，不通过文档推断许可证兼容性。
2. 从 MIT C 核心移植算法时，记录原文件、函数、固定提交和移植方式。
3. 复制任何非平凡代码前必须建立来源条目并保留所需声明。
4. GPL Web 包的 JavaScript/CSS/HTML 不进入主实现，除非项目明确选择兼容的发布许可证。
5. 仅凭 README 中“开源”或“重制”描述，不能推断其中二进制、美术或游戏数据获得相同授权。

## 本阶段移植记录

| 本项目文件 | 上游入口 | 方式 | 验证 |
|---|---|---|---|
| `src/compat/baye/rng.ts` | `comIn.c:gam_rand` 所调用的 Emscripten `rand_r` | 依据实际 WASM 序列重写 LCG 与 temper 步骤 | `fixtures/rng-web-wasm.json` |
| `src/compat/baye/tacticalBattle.ts` | `FgtCount.c:BuiltAtkAttr/CountAtkHurt/FgtCountWon`、`tactic.c:GetArmType` | 重写常量、C 数值顺序和分支；不链接上游代码 | `fixtures/battle-c-oracle.json` |
| `tools/reference/baye-battle-oracle.c` | 同上 | 参考专用最小 C oracle，保留原常量与运算顺序，不进入产品包 | GCC 生成固定 JSON 后与 TypeScript 差异测试 |

上述上游 C 核心标记为 MIT；离线 GPL JavaScript/WASM 只在用户本地执行以产生数值样本，没有复制进仓库或产品构建。当前快照提交身份未验证，文件身份由 `source-manifest.json` 与夹具内 SHA-256 约束。

本文件用于工程风险控制，不替代正式法律意见。
