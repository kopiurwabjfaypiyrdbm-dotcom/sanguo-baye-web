# 选择君主与战略按钮美术实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将选择君主和战略界面的按钮统一为“漆木棕黑 + 暗金选中 + 旧宣纸文字 + 朱砂点缀”的古风写实视觉系统。

**Architecture:** 沿用工作区已有的 `assets/source/ui/` 与 `assets/production/ui/` 按钮图层，素材只提供无文字的框体和纹理，React 继续提供 DOM 文案与交互语义，`src/styles.css` 负责状态、尺寸和响应式适配。实现范围集中在君主卡片、战略顶部地图操作和底部导航，不改动游戏状态或命令逻辑。

**Tech Stack:** React 19、TypeScript、Vite、CSS、PNG UI 素材、Vitest、PowerShell。

## Global Constraints

- 默认底色使用乌木黑、深褐漆色；选中使用暖金/淡琥珀，不使用朱砂作为选中主色。
- 中文文案必须保留为 DOM 文本，按钮继续支持键盘和触摸操作。
- 正式素材放在 `assets/production/`，源素材放在 `assets/source/`，并更新 manifest/provenance。
- 不引入原版受限资源，不复制 `.reference/` 内容到产品目录。
- 最终必须运行 `npm run check`。

---

## 文件地图

- `assets/source/ui/ruler-card-frame-chroma-v1.png`：君主铭牌源素材；根据最终配色重新导出同名源图。
- `assets/production/ui/ruler-card-frame-v1.png`：君主铭牌运行时素材。
- `assets/source/ui/strategic-nav-frame-chroma-v1.png`：战略导航按钮源素材。
- `assets/production/ui/strategic-nav-frame-v1.png`：战略导航运行时素材。
- `assets/manifests/ui-button-art.json`：记录两套按钮素材的用途、来源、哈希和风格。
- `references/provenance/art.md`：补充本轮原创按钮素材与配色校准的来源说明。
- `src/styles.css:1-90`：全局颜色 token 与入口页面底色。
- `src/styles.css:481-520`：君主卡片及预览面板样式。
- `src/styles.css:628-640`：战略顶部地图操作按钮。
- `src/styles.css:1518-1595`：战略底部导航按钮及结束本月按钮。
- `src/styles.css` 的移动端与 Android 媒体查询：确保按钮尺寸、文字和触控热区不退化。
- `src/ui/CampaignSetup.tsx`、`src/ui/App.tsx`：实现时只做结构核对；若现有 class 已覆盖目标，不修改 JSX。

## Task 1: 校准按钮源素材与生产素材

**Files:**
- Modify: `assets/source/ui/ruler-card-frame-chroma-v1.png`
- Modify: `assets/production/ui/ruler-card-frame-v1.png`
- Modify: `assets/source/ui/strategic-nav-frame-chroma-v1.png`
- Modify: `assets/production/ui/strategic-nav-frame-v1.png`
- Modify: `assets/manifests/ui-button-art.json`
- Modify: `references/provenance/art.md`

**Interfaces:**
- Consumes: 已有四个 PNG 按钮资源与现有 manifest 条目。
- Produces: 同尺寸、无文字、透明背景的漆木棕黑/暗金按钮图层；manifest 中更新哈希，运行时代码无需更换 URL。

- [ ] **Step 1: 记录当前素材尺寸与哈希**

Run:

```powershell
Get-Item assets/source/ui/*.png, assets/production/ui/*.png |
  Select-Object FullName,Length
Get-FileHash assets/source/ui/ruler-card-frame-chroma-v1.png, assets/production/ui/ruler-card-frame-v1.png, assets/source/ui/strategic-nav-frame-chroma-v1.png, assets/production/ui/strategic-nav-frame-v1.png -Algorithm SHA256
```

Expected: 四个目标文件均存在，并能记录为后续 manifest 校验基线。

- [ ] **Step 2: 重新绘制/调色两个无文字按钮框体**

保持现有文件尺寸和透明安全边距，使用以下层次：深褐漆底 `#211916`，旧木棕暗部 `#4a3024`，暗金铜线 `#a7834d`，局部旧宣纸高光 `#e6d0a0`。不要把中文文案、数字徽标或具体功能名称烘焙进图片；不要把朱砂填满选中区域。

- `ruler-card-frame-v1.png`：保留较宽的四边框，适合君主名称和数量信息。
- `strategic-nav-frame-v1.png`：保留低矮横向比例，避免底部导航拥挤。

- [ ] **Step 3: 更新 manifest 和 provenance**

在 `assets/manifests/ui-button-art.json` 中保留现有 asset id 和运行时路径，只更新 `updatedAt`、两个文件及源文件哈希、style 文本和 notes。`references/provenance/art.md` 增加一段：素材为项目原创 UI 框体，参考古代漆木、铜饰、宣纸的材质语言，不使用原版二进制资源。

- [ ] **Step 4: 校验素材不包含文字和异常透明边缘**

Run:

```powershell
node -e "const sharp=require('sharp'); Promise.all(['assets/production/ui/ruler-card-frame-v1.png','assets/production/ui/strategic-nav-frame-v1.png'].map(async p=>{const m=await sharp(p).metadata(); console.log(p, m.width, m.height, m.channels, m.hasAlpha)}))"
```

Expected: 两个文件均为 RGBA 或等效带 alpha 的图层，尺寸与 Step 1 基线一致。

## Task 2: 将君主名称卡片切换到漆木/暗金状态体系

**Files:**
- Modify: `src/styles.css:481-520`
- Verify only: `src/ui/CampaignSetup.tsx:RulerScreen`

**Interfaces:**
- Consumes: `ruler-card-frame-v1.png`，现有 `.ruler-grid button`、`.selected`、`.ruler-grid strong/span` class。
- Produces: 不改变 `RulerScreen` props 或事件的君主铭牌视觉状态。

- [ ] **Step 1: 写出状态验收清单**

手动检查下列 DOM 状态均能独立识别：默认、`:hover`、`:focus-visible`、`.selected`、`:disabled`。`aria-selected` 与按钮 click 行为必须保持现状。

- [ ] **Step 2: 更新默认与选中 CSS**

将君主卡片核心规则收敛为以下视觉值，并保留现有尺寸/网格布局：

```css
.ruler-grid button {
  color: #e6d0a0;
  background-color: rgba(33, 25, 22, .9);
  background-image: url('../assets/production/ui/ruler-card-frame-v1.png');
  border: 0;
  box-shadow: 0 8px 18px rgba(0, 0, 0, .2);
}
.ruler-grid button:hover,
.ruler-grid button:focus-visible {
  filter: brightness(1.12);
  box-shadow: 0 0 0 1px rgba(167, 131, 77, .8), 0 10px 22px rgba(0, 0, 0, .24);
}
.ruler-grid button.selected {
  background-color: rgba(74, 48, 36, .94);
  filter: brightness(1.1) saturate(1.02);
  box-shadow: 0 0 0 2px rgba(230, 208, 160, .92), 0 0 18px rgba(167, 131, 77, .24), 0 12px 24px rgba(0, 0, 0, .28);
}
.ruler-grid strong { color: #f0dfb7; }
.ruler-grid span { color: #c1aa83; }
```

- [ ] **Step 3: 确认窄屏规则不裁切**

检查现有 `@media` 与 `html[data-runtime="android"]` 下的 padding、min-height 和两列/三列切换；若 `padding: 8px 10px` 造成名称或数量溢出，只将字号或内边距调整到可容纳现有长名称的最小值，不修改网格结构。

- [ ] **Step 4: 运行 TypeScript/build 快速验证**

Run: `npm run build`

Expected: Vite build 成功，且不会出现找不到 `ruler-card-frame-v1.png` 的资源错误。

## Task 3: 统一战略顶部与底部功能按钮

**Files:**
- Modify: `src/styles.css:628-640,1518-1595` 及对应移动端/Android 覆盖规则
- Verify only: `src/ui/App.tsx` 中 `.campaign-map-actions` 与 `.campaign-dock`

**Interfaces:**
- Consumes: `strategic-nav-frame-v1.png` 与现有 `.campaign-map-actions`, `.campaign-dock`, `.advance-month-action` class。
- Produces: 顶部地图操作和底部导航共享漆木/暗金语言，导航语义和事件不变。

- [ ] **Step 1: 核对战略按钮文案与 class 覆盖范围**

确认 `App.tsx` 中按钮仍为 DOM 文本：本势力、全天下、菜单、情报、城池、人物、宝物、委任、结束本月；确认不需要把中文移入 PNG。

- [ ] **Step 2: 更新顶部地图操作按钮**

将 `.campaign-map-actions button` 的背景、边框和 hover/focus 调整为深褐漆底与暗金铜线；保留现有 `min-height`、移动端隐藏前两个按钮的规则和 `:focus-visible` 可见焦点。

- [ ] **Step 3: 更新底部导航和结束本月状态**

底部导航使用同一张 `strategic-nav-frame-v1.png`，默认文字 `#e6d0a0`，active 使用 `#f0dfb7` 与暖金描边/淡琥珀内光；通知徽标可以继续使用暗金。结束本月按钮使用更亮的旧金底色，disabled 使用低饱和灰褐色，禁止使用朱砂大面积填充。

- [ ] **Step 4: 运行现有 UI/domain 测试与 build**

Run: `npm test -- --runInBand`（若 Vitest 不接受该参数，则运行 `npm test`）以及 `npm run build`。

Expected: 测试通过，构建成功，按钮 class 和资源路径无 TypeScript/Vite 错误。

## Task 4: 桌面/移动验收与交付检查

**Files:**
- Verify: `src/styles.css`
- Verify: `assets/manifests/ui-button-art.json`
- Verify: `references/provenance/art.md`

**Interfaces:**
- Consumes: Task 1–3 的素材、样式和记录。
- Produces: 可交付的视觉结果与验证证据。

- [ ] **Step 1: 启动本地预览**

Run: `npm run dev -- --host 127.0.0.1`

在选择君主界面和战略界面分别检查 1440px 宽屏、约 768px 窄屏、Android landscape 规则：文字不被素材遮挡，选中态为暖金而非朱砂，按钮仍能点击和聚焦。

- [ ] **Step 2: 检查可访问性与触控热区**

用键盘 Tab 检查君主按钮和战略按钮的 focus-visible；确认 `aria-selected` / `aria-pressed` 状态仍随交互变化，移动端按钮高度不低于现有 `44px` 触控规则。

- [ ] **Step 3: 运行项目最终检查**

Run: `npm run check`

Expected: reference check、Vitest 和 TypeScript/Vite build 全部通过。

- [ ] **Step 4: 提交实现变更**

只暂存本任务涉及的素材、manifest、provenance 和 `src/styles.css`，不要包含工作区既有的 `src/game/createGame.ts`、`docs/design/officer-character-sheet-template.md`、`assets/source/officers/` 或 `tmp/` 改动。提交信息：

```bash
git add assets/source/ui assets/production/ui assets/manifests/ui-button-art.json references/provenance/art.md src/styles.css
git commit -m "art: apply antique button surfaces"
```

## Self-review

- Spec coverage: 视觉方向、君主铭牌、战略顶部/底部按钮、素材目录、DOM 文本、状态、响应式、provenance 和 `npm run check` 均有对应任务。
- Placeholder scan: 无 TBD、TODO 或未定义的函数/路径；每个代码变更都给出了目标 selector、文件位置和验证命令。
- Type consistency: 计划复用已有 class 与静态 PNG URL，不新增跨文件 TypeScript 接口；`CampaignSetup.tsx` 与 `App.tsx` 仅作为结构核对文件。
