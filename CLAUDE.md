# PocketPal Build Lessons

## 编译/typecheck 前必读

### 1. 不要从 node_modules 内部路径导入

**错误做法：**
```ts
import MathView from 'react-native-math-view/src/fallback';
```

**原因：** 直接从 `node_modules/xxx/src/` 路径导入时，TypeScript 把它当作项目源码全量类型检查，绕过了 `exclude: ["node_modules"]` 保护。即使 `skipLibCheck: true` 也无效（它只跳过 `.d.ts`，不跳过 `.ts` 源文件）。结果是库里的所有类型错误都暴露出来。

**正确做法：** 只用包名导入（`from 'react-native-math-view'`），或者把需要的逻辑复制到项目自己的文件里。

---

### 2. react-native-math-view 在新架构(Fabric)下高度不生效

**问题：** RN 0.82+ 开启了 `newArchEnabled=true`（Fabric），但 `react-native-math-view` 是旧架构组件。它依赖 `SVGShadowNode.YogaMeasureFunction` 来报告每个公式的自然高度，这个机制在 Fabric 兼容层下不工作，所有公式都退化到 `minHeight: 35`，高度全部一样。

**解决方案：** 不用库的原生视图，改用 `MathjaxFactory`（JS 层计算 SVG + size）+ `react-native-svg` 的 `SvgFromXml`（Fabric 兼容）直接渲染，把 MathJax 计算出的 `size.width/height` 显式传入。参见 `src/components/MarkdownView/MathRenderers.tsx`。

---

### 3. react-native-math-view/android/build.gradle 的 jcenter() 兼容问题

**问题：** Gradle 9.0 移除了 `jcenter()`，react-native-math-view 的 `build.gradle` 里有 `jcenter()` 调用，导致 `assembleRelease` 失败。

**解决方案：** 在 `patches/react-native-math-view+3.9.5.patch` 里删除所有 `jcenter()` 行。

---

### 4. react-native-math-view/SVGShadowNode.java 的 UIManagerModuleListener 兼容问题

**问题：** 新版 React Native 移除了 `UIManagerModuleListener`，但 `SVGShadowNode.java` import 了它（虽然从未使用），导致 `compileReleaseJavaWithJavac` 失败。

**解决方案：** 在 `patches/react-native-math-view+3.9.5.patch` 里删除这行无用的 import。

---

### 5. 改动 react-native-math-view 用法后必须同步更新 Jest mock

**位置：** `__mocks__/external/react-native-math-view.js`

**原因：** mock 只 export 了 `default`（MathView 组件）。改用 `MathjaxFactory` 后，Jest 测试里 `MathjaxFactory` 是 undefined，导致 34 个测试套件崩溃。

**规则：** 每次新增从某个库导入的 named export，先检查 `__mocks__/external/` 目录里有没有对应的 mock 文件，有的话同步加上对应的 mock 实现。

---

### 6. 写 mock/JS 文件时注意 prettier 格式规则

**常见错误：**
- 箭头函数单参数要去掉括号：`math =>` 而非 `(math) =>`
- 超长字符串要换行（prettier 默认行宽 80）

**规则：** 改完 `.js` / `.ts` 文件后用 `yarn lint --fix` 或手动对照规则检查，别让 prettier 错误进 CI。

---

### 7. prettier 对函数参数格式有严格要求

**规则：** 短参数列表必须写在一行，不能拆多行。Prettier 会强制合并为单行。

```ts
// ❌ 会被 prettier 报错
function Foo({
  math,
  inline,
}: {
  math: string;
  inline?: boolean;
})

// ✅ 正确
function Foo({math, inline}: {math: string; inline?: boolean})
```

---

### 每次改完代码后务必在本地运行

```bash
yarn typecheck   # 类型检查
yarn lint        # prettier + eslint
```

再提交，避免 CI 才发现错误。
