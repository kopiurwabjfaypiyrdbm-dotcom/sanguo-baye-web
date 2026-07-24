# NOTICE

本项目是一个新的 Web 原型工程，用于探索《三国霸业》风格的现代化策略游戏实现。

当前仓库包含的设计文档和数据整理文件来自本项目开发过程中的分析与导出。iBaye / baye-alpha / baye-fmj-app 作为参考实现和数据来源使用，后续开发必须保留固定提交、文件位置和许可证记录，并避免直接混入不清楚授权的素材。

当前确认的上游许可证边界并不统一：`Baye/baye_c` 目录声明 MIT，`Baye/baye_offline` 目录放置 GPL v2 许可证，技术文档、`.lib`、字体、原版图片和其他二进制资源仍需逐项确认。参考文件默认通过 `scripts/fetch-baye-reference.ps1` 下载到不受 Git 跟踪的 `.reference/`。

计划中的长期实现：

- 核心规则使用 TypeScript 实现
- 游戏数据使用 CSV/JSON 管理
- 画面渲染使用 Phaser
- 面板 UI 使用 React

规则还原结论、视觉采集和资产来源记录见 `references/`。正式发布前需要再次审计所有第三方代码、数据、美术、字体和音频。

在公开发布或引入美术、音频、原版资源前，需要再次确认对应资源的授权边界。

## Baye C core

`tools/reference/baye-battle-oracle.c` and the corresponding TypeScript compatibility formulas are derived from `Baye/baye_c` in `erduoniba/baye-fmj-app`.

The MIT License (MIT)

Copyright (c) 2015 loongw

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
