# 美术与字体来源边界

## 默认政策

- 原版截图、头像、地图块、动画帧和字体只作本地研究，保存在 `.reference/`。
- 上游仓库中出现某个资源，不代表该资源自动继承代码目录的许可证。
- 正式发布资产必须是自行创作、明确授权或许可证兼容的素材。
- 基于原版观察进行重绘时，保留“参考了哪些视觉语法”的记录，避免逐像素复制来源不明素材。

## 正式资产清单字段

```text
id
category
author
sourceFile
exportFiles
license
licenseUrl
derivedFrom
createdAt
sha256
generationModel
generationPrompt
reviewStatus
```

`generationModel` 和 `generationPrompt` 仅在使用生成式工具时填写。生成资产仍需人工检查历史服饰、手部、兵器结构、文字和风格一致性。

## 字体

优先使用明确允许嵌入和再分发的中文字体，并将许可证随构建产物保留。系统字体可以作为开发回退，但不能假定所有平台具有相同字形和度量。

### Vendored: Noto Serif SC

- **Path:** `godot/font/Noto_Serif_SC/`（含 `OFL.txt`）
- **Use:** Godot title / campaign-setup plaque buttons (`EntryChrome`), matching Web `Georgia, "Noto Serif SC", serif` + weight 800
- **Face used at runtime:** `static/NotoSerifSC-ExtraBold.ttf`
- **License:** SIL Open Font License 1.1
- **Source:** Google Fonts / Noto Serif SC
