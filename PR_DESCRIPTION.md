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

@your-github-username

---

### 📸 截图（可选）

如果你有测试截图，可以附加上面：
- 设置页面的 HF-Mirror 开关
- AI 回复底部的模型名称
- URL 样式改进效果

---

**感谢维护者的工作和开源社区的贡献！** 🙏
