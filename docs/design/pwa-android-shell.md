# PWA 与 Android 横屏应用壳

## 目标

以 Android APK 作为手机横屏 UI 的主要验收载体，以 PWA 作为无需应用商店的安装与离线入口。两种形态共享同一套 React、Phaser、存档和规则代码，不在原生层复制玩法。

## 当前实现

### PWA

- `manifest.webmanifest` 由 Vite 构建生成，声明中文名称、横屏方向、`standalone` 默认显示和 `fullscreen` 优先覆盖。
- 192、512 和 maskable 图标来自 `public/app-icon.svg`，通过 `npm run icons:generate` 可重复生成。
- Service Worker 使用 `generateSW` 和 `prompt` 更新策略。新版本下载后必须由玩家确认才接管并刷新，刷新不会清除 `localStorage` 战役存档。
- HTML、核心脚本、样式、结构化数据、地图入口和小型正式图片进入预缓存。
- `period-selection-background` 与标题视频超过默认 2 MiB 缓存阈值，不参与预缓存，首次访问后进入 30 天、最多 4 项的运行时缓存。离线首次启动时静态标题背景仍可用；核心玩法不依赖视频。

PWA 必须通过生产服务器验收：

```bash
npm run build
npm run preview
```

开发服务器不生成正式 Service Worker，不能作为离线或安装验收依据。

### Android

- Capacitor：8.5.0。
- 临时 application ID：`com.sumo91.sanguobaye.debug`。
- 最低 Android API：24；编译和目标 API：36。
- Web 目录：`dist`；原生 WebView 背景：`#101b19`。
- Activity 使用 `sensorLandscape`，支持设备两种横屏方向。
- 系统栏采用沉浸式隐藏，边缘滑动可临时唤回；内容延伸到显示切口短边，Web 层继续使用 `env(safe-area-inset-*)` 避让交互区。
- 原生返回键优先关闭当前战术层或 React 弹层，再从君主选择返回剧本、从剧本返回标题、从战役返回标题；标题页返回最小化应用。继承决策和正在进行的战斗不会被系统返回键静默跳过。
- 原生壳不挂载 PWA Service Worker，直接使用 APK 内嵌构建资源，避免 APK 更新后仍被旧 Web 缓存控制。
- Debug APK 已在 Windows、Android SDK Platform 36 与 Android Studio JBR 25 环境完成编译和 v2 调试签名校验；产物约 12.1 MiB。真机安装与触控验收仍待设备连接。

## 环境与命令

要求近期版本 Android Studio、Android SDK Platform 36、对应 Build Tools、Platform Tools，以及 JDK 21 或更高。`android:apk` 会优先使用 `ANDROID_STUDIO_JBR`、标准安装路径或项目所在盘的 Android Studio JBR，再回退到兼容的 `JAVA_HOME`；非标准安装位置可显式设置 `ANDROID_STUDIO_JBR`。

```bash
npm ci
npm run android:doctor
npm run android:assets
npm run android:sync
npm run android:open
```

命令职责：

- `android:add`：仅在 `android/` 不存在时首次生成平台。
- `android:assets`：从项目 SVG 重建 Android launcher 与 splash 位图。
- `android:sync`：生产构建后复制 `dist` 并同步 Capacitor 插件。
- `android:open`：在 Android Studio 打开工程。
- `android:run`：同步后选择设备运行。
- `android:apk`：同步后运行 `assembleDebug`，输出 `android/app/build/outputs/apk/debug/app-debug.apk`。

`android/app/src/main/assets/public`、`capacitor.config.json` 和插件 JSON 是同步产物，不提交也不手工修改。`android/local.properties`、APK、AAB、Gradle 构建目录和本机 IDE 状态也保持忽略。

## 真机验收门槛

至少在一台 Android 真机完成以下流程：

1. 冷启动直接进入横屏沉浸模式，无浏览器地址栏、白色启动闪烁或画面裁切。
2. 左右两种横屏方向均可使用；刘海、挖孔、圆角和手势区域不遮挡主操作。
3. 从标题开始完成时期、君主、规则选择并进入 38 城地图。
4. 完成城池命令、人物操作、结束月份、快速战斗和一次手动战斗。
5. 系统返回键按层关闭抽屉与弹层，不丢弃战斗或绕过继承；标题页返回最小化应用。
6. 手动保存后杀掉进程并重开，自动续玩和手动槽内容一致。
7. 飞行模式下重开 APK，完整战役仍可启动和推进。
8. 切后台、锁屏、恢复、系统栏临时唤回后，画布尺寸和触控坐标不偏移。
9. 连续游玩至少 30 分钟，无明显发热失控、周期性卡顿、WebView 崩溃或存档错误。

记录设备型号、Android 版本、WebView 版本、分辨率、导航模式和结果。PWA 另需在 HTTPS 或设备 `localhost` 上验证安装、离线重载和确认式更新。

## 发布前决策

- 确认永久 application ID；一旦对外发布，不再随意更换。
- 确认版本号、签名密钥保管、是否允许 Android 自动备份和隐私说明。
- 对标题视频完成来源/发行审核；未通过时从发行包移除，静态标题背景继续作为默认表现。
- Debug APK 只用于设备验收，正式分发使用签名 AAB 或明确需要的签名 APK。
