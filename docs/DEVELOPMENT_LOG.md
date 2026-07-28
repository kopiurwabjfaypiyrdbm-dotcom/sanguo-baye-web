# 开发日志

## 2026-07-28：战略地图美术资源初版

### 已完成

- 生成战略主地图底图：山脉、河流、平原与道路采用写实水墨风格，保留大面积可叠加区域。
- 生成独立城池标记：铜金、黛黑与朱砂配色的城门印章造型，已转换为透明 RGBA PNG。
- 地图底图不包含城池、势力、文字或 UI；城池归属颜色、选中描边、名称和状态徽记保留给代码层处理。
- 新增地图资源清单：`assets/manifests/map-art.json`。

### 资源位置

- `assets/production/map/strategic-map-background-v1.png`
- `assets/production/map/city-marker-base-v1.png`
- `assets/source/map/`：保留生成源图和城池标记抠色前的 chroma-key 源图。

### 当前状态

- 本次资源暂未接入 Phaser 地图代码，等待协作者接入可编辑地图和城池数据层。
- 当前提交：`3cf3591 art: add strategic map and city marker assets`。

## 2026-07-28：立体城池与势力旗帜补充

- 新增完整立体城池模型 `assets/production/map/city-model-v2.png`，包含外城墙、角楼、城门楼、内城建筑、道路、桥梁和护城河。
- 新增独立势力旗帜 `assets/production/map/faction-flag-base-v1.png`，保留中性朱砂底色，后续由代码按势力替换颜色。
- 两项素材均已处理为透明 RGBA PNG，未覆盖上一版平面城池标记，便于后续比较和回退。
- 资源信息已追加到 `assets/manifests/map-art.json`。

### 旗帜 v2 调整

- 旗面改为宽幅金边燕尾旗，缩短旗杆并降低旗杆视觉权重。
- 旗面中央保留无图案留白，后续可由 React/Phaser 叠加单字势力简称。
- 新增 `assets/production/map/faction-flag-base-v2.png`，旧版 `v1` 继续保留作为备选。

## 2026-07-28：入口视觉资源接入

### 已完成

- 完成标题页与剧本选择页的入口美术资源整理，并纳入 `assets/production/entry/`。
- 标题页接入循环播放的入口背景视频，保留静态背景作为加载失败时的后备图。
- 接入“三国霸业”独立透明字标、四个剧本背景图和剧本选择页背景底图。
- 保留分层结构：场景底图、字标、DOM 文字、CSS 边框和透明装饰纹样彼此独立。
- 剧本选择页改为“选择剧本”标题，移除多余的绿色半透明框、云纹横饰、印章框和时期编号。
- 调整返回按钮、剧本卡片尺寸与间距，补充金属质感的选中描边和悬停状态。
- 新增入口资源清单与图层清单：
  - `assets/manifests/entry-art.json`
  - `assets/manifests/entry-layers.json`

### 代码改动

- `src/ui/CampaignSetup.tsx`：接入视频背景、剧本选择背景和分层资源引用。
- `src/styles.css`：更新标题页、剧本选择页布局、按钮、卡片选中态和响应式间距。

### 验证状态

- `git diff --check` 通过。
- Vite 生产构建通过。
- 当前提交：`3302ea7 feat: add campaign entry visuals`。
- 原版二进制、美术和字体仍未进入仓库；本次资源为项目自有或已整理的 Web 发布资源。

### 下一步

- 继续由协作者将入口视觉层接入更完整的游戏流程。
- 根据试玩反馈调整移动端适配、资源加载策略和标题页动效。
- 暂不改动地图与核心玩法规则，保持当前战略玩法和战术 Alpha 进度稳定。
