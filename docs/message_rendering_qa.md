# Message Rendering QA

Use this checklist for rich assistant message rendering changes. The desktop
preview is the fastest first pass; device builds still cover native WebView,
copy menus, scrolling, and platform accessibility behavior.

## Desktop Preview

Start the preview:

```sh
yarn preview:renderer
```

Open the printed localhost URL. Verify each fixture in phone, tablet, and
desktop widths:

- Simple Markdown: headings, emphasis, links, blockquotes, lists, task lists,
  and horizontal rules.
- Table + Inline Content: horizontal scroll, alignment, wrapping, inline code,
  links, and inline LaTeX.
- Code Blocks: language header, copy button, preserved indentation/newlines,
  and wrap toggle.
- KaTeX Math: `$...$`, `$$...$$`, `\(...\)`, `\[...\]`, escaped dollars, and
  long block scrolling.
- Thinking + Tokens: rendered/clean/raw modes, hidden template tokens, and
  collapsible thinking.
- JSON, XML, Tool Calls: collapsible structured blocks, pretty-print fallback,
  and raw copy buttons.
- Unsafe HTML: scripts and unknown tags render as text and never execute.
- Streaming Partials: incomplete code/math/thinking/JSON falls back without
  crashing or layout jumps.

## Local Validation

Run:

```sh
yarn test --runInBand --coverage=false
yarn typecheck
yarn l10n:validate
yarn eslint src/utils/messageRendering src/components/AssistantMessageRenderer src/components/MarkdownView src/api src/hooks/useChatSession.ts
```

For Android smoke on Windows, use JDK 17 and Android SDK on `D:`:

```powershell
$env:JAVA_HOME='D:\devtools\jdk-17.0.19+10'
$env:ANDROID_HOME='D:\Android\Sdk'
$env:ANDROID_SDK_ROOT='D:\Android\Sdk'
$env:GRADLE_USER_HOME='D:\.gradle'
$env:PATH="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
corepack yarn build:android
```

## Device QA

On iOS and Android, verify:

- Dark and light mode.
- Long answers of 10k to 30k characters.
- Many code blocks and many formulas.
- Large tables and malformed tables.
- Streaming generation with partial code, math, thinking, and JSON.
- Regenerate, edit message, stop generation, and reopen chat history.
- Default copy icon, long-press copy menu, raw copy, clean copy, Markdown copy,
  code block copy, table copy, math copy, and structured block copy.
- Model template tokens stay hidden in rendered/clean modes and visible in raw.
- Thinking blocks are hidden or collapsed according to settings.
- Links open only after tapping and unsafe schemes do nothing.

## GitHub Actions iOS Smoke

Use the public fork Actions run when local macOS/iOS is not available. The
existing `CI Pipeline` builds iOS on GitHub-hosted macOS and does not require
AWS Device Farm secrets.

Check the `build-ios` job conclusion before marking the PR ready.
