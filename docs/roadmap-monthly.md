
# PocketPal AI — 未来 12 个月架构路线图 (月度版)

> 基线版本: **v1.16.0** (2026-06) | 脚本语言: TypeScript | 技术栈: React Native + llama.rn  
> 用户规模: 7,448 ★ | 团队规模: 1 核心作者 + ~10 社区贡献者

---

## 🧭 架构总览（当前）

```
┌─────────────────────────────────────────────────────┐
│                   PocketPal App                      │
├───────────┬───────────┬──────────┬────────┬─────────┤
│  Local    │  Remote   │ PalsHub  │  TTS   │  Tool   │
│ Inference │  LLM API  │ Market   │ Engine │ Calling │
├───────────┴───────────┴──────────┴────────┴─────────┤
│         UI Layer (Design Tokens + Shared Comps)      │
├──────────────────────────────────────────────────────┤
│        RN 0.82 + Native TurboModules + Hermes        │
└──────────────────────────────────────────────────────┘
```

---

## 📆 月度计划明细

---

### 🔵 7 月 — 用户账号系统

**版本**: v1.17.0

| 工作项 | 说明 | 架构影响 |
|--------|------|----------|
| Firebase Auth 集成 | Apple/Google 登录；匿名兜底 | 新增 `AuthService` 模块 |
| 用户模型定义 | User 实体 + Device 绑定 + 偏好存储 | 新增 `User` bounded context |
| 后端 API 搭建 | Cloud Functions + Firestore 数据层 | 引入后端组件 (此前纯本地) |
| 端到端加密方案 | 聊天记录客户端加密，服务端不可读 | `E2EE` 模块，密钥派生自用户密码 |

**ADR 关键决策**: 不上自建后端，采用 Firebase Serverless 降低初始运维成本。  
**Trade-off**: (+) 快速上线 (-) 长期 vendor lock-in，Firebase 冷启动延迟。

---

### 🔵 8 月 — 云同步 + Android IAP

**版本**: v1.18.0 → v1.18.x

| 工作项 | 说明 | 架构影响 |
|--------|------|----------|
| 聊天记录同步 | 操作日志 (OT/CRDT) → 服务端持久化 | `SyncEngine` 模块，冲突策略 LWW |
| Pal 配置同步 | 角色配置、自定义 Prompt 跨设备同步 | 复用 `SyncEngine` |
| 同步冲突 UI | 冲突检测 → 用户选择保留版本 | 新增冲突解决对话框 |
| Android IAP | Google Play Billing 5/6 接入 | `PaymentAdapter` 接口实现 |
| IAP 收据校验 | 服务端校验收据，跨设备恢复购买 | 后端新增 `ReceiptValidator` |

**ADR 关键决策**: 同步冲突采用 Last-Write-Wins + 同步前自动备份。  
**Trade-off**: (+) 实现简单 (-) 极端情况下可能丢失编辑历史。

---

### 🔵 9 月 — 模型管理器 + 存储优化

**版本**: v1.19.0

| 工作项 | 说明 | 架构影响 |
|--------|------|----------|
| 模型下载队列 | 后台下载 + 断点续传 + 暂停/取消 | 新增 `DownloadService` |
| 存储空间感知 | 基于 `getAvailableMemory()` API + 自动告警 | `StorageAwareness` 模块 |
| 模型分类管理 | 底座 / 推理 / TTS / VLM 分类视图 | ModelManager 内部重构 |
| 存储缓存清理 | LRU 缓存 + 未使用模型自动清理建议 | 新增缓存策略 |
| 性能基准自动化 | CI 中运行基准测试矩阵 | 扩展已有 `E2E test` 框架 |

---

### 🟠 10 月 — 语音输入 (STT) + 语音对话

**版本**: v1.20.0

| 工作项 | 说明 | 架构影响 |
|--------|------|----------|
| Whisper.cpp 集成 | 通过 llama.rn 复用推理后端 | `SpeechEngine` 接口 + Whisper 实现 |
| 系统 Speech API 兜底 | 语言不支持时 Fallback 到 OS API | SpeechEngine 第二种实现 |
| 语音输入按钮 | 录音 → 识别 → 填入消息框 | UI 组件 `<VoiceInputButton>` |
| 全语音对话模式 | 自动 STT → LLM → TTS 闭环，无需打字 | `VoiceChatSessionManager` |
| 语音引导设置 | 扩展 v1.16.0 的 6-step 引导流程 | 引导数据新增 voice 步骤 |

**ADR 关键决策**: 本地 Whisper 优先 (离线可用、隐私保护)，云端 Fallback 兜底低资源设备。  
**Trade-off**: (+) 完全离线 (-) 首次下载 Whisper 模型较大 (~150MB)。

---

### 🟠 11 月 — PalsHub 创作者平台

**版本**: v1.21.0

| 工作项 | 说明 | 架构影响 |
|--------|------|----------|
| Pal Manifest V2 规范 | personality / greeting / talents / voice_profile / avatar_art | `PalManifestV2` schema 定义 |
| 创作者 Dashboard | Web 端提交/更新/分析 Pal | 新建 Web 前端 (PalsHub.io) |
| Pal 分级 | 公开 / 私有 / 付费 | 后端新增 `PalVisibility` 枚举 |
| 收益分成系统 | 70/30 创作者/平台分成 + 月度结算 | 新增 `RoyaltyEngine` |
| 内容审核机制 | 自动 + 人工审核流程 | `ContentModerationService` |

**ADR 关键决策**: Pal Manifest V2 保持向后兼容 v1，旧 Pal 自动映射。  
**Trade-off**: (+) 创作者即刻可用 (-) 兼容层增加维护成本。

---

### 🟠 12 月 — MCP 工具生态 + 节日版

**版本**: v1.22.0 → v1.22.1

| 工作项 | 说明 | 架构影响 |
|--------|------|----------|
| 内置工具集 | 计算器、日历、天气、提醒、网络搜索 | 新增 `BuiltinToolkit` |
| MCP 协议标准化 | 定义 PocketPal Tool Plugin API | 借鉴 MCP 规范，`ToolRegistry` 模块 |
| 工具权限系统 | 敏感权限 (网络/文件/位置) 需用户授权 | `PermissionManager` 扩展 |
| 工具市场视图 | 应用内浏览/安装/管理工具 | PalsHub 新增 `ToolMarketTab` |
| 多模型并行实验 | 后台小模型常驻 + 按需加载大模型 | `ModelPool` 实验性模块 |

---

### 🟢 1 月 — 本地 RAG 知识库 (Alpha)

**版本**: v1.23.0

| 工作项 | 说明 | 架构影响 |
|--------|------|----------|
| 文档解析管道 | PDF / TXT / Markdown / 网页剪藏 → 纯文本抽取 | `DocumentParser` 模块 |
| 文本分块策略 | 语义分块 + 重叠滑动窗口 | `ChunkingStrategy` |
| 本地 Embedding 模型 | Nomic Embed Text / BGE (GGUF) 集成 | Embedding 推理复用 llama.rn |
| 向量存储 | SQLite + FTS5 混合索引 (BM25 + 语义) | `VectorStore` 模块 |
| 混合检索管道 | 语义检索 + 关键词检索 → Re-rank → LLM 回答 | `RetrievalPipeline` |

**ADR 关键决策**: 全部在设备端完成，不依赖云端 Embedding API。  
**Trade-off**: (+) 完全离线，数据不出手机 (-) 大型文档集首次索引时间较长，低端设备可能吃力。

---

### 🟢 2 月 — 对话记忆系统

**版本**: v1.24.0

| 工作项 | 说明 | 架构影响 |
|--------|------|----------|
| 短期记忆重构 | 当前会话 Token 窗口管理 → 滑动窗口 + 摘要压缩 | `ShortTermMemory` |
| 工作记忆 | 同对话跨 session 关键信息持久化 | `WorkingMemoryWriter` |
| 长期记忆 | 跨对话的用户偏好/事实关系图谱 | `MemoryGraph` 模块 |
| 实体/关系提取 | 轻量级本地 NLP 提取关键信息 | 复用 Embedding 模型做 NER |
| 记忆可视化 | 用户可查看/编辑 AI 记住的关于自己的信息 | UI: `MemorySettingsPanel` |

---

### 🟢 3 月 — 远程推理多 Provider

**版本**: v1.25.0

| 工作项 | 说明 | 架构影响 |
|--------|------|----------|
| 多 Provider 支持 | Anthropic / Gemini / Groq / Together AI | `RemoteProviderAdapter` 接口 |
| Provider 配置 UI | API Key 管理 + Provider 切换 + 模型选择 | Settings 扩展 |
| 自动路由 | 根据任务类型 / 模型能力 / 延迟 / 成本选最优 Provider | `RoutingEngine` |
| 用量统计 | Token 计数 + 月度配额 + 超限告警 | `UsageTracker` |
| 延迟/成本比较 | Provider 间实时对比面板 | UI: `ProviderBenchmarkView` |

---

### 🟣 4 月 — 插件系统 (Alpha)

**版本**: v1.26.0

| 工作项 | 说明 | 架构影响 |
|--------|------|----------|
| 插件 Manifest 规范 | name / version / permissions / entry point / hooks | `PluginManifest` schema |
| Hermes 沙箱 | 每个插件独立 JS Bundle 执行 + 受限原生 API | 新增 `PluginSandbox` |
| 插件生命周期 | 安装 → 启用/禁用 → 更新 → 卸载 | `PluginManager` 状态机 |
| 插件 API 第一版 | 消息钩子 / UI 面板注入 / 数据源注册 | `PluginAPI` 稳定接口 |
| 权限声明系统 | 插件安装时声明所需权限，用户逐一确认 | 复用 `PermissionManager` |

**ADR 关键决策**: 插件以 Hermes JS Bundle 形式分发，不上 JSC/V8 防止安全漏洞。  
**Trade-off**: (+) 沙箱隔离，安全性高 (-) Hermes 无 JIT，计算密集型插件性能受限。

---

### 🟣 5 月 — 跨平台适配

**版本**: v1.27.0

| 工作项 | 说明 | 架构影响 |
|--------|------|----------|
| 大屏适配 | iPad / 平板布局优化 (Split View / Slide Over) | 响应式布局重构 |
| macOS 原生适配 | 菜单栏、快捷键、窗口管理 | mac Catalyst / 原生 RN macOS |
| 桌面快捷键 | Cmd+N 新建对话 / Cmd+W 关闭 / 搜索 | `KeyboardShortcuts` 模块 |
| 文件拖拽支持 | 拖拽文档到应用触发 RAG 导入 | 系统 Drag & Drop 协议集成 |

---

### 🟣 6 月 — 插件市场 + 多模型协作

**版本**: v1.28.0

| 工作项 | 说明 | 架构影响 |
|--------|------|----------|
| 插件市场 | PalsHub 内置插件浏览/安装/评分/评论 | 扩展 `MarketService` |
| 模型流水线编排 | 小模型过滤 → 大模型分析 → 专用模型输出 | `ModelPipeline` DSL |
| 模型流水线配置 UI | 可视化拖拽编排流水线 | UI: `PipelineEditor` |
| 企业级 API 服务器 | 手机启动 HTTP 服务 → 局域网其他设备调用 | `LocalApiServer` (可选) |
| 年度回顾 | 12 个月发展总结 + 下一个 roadmap 投票 | 社区反馈收集 |

---

## 📊 月度里程碑一览

```
 7月   8月   9月   10月   11月   12月   1月    2月    3月    4月    5月    6月
┌────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┐
│账号│云同 │模型 │语音 │创作 │MCP  │RAG  │记忆 │多   │插件 │跨   │插件 │
│系统│步   │管理 │输入 │者   │工具 │知识 │系统 │Prov │系统 │平台 │市场 │
│    │IAP  │器   │STT  │平台 │生态 │库   │升级 │ider │     │适配 │流水 │
│    │     │     │     │     │     │     │     │路由 │     │     │线   │
├────┼────┼────┼────┼────┼────┼────┼────┼────┼────┼────┼────┤
│v1.17│v1.18│v1.19│v1.20│v1.21│v1.22│v1.23│v1.24│v1.25│v1.26│v1.27│v1.28│
└────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘
  🔵 基础设施  │  🟠 语音+生态  │  🟢 智能增强  │  🟣 平台扩展
```

---

## 📋 关键架构决策 (ADR) 列表

| ADR # | 决策 | 月份 | 核心 Trade-off |
|-------|------|------|---------------|
| ADR-001 | Firebase Auth + S3 云同步 | 7月 | 快速上线 vs Vendor Lock-in |
| ADR-002 | 统一支付 PaymentAdapter | 8月 | 抽象成本 vs 平台差异化 |
| ADR-003 | 混合 STT (Whisper + Fallback) | 10月 | 离线可用 vs 模型体积 |
| ADR-004 | Pal Manifest V2 兼容 v1 | 11月 | 创作者体验 vs 兼容层成本 |
| ADR-005 | 全部本地 RAG (无需云端) | 1月 | 隐私安全 vs 低端设备性能 |
| ADR-006 | Hermes JS Bundle 沙箱 | 4月 | 安全隔离 vs 插件性能 |
| ADR-007 | LWW 冲突策略 | 8月 | 实现简单 vs 极端丢编辑 |

---

## ⚠️ 月度风险日历

| 月份 | 风险事件 | 概率 | 影响 | 应对 |
|------|---------|------|------|------|
| 7月 | Firebase 配额超限 | 🟡 中 | 服务不可用 | 设置预算告警 + 缓存策略 |
| 8月 | Google Play 审核拒绝 IAP | 🔴 高 | Android IAP 延期 | 提前提交沙箱测试 + 准备申诉材料 |
| 10月 | Whisper 模型下载失败/CDN 问题 | 🟡 中 | STT 不可用 | 提供云端 Fallback + 重试策略 |
| 1月 | Embedding 模型在低端设备过慢 | 🟡 中 | RAG 体验差 | 按设备分级 (高端全量 / 低端仅 BM25) |
| 4月 | 插件沙箱逃逸漏洞 | 🔴 高 | 用户数据泄露 | 安全审计 + 社区漏洞赏金 |

---

> **原则**: "领域优先，技术第二"  
> 每月结束时回顾优先级，根据用户反馈和 GitHub Issue 热度调整下月方向。  
> 路线图是假设，不是承诺。
