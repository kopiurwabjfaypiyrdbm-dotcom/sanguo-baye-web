# 开发日志

## 2026-08-01：PWA 与 Android 横屏应用壳

### 已完成

- 加入 PWA 安装清单、192/512/maskable 图标、确认式 Service Worker 更新、离线就绪/离线状态和安装提示。
- 核心游戏壳纳入预缓存；入口视频和超过 2 MiB 的选时期背景改为按需 Cache First，避免首次安装被大型装饰媒体阻塞。
- 加入 Capacitor 8 Android 工程，临时包名 `com.sumo91.sanguobaye.debug`，Web 产物从 `dist` 同步。
- Android 原生层锁定 `sensorLandscape`，启用沉浸式系统栏、刘海短边布局、深色启动主题和项目自有应用图标。
- 系统返回键会优先关闭战术边缘层、命令确认、月末、目录和城池抽屉，再逐层返回标题；标题页返回会最小化应用。
- 增加 Android 图标/启动图生成脚本、跨平台 Debug Gradle 构建脚本与 `android:doctor`、`android:sync`、`android:apk` 等命令。

### 验证状态

- `npm run check` 通过：51 个固定 C 参考文件校验、356 项测试通过、4 项本地参考测试跳过，TypeScript 与生产构建成功。
- PWA 生成 22 个去重后预缓存条目，约 4.5 MiB；大型入口媒体未进入预缓存。
- 844×390 生产预览实测离线就绪、重载接管、无页面溢出、新建战役与四剧本入口；控制台无警告或错误。
- `npm audit --omit=dev --audit-level=high` 报告生产依赖 0 个已知漏洞。PWA/Capacitor CLI 的开发构建依赖仍有上游审计告警，不进入浏览器或 APK 运行时。
- `npm run android:assets` 和 `npm run android:sync` 通过；Capacitor Doctor 确认 Android、CLI 与 Core 均为 8.5.0。
- Android Studio 2026.1、SDK Platform 36 与 Build Tools 35 环境已完成首次原生编译；修正 `MainActivity.onResume()` 可见性，并让构建脚本自动选择 JDK 21+ 的 Android Studio JBR。Debug APK 的 v2 调试签名、包名、API 24/36 与 `sensorLandscape` 声明已核验；真机安装和触控验收待设备连接。

### 许可证边界

- 应用图标是项目内新建的代码原生矢量图，不含原版二进制、美术或字体。
- 标题视频仍保留 `integration-pending` 来源状态，只作可选装饰资源；不影响离线核心游戏壳。

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
