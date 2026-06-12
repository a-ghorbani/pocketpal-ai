# 🚀 推送代码并创建 Pull Request - 完整指南

## 📋 已完成的修改

### ✅ 实现了 2 个 Issue：
1. **#755**: 在 AI 回复中显示模型名称
2. **#773**: 添加 HF-Mirror 支持（中国大陆用户）
3. **(附带) #753**: 改进 URL 样式（顺带完成）

### 📂 修改的文件 (10 个)：
1. `src/utils/types.ts`
2. `src/hooks/useChatSession.ts`
3. `src/components/AssistantTurnFooter/AssistantTurnFooter.tsx`
4. `src/components/AssistantTurnFooter/styles.ts`
5. `src/components/MarkdownView/styles.ts`
6. `src/config/urls.ts`
7. `src/store/HFStore.ts`
8. `src/screens/SettingsScreen/SettingsScreen.tsx`
9. `src/locales/en.json`
10. `src/locales/zh.json`

### 🌿 当前状态：
- ✅ 代码已提交到本地分支 `feat/hf-mirror-support`
- ❌ 尚未推送到 GitHub
- ❌ 尚未创建 Pull Request

---

## 🔧 步骤 1：Fork 仓库（如果还没有）

### 方法 A：使用浏览器（推荐）
1. 访问原始仓库：https://github.com/a-ghorbani/pocketpal-ai
2. 点击右上角的 **"Fork"** 按钮
3. 等待 fork 完成（会跳转到你的 GitHub 账号）

### 方法 B：使用 GitHub CLI（如果已安装）
```bash
# 安装 GitHub CLI（如果没有）
# 然后 fork 仓库
gh repo fork a-ghorbani/pocketpal-ai --clone=false
```

---

## 📤 步骤 2：推送代码到你的 Fork

### 2.1 添加你的 Fork 作为新的 Remote
```bash
cd "C:\Users\123\WorkBuddy\2026-06-13-03-19-16\pocketpal-ai"

# 将 YOUR_USERNAME 替换为你的 GitHub 用户名
git remote add myfork https://github.com/YOUR_USERNAME/pocketpal-ai.git
```

### 2.2 推送分支到你的 Fork
```bash
# 推送分支
git push myfork feat/hf-mirror-support
```

**如果提示需要登录**：
- GitHub 会打开浏览器让你登录
- 或者，使用 Personal Access Token (PAT)：
  ```bash
  # 使用 PAT 推送
  git push https://YOUR_PAT@github.com/YOUR_USERNAME/pocketpal-ai.git feat/hf-mirror-support
  ```

---

## 🎯 步骤 3：创建 Pull Request

### 方法 A：使用浏览器（推荐）
1. 推送成功后，GitHub 会在命令行显示链接，直接打开它
2. 或者，访问你的 fork：https://github.com/YOUR_USERNAME/pocketpal-ai
3. 点击 **"Compare & pull request"** 按钮
4. 填写 PR 标题和描述（见下方的 **PR 模板**）
5. 点击 **"Create pull request"**

### 方法 B：使用 GitHub CLI（如果已安装）
```bash
# 创建 PR
gh pr create --base main --head feat/hf-mirror-support --title "Feat: Show model name in chat (#755) + HF-Mirror support (#773)" --body "$(cat PR_DESCRIPTION.md)"
```

---

## 📝 PR 标题和描述模板

### PR 标题：
```
Feat: Show model name in chat (#755) + HF-Mirror support (#773)
```

### PR 描述：
复制下面的内容到 PR 描述框：

````markdown
## 🎯 Pull Request: #755 + #773 功能实现

### 📋 关联的 Issue
- Fix #755: Show model name in assistant turn footer
- Fix #773: HF-Mirror support request (HF-Mirror支持请求)
- (附带) Fix #753: URL style improvement

---

### 🚀 实现的功能

#### 1. **Fix #755: 在 AI 回复中显示模型名称**
**问题**: 用户重新打开旧对话时，不知道每条回复是用哪个模型生成的。

**解决方案**:
- ✅ 修改 `AssistantTurn` 类型，添加 `modelId` 字段
- ✅ 在创建 AI 回复时保存当前模型 ID
- ✅ 在回复底部显示模型名称（使用主题主色）

**修改的文件**:
- `src/utils/types.ts`
- `src/hooks/useChatSession.ts`
- `src/components/AssistantTurnFooter/AssistantTurnFooter.tsx`
- `src/components/AssistantTurnFooter/styles.ts`

---

#### 2. **Fix #773: 添加 HF-Mirror 支持（中国大陆用户）**
**问题**: 中国大陆用户无法访问 Hugging Face（被墙），导致无法下载模型。

**解决方案**:
- ✅ 在 `urls.ts` 中支持动态域名切换
- ✅ 添加 `useHfMirror` 状态到 `HFStore`
- ✅ 在设置页面添加开关（"Use HF-Mirror (China)"）
- ✅ 添加本地化字符串（英文、中文）

**修改的文件**:
- `src/config/urls.ts`
- `src/store/HFStore.ts`
- `src/screens/SettingsScreen/SettingsScreen.tsx`
- `src/locales/en.json`
- `src/locales/zh.json`

---

#### 3. **(附带) Fix #753: 改进 URL 样式**
**问题**: AI 回复中的 URL 和普通文本样式一样，无法区分。

**解决方案**:
- ✅ 为 `<a>` 标签添加样式（主题主色 + 下划线）

**修改的文件**:
- `src/components/MarkdownView/styles.ts`

---

### 📸 效果预览

#### Fix #755: 显示模型名称
```
User: Hello!
Assistant: Hello! How can I help you today?
             [Model Name]  [42 ms/tok]
```

#### Fix #773: HF-Mirror 开关
设置页面 → Model Initialization Settings → "Use HF-Mirror (China)"
- 开关：Off [切换到 On]
- 描述：Use hf-mirror.com instead of huggingface.co...

---

### 🧪 测试计划

#### Fix #755
- [ ] 发送消息，查看 AI 回复底部是否显示模型名称
- [ ] 切换不同模型，确认每条消息显示正确的模型
- [ ] 重新打开旧对话（升级前），确认不显示模型名称（正确行为）
- [ ] 删除模型后查看旧消息，确认显示模型 ID

#### Fix #773
- [ ] 在设置页面找到 "Use HF-Mirror (China)" 开关
- [ ] 启用开关，检查 `setHFDomain()` 是否被调用
- [ ] 在中国大陆网络环境下，尝试下载模型（应该连接到 hf-mirror.com）
- [ ] 禁用开关，尝试下载模型（应该连接到 huggingface.co）

---

### 📋 待优化（后续 PR）

1. **硬编码 URL 问题**:
   - `src/store/defaultModels.ts` 中有硬编码的下载 URL
   - `src/screens/__automation__/BenchmarkRunnerScreen.tsx` 中也有硬编码 URL
   - **建议**: 后续 PR 修改这些文件，动态生成下载 URL

2. **其他语言本地化**:
   - 目前只添加了英文和中文翻译
   - **建议**: 后续 PR 添加日语、韩语等其他语言的翻译

---

### 📝 提交信息

**Commit message**:
```
Feat: Show model name in chat (#755) + HF-Mirror support (#773)

- Fix #755: Show model name in assistant turn footer
  - Add modelId field to AssistantTurn type
  - Save model ID when creating AI response
  - Display model name in AssistantTurnFooter

- Fix #753: Style URLs to be distinguishable (included)
  - Add <a> tag styling in MarkdownView

- Fix #773: Add HF-Mirror support for Chinese users
  - Add useHfMirror state to HFStore
  - Support dynamic domain selection (huggingface.co / hf-mirror.com)
  - Add settings switch for HF-Mirror
  - Add localization strings (en, zh)
```

**修改的文件** (10 个):
1. `src/utils/types.ts`
2. `src/hooks/useChatSession.ts`
3. `src/components/AssistantTurnFooter/AssistantTurnFooter.tsx`
4. `src/components/AssistantTurnFooter/styles.ts`
5. `src/components/MarkdownView/styles.ts`
6. `src/config/urls.ts`
7. `src/store/HFStore.ts`
8. `src/screens/SettingsScreen/SettingsScreen.tsx`
9. `src/locales/en.json`
10. `src/locales/zh.json`

---

### 👤 贡献者

@YOUR_USERNAME

---

**感谢维护者的工作和开源社区的贡献！** 🙏
````

---

## ✅ 步骤 4：等待 Review

1. 创建 PR 后，等待维护者 review
2. 如果维护者要求修改，按反馈修改代码
3. 修改后，再次推送到同一个分支（PR 会自动更新）

---

## 🚨 常见问题

### Q1: 推送时提示 "Permission denied"
**原因**: 你没有登录 GitHub，或者没有 fork 仓库。
**解决**:
- 确保已经 fork 了仓库
- 使用 `git remote -v` 检查 remote 是否正确
- 使用 Personal Access Token (PAT) 推送

### Q2: 代码有拼写错误
**解决**:
- 如果 TypeScript 编译器报错，检查 `urls.ts` 中的变量名
- 确保所有修改的文件语法正确

### Q3: PR 创建后想修改
**解决**:
- 继续在本地分支修改代码
- 修改后，再次推送：`git push myfork feat/hf-mirror-support`
- PR 会自动更新

---

## 🎉 完成！

按照上面的步骤操作，你就能成功推送代码并创建 Pull Request！

如果你遇到任何问题，可以：
1. 查看 GitHub 文档：https://docs.github.com/en/pull-requests
2. 或者在 PR 中留言提问

**祝你成功贡献开源项目！** 🚀
