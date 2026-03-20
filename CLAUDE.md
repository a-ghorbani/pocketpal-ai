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

### 每次改完代码后务必在本地运行

```bash
yarn typecheck   # 类型检查
```

再提交，避免 CI 才发现错误。
