# 美术资产更新记录

更新日期：2026-08-07
提交范围：Web 版本新增美术资产与资产来源文档
关联版本：本地 `main` 的资产工作区

## 一、页面 UI 资产

| 资产 | 用途 | 状态 |
| --- | --- | --- |
| `assets/production/ui/global-background-v1.png` | 全局页面山水背景，替换大面积纯色背景 | 已生成，可接入 |
| `assets/production/ui/ruler-card-frame-v1.png` | 选择君主界面的君主名称卡片边框 | 已接入 CSS |
| `assets/production/ui/strategic-nav-frame-v1.png` | 战略界面底部功能按钮边框 | 已接入 CSS |

对应的源图位于 `assets/source/ui/`，资产哈希和用途记录在：

- `assets/manifests/ui-button-art.json`
- `references/provenance/ui-button-art.md`

文字、选中态、悬停态、禁用态和数量徽标仍由 React/CSS 渲染，素材只承担边框和材质表现，方便后续修改按钮文字和布局。

## 二、战棋兵种资产

新增六类方形兵种素材，每类包含生产图和源图：

- `archer-v3-square.png`：弓兵
- `cavalry-v3-square.png`：骑兵
- `elite-cavalry-v3-square.png`：精锐骑兵
- `infantry-v3-square.png`：步兵
- `mystic-strategist-v3-square.png`：玄兵/谋士
- `navy-v3-square.png`：水兵

生产资源：`assets/production/tactical/units/`
源资源：`assets/source/tactical/units/`

这些素材按方形战棋格设计，便于后续与地形图集、选中高亮和动作动画组合。动作雪碧图和地形图集的既有记录仍分别由对应的 tactical manifest 管理。

## 三、武将美术源文件

新增或整理的武将角色设定源文件位于 `assets/source/officers/`，包括：

- 张飞统一角色模板与动作模板。
- 关羽统一角色模板。
- 陆范统一角色模板与简化模板。

目前这些文件主要用于后续批量制作武将头像、战棋单位和动作雪碧图，暂不视为已经完成的单独生产头像资源。详细来源、版本差异和审阅状态见 `assets/manifests/officers-art.json`。

## 四、接入边界

本次资产提交不包含以下代码改动：

- `src/styles.css`
- `src/game/createGame.ts`
- 其他运行逻辑和 UI 组件代码

因此协作者可以先查阅和合并资产，再按当前主线的 Web 或 Godot 接入方式选择实际使用路径。若要复现 Web 端按钮和全局背景效果，需要同时参考本地工作区中的样式改动，但它们未包含在本次资产提交中。

## 五、审阅清单

- [ ] 检查 UI 背景与按钮边框在目标分辨率下的裁切和透明边缘。
- [ ] 检查六类兵种在战棋格中的比例、底线和色彩区分度。
- [ ] 确认武将源图模板是否进入批量生产流程。
- [ ] 确认 Web 与 Godot 版本各自的资源导入路径。
- [ ] 合并前运行对应平台的资产哈希和构建检查。

## 六、排除项

本次没有提交 `.pnpm-store/`、`tmp/`、`pnpm-lock.yaml`、构建输出或本地试玩运行日志。这些内容属于本机环境或临时产物，不应进入资产版本库。
