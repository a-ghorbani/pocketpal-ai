# CI/CD 自动构建安装包更新计划

**日期**: 2026-07-04  
**问题**: CI (C1) 无法在 push 时自动构建并发布安装包  
**目标**: 实现 push 到 main 后自动构建、打包、发布

---

## 🎯 目标

1. **自动触发构建** - Push 到 main 后自动开始构建流程
2. **生成安装包** - 构建 Android APK 和 iOS IPA
3. **自动发布** - 创建 GitHub Release 并上传安装包
4. **版本管理** - 自动 bump 版本号（可选）

---

## 📊 当前状态分析

### 现有工作流

| 文件 | 触发器 | 功能 | 问题 |
|------|--------|------|------|
| `ci.yml` | push/PR to main | Lint → Test → Build APK/IPA | ✅ 构建成功<br>❌ 不创建 Release<br>❌ Artifacts 会过期 |
| `release.yml` | 手动触发 | Version bump → Build → Upload to Store | ✅ 功能完整<br>❌ 需要手动触发<br>❌ 需要配置 secrets |

### 核心问题

1. **CI 构建的包不可直接安装**
   - Android: 构建的是 `assembleProdRelease`，但需要签名
   - iOS: 构建的是模拟器版本，不是分发版本

2. **没有自动创建 GitHub Release**
   - Artifacts 只有 90 天保留期
   - 没有版本标签和 Release Notes

3. **Release 工作流依赖过多 secrets**
   - `ANDROID_KEYSTORE_BASE64`
   - `PLAY_STORE_SERVICE_ACCOUNT_JSON`
   - `MATCH_PASSWORD` 等

---

## 🔧 解决方案

### 方案 A: 增强 CI 工作流（推荐）

修改 `ci.yml`，在 push 到 main 时自动创建 Pre-release。

#### 修改内容

**1. 添加 Release 构建 Job**

```yaml
# 在 ci.yml 中添加新 job
build-and-release:
  runs-on: ubuntu-latest
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  needs: [build-and-test]
  steps:
    - name: Download Android APK
      uses: actions/download-artifact@v4
      with:
        name: android-release-apk
        
    - name: Create GitHub Release
      uses: softprops/action-gh-release@v1
      with:
        files: android-release-apk/*.apk
        tag_name: "ci-build-${{ github.run_number }}"
        name: "CI Build #${{ github.run_number }}"
        draft: false
        prerelease: true
        generate_release_notes: true
```

**2. 配置 Android 签名**

创建签名的 Release APK：

```yaml
- name: Set up Android Keystore
  run: |
    echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 --decode > android/app/pocketpal-release-key.keystore
    
- name: Build Signed Android Release
  working-directory: android
  env:
    APP_RELEASE_STORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
    APP_RELEASE_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
  run: ./gradlew assembleProdRelease
```

**3. 添加提交信息到 Release Notes**

```yaml
- name: Generate Release Notes
  run: |
    echo "## CI Build #${{ github.run_number }}" > release-notes.md
    echo "" >> release-notes.md
    echo "**Commit**: ${{ github.sha }}" >> release-notes.md
    echo "**Author**: ${{ github.actor }}" >> release-notes.md
    echo "" >> release-notes.md
    echo "### Changes" >> release-notes.md
    git log -1 --pretty=format:"- %s" >> release-notes.md
```

---

### 方案 B: 创建独立的 Auto-Release 工作流

创建新的 `.github/workflows/auto-release.yml`，专门处理自动发布。

#### 工作流设计

```yaml
name: Auto Release

on:
  push:
    branches:
      - main
    paths-ignore:
      - '**.md'
      - 'docs/**'
      - 'src/locales/**'

jobs:
  build-and-release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22.21.0'
          
      - name: Install dependencies
        run: yarn install
        
      - name: Setup Java
        uses: actions/setup-java@v3
        with:
          java-version: '17'
          distribution: 'temurin'
          
      # Android 签名配置
      - name: Decode Keystore
        run: |
          echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > android/app/keystore.jks
          
      - name: Build Android Release
        working-directory: android
        env:
          KEYSTORE_PATH: keystore.jks
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
        run: ./gradlew assembleProdRelease
        
      # 创建 GitHub Release
      - name: Create Release
        id: create_release
        uses: softprops/action-gh-release@v1
        with:
          tag_name: auto-v${{ github.run_number }}
          release_name: Auto Build v${{ github.run_number }}
          body_path: release-notes.md
          draft: false
          prerelease: true
          files: |
            android/app/build/outputs/apk/prod/release/*.apk
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 🔐 必要的 Secrets 配置

在 GitHub Repository Settings → Secrets and variables → Actions 中添加：

### Android 签名（必需）

| Secret 名称 | 说明 | 如何获取 |
|--------------|------|-----------|
| `ANDROID_KEYSTORE_BASE64` | Base64 编码的 keystore 文件 | `base64 -i keystore.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore 密码 | 创建 keystore 时设置 |
| `ANDROID_KEY_ALIAS` | 密钥别名 | 创建 keystore 时设置 |
| `ANDROID_KEY_PASSWORD` | 密钥密码 | 创建 keystore 时设置 |

### iOS 签名（可选，复杂）

| Secret 名称 | 说明 |
|--------------|------|
| `IOS_CERTIFICATE_BASE64` | Base64 编码的证书 |
| `IOS_CERTIFICATE_PASSWORD` | 证书密码 |
| `IOS_PROVISION_PROFILE_BASE64` | Base64 编码的 provision profile |

> ⚠️ iOS 真机构建需要在 macOS runner 上运行，且配置复杂。建议先实现 Android 自动发布。

---

## 📝 实施步骤

### 第一阶段：Android 自动发布（1-2 天）

1. **生成 Android 签名密钥**（如果还没有）
   ```bash
   keytool -genkeypair -v \
     -keystore pocketpal-release-key.keystore \
     -alias pocketpal_key_alias \
     -keyalg RSA \
     -keysize 2048 \
     -validity 10000
   ```

2. **编码 Keystore 并添加到 GitHub Secrets**
   ```bash
   base64 -i pocketpal-release-key.keystore > keystore-base64.txt
   # 复制内容到 GitHub Secrets: ANDROID_KEYSTORE_BASE64
   ```

3. **修改 `ci.yml`**
   - 添加 `build-and-release` job
   - 配置签名构建
   - 添加 GitHub Release 创建步骤

4. **测试**
   - Push 一个测试提交到 main
   - 检查 Actions 页面是否自动触发
   - 验证 GitHub Release 是否创建成功

### 第二阶段：iOS 自动发布（3-5 天）

1. **配置 iOS 签名证书**
   - 导出 Distribution Certificate
   - 下载 Provision Profile
   - 编码并添加到 Secrets

2. **修改 `ci.yml` 或创建独立工作流**
   - 添加 macOS runner 支持
   - 配置代码签名
   - 构建 IPA 包

3. **测试**
   - 验证 IPA 可以安装到设备
   - 检查 TestFlight 上传（可选）

### 第三阶段：版本管理优化（2-3 天）

1. **自动版本 Bump**
   - 使用 `actions-version-updater` 或类似工具
   - 或者解析 commit message 自动决定版本号

2. **Release Notes 自动化**
   - 使用 `release-drafter` action
   - 或者解析 Conventional Commits

3. **添加 Changelog**
   - 自动生成 CHANGELOG.md

---

## 🚀 快速实施方案（最小可行方案）

如果希望**最快速度**实现自动发布，建议：

### 步骤 1: 只修改 CI 工作流（1 小时）

在 `ci.yml` 的 `build-android` job 末尾添加：

```yaml
- name: Create GitHub Release (CI Build)
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  uses: softprops/action-gh-release@v1
  with:
    files: android/app/build/outputs/apk/prod/release/app-prod-release.apk
    tag_name: "ci-${{ github.run_number }}"
    name: "CI Build #${{ github.run_number }}"
    draft: false
    prerelease: true
    body: |
      🤖 自动构建 #${{ github.run_number }}
      
      **Commit**: ${{ github.sha }}
      **Author**: ${{ github.actor }}
      
      ---
      
      ### 📦 安装包
      - Android APK (未签名，仅用于测试)
      
      ### 📝 最新提交
      ${{ github.event.head_commit.message }}
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 步骤 2: 配置 Android 签名（1 天）

1. 生成 keystore（如果没有）
2. 添加到 GitHub Secrets
3. 修改构建命令使用签名

### 步骤 3: 测试（1 小时）

Push 测试提交，验证 Release 自动创建。

---

## 📋 检查清单

实施前检查：

- [ ] 是否已生成 Android 签名密钥？
- [ ] 是否已将密钥添加到 GitHub Secrets？
- [ ] 是否已在 GitHub 启用 Actions 权限？
- [ ] 是否测试过手动触发 Release 工作流？
- [ ] 是否配置了 `GITHUB_TOKEN` 权限？

实施后验证：

- [ ] Push 到 main 后是否自动触发构建？
- [ ] GitHub Release 是否自动创建？
- [ ] APK/IPA 是否成功上传到 Release？
- [ ] 安装包是否可以正常安装？
- [ ] Release Notes 是否正确生成？

---

## 🔄 回滚计划

如果自动发布出现问题：

1. **禁用工作流**
   - 在 GitHub Actions 页面禁用工作流
   - 或者删除/重命名 workflow 文件

2. **手动发布**
   - 使用 `release.yml` 手动触发
   - 或者本地构建并手动上传

3. **修复问题**
   - 检查 Actions 日志
   - 修复配置错误
   - 重新启用工作流

---

## 📚 参考资料

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [softprops/action-gh-release](https://github.com/softprops/action-gh-release)
- [Android 签名文档](https://developer.android.com/studio/publish/app-signing)
- [fastlane 文档](https://docs.fastlane.tools/)

---

## 🎯 预期成果

实施后，你将获得：

1. ✅ Push 到 main 后 **5-10 分钟**自动生成 GitHub Release
2. ✅ Release 页面可直接下载安装包
3. ✅ 每次构建都有版本标签和 Release Notes
4. ✅ 减少手动操作，提高发布效率

---

**建议优先实施**: 方案 A + 快速实施方案（最小可行方案）

**预计总时间**: 2-3 天（包括测试和调整）
