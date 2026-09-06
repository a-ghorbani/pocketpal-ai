# PocketPal 本地构建规则

不要往本文件写日志和任何带日期的东西，这不是倒垃圾的地方。
编译默认是编译安卓版本。iOS版本已经暂停开发了

## 工作原则

解决根本问题，拒绝任何兜底；有问题直接暴露。统一维护、统一修复，避免特殊代码不断膨胀。鼓励调查、详细日志和探针，必要时联网核对事实。

## 构建策略

- 本项目只做本地构建，不使用远程 CI 或 GitHub Actions。
- `.github/workflows/` 必须保持为空且不重新引入 workflow；本地验证和构建是唯一交付路径。
- 不要把 APK、构建日志、临时配置或本机缓存提交到 Git。

## Windows 本地环境

本机已经验证可复用的工具路径：

- JDK 17：`C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot`
- Android SDK：`D:\AI\audio\android-sdk`
- Gradle 用户目录：`D:\AI\audio\android-gradle-user-home`
- 当前仓库 wrapper 版本以 `android/gradle/wrapper/gradle-wrapper.properties` 为准；不要擅自改成另一个项目的 wrapper 版本。

构建前在 PowerShell 中设置：

```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
$env:ANDROID_HOME = 'D:\AI\audio\android-sdk'
$env:ANDROID_SDK_ROOT = 'D:\AI\audio\android-sdk'
$env:GRADLE_USER_HOME = 'D:\AI\audio\android-gradle-user-home'
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:Path"
```

`android/local.properties` 是被 `.gitignore` 忽略的本机配置，可写入：

```properties
sdk.dir=D\:\\AI\\audio\\android-sdk
```

## 依赖、验证与构建

首次准备依赖：

```powershell
cmd /c yarn.cmd install --ignore-scripts
cmd /c npx.cmd patch-package
```

`postinstall` 依赖 Bash；Windows 上使用 `--ignore-scripts` 后必须显式运行 `patch-package`，否则仓库中的依赖补丁不会生效。当前默认不从源码编译 `llama.rn`，因此不需要额外拉取 OpenCL headers。

Android 本地构建：

```powershell
cmd /c yarn.cmd build:android:release
```

产物位于 `android/app/build/outputs/apk/release/`。本机没有提交 Firebase 或发布签名凭据时，使用被 `.gitignore` 忽略的本地 `android/app/google-services.json`、`.env` 和签名配置；不得把占位配置写进源码或提交。

Windows 增量构建：

- Windows CMake/Ninja 可能因为仓库绝对路径过长而触发 260 字符限制；本仓库构建时固定使用短盘符 `P:`，避免路径长度问题。
- 首次构建或每次新开终端时执行 `subst P: D:\AI\LLM\pocketpal-experimental`，然后从 `P:\` 直接构建；后续保持同一短路径以复用 Gradle/CMake/Kotlin 增量产物。
- 日常增量构建不要执行 `clean`；只有在有明确缓存或构建状态错误证据时才清理对应缓存。

```powershell
subst P: D:\AI\LLM\pocketpal-experimental
Set-Location P:\
cmd /c yarn.cmd build:android:release
```

## 构建失败处理

- 如果构建日志明确是系统内存/提交内存不足，先停止当前构建，检查并报告占用资源的其他构建和虚拟机，让用户清理内存后再继续。
- 不要因为资源失败就怀疑源码、修改生产代码、盲目清缓存或连续重试；只有出现新的源码/依赖错误证据时才继续定位。