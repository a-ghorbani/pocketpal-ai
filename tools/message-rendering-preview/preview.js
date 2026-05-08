/* global marked, katex */

const serviceTokenPattern = new RegExp(
  [
    '<\\|start_header_id\\|>\\s*(assistant|user|system|model)?\\s*<\\|end_header_id\\|>\\s*',
    '<\\|im_start\\|>\\s*(assistant|user|system|model)?\\s*',
    '<start_of_turn>\\s*(assistant|user|system|model)?\\s*',
    '<\\|begin_of_text\\|>',
    '<\\|end_of_text\\|>',
    '<\\|eot_id\\|>',
    '<\\|im_end\\|>\\s*',
    '<\\|assistant\\|>',
    '<\\|user\\|>',
    '<\\|system\\|>',
    '<\\|start_header_id\\|>',
    '<\\|end_header_id\\|>',
    '<\\|channel\\|?>\\s*(analysis|thought|final)?',
    '<end_of_turn>\\s*',
    '\\[\\/?INST\\]',
    '<\\/?s>',
    '<\\/?(bos|eos)>',
  ].join('|'),
  'gi',
);

const fixtures = [
  {
    id: 'markdown',
    title: 'Simple Markdown',
    description: 'Headings, emphasis, lists, links, quotes, and tasks.',
    text: `# Title

Hello **world** with *emphasis*, ~~strike~~, and \`inline code\`.

- [x] Markdown
- [ ] Visual QA
  - nested item

> Blockquote with [a safe link](https://example.com).

---

1. First
2. Second`,
  },
  {
    id: 'table',
    title: 'Table + Inline Content',
    description: 'GFM table alignment, wrapping, links, code, and math.',
    text: `| Name | Score | Note |
|:-----|------:|:-----:|
| Ada | \`42\` | $x^2 + y^2$ |
| Linus | 7 | [link](https://example.com) |
| Very long cell | 100 | This cell wraps instead of forcing the bubble wider than the phone viewport. |`,
  },
  {
    id: 'code',
    title: 'Code Blocks',
    description: 'Fenced blocks preserve newlines and indentation.',
    text:
      '```python\n' +
      'def test():\n' +
      '    payload = {"ok": True, "price": "$5"}\n' +
      '    print("$not math inside code")\n' +
      '```\n\n' +
      '```json\n' +
      '{"name":"search","arguments":{"query":"PocketPal markdown"}}\n' +
      '```',
  },
  {
    id: 'math',
    title: 'KaTeX Math',
    description: 'Inline and block delimiters rendered locally.',
    text: `Energy is $E = mc^2$ and price is \\$5.

$$
\\frac{dx}{dt} = \\alpha x + \\beta
$$

Use bracket delimiters too: \\(a^2+b^2=c^2\\)

\\[
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
\\]`,
  },
  {
    id: 'thinking',
    title: 'Thinking + Tokens',
    description: 'Reasoning is collapsible and template tokens can be hidden.',
    text: `<|begin_of_text|><|assistant|>
<think>
Need to reason privately before answering.
</think>
<final>
Visible **final** answer.
</final><|eot_id|>`,
  },
  {
    id: 'template-variants',
    title: 'Template Variants',
    description: 'ChatML, Llama header, channel, and Gemma-style tags.',
    text: `<|start_header_id|>assistant<|end_header_id|>
<|channel|>analysis
Hidden channel reasoning.
<|channel|>final
Llama header answer.

<start_of_turn>model
<start_of_thought>
Hidden Gemma reasoning.
<end_of_thought>
Gemma answer.
<end_of_turn>`,
  },
  {
    id: 'structured',
    title: 'JSON, XML, Tool Calls',
    description: 'Structured outputs stay separate from normal Markdown.',
    text: `<tool_call>
{"name":"calculator","arguments":{"x":2}}
</tool_call>

<response>
  <answer>42</answer>
</response>

{"name":"search","arguments":{"query":"PocketPal markdown"}}`,
  },
  {
    id: 'unsafe',
    title: 'Unsafe HTML',
    description: 'Scripts and unknown tags are escaped, never executed.',
    text: `<script>alert("no")</script>
<tag attr="x">value</tag>

Safe markdown still works after unsafe-looking text.`,
  },
  {
    id: 'streaming',
    title: 'Streaming Partials',
    description: 'Malformed partial blocks fall back instead of crashing.',
    text: `<think>
Need first

$$
\\frac{1`,
  },
];

const state = {
  fixture: fixtures[0],
  mode: 'rendered',
  width: 'phone',
  renderMarkdown: true,
  renderLatex: true,
  renderTables: true,
  showThinking: true,
  hideTokens: true,
  wrapCode: false,
};

const dom = {
  fixtureSelect: document.getElementById('fixture-select'),
  rawInput: document.getElementById('raw-input'),
  bubble: document.getElementById('bubble'),
  title: document.getElementById('fixture-title'),
  description: document.getElementById('fixture-description'),
  copyOutput: document.getElementById('copy-output'),
  renderMarkdown: document.getElementById('render-markdown'),
  renderLatex: document.getElementById('render-latex'),
  renderTables: document.getElementById('render-tables'),
  showThinking: document.getElementById('show-thinking'),
  hideTokens: document.getElementById('hide-tokens'),
  wrapCode: document.getElementById('wrap-code'),
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isEscaped(text, index) {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor--) {
    count += 1;
  }
  return count % 2 === 1;
}

function findUnescaped(text, needle, fromIndex) {
  let index = text.indexOf(needle, fromIndex);
  while (index !== -1) {
    if (!isEscaped(text, index)) {
      return index;
    }
    index = text.indexOf(needle, index + needle.length);
  }
  return -1;
}

function protectCode(text) {
  const placeholders = [];
  const next = content => {
    const key = `@@PP_CODE_${placeholders.length}@@`;
    placeholders.push(content);
    return key;
  };

  return {
    text: text
      .replace(
        /(^|\n)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)(\n\2[ \t]*(?=\n|$)|$)/g,
        match => next(match),
      )
      .replace(/`([^`\n]+)`/g, match => next(match)),
    placeholders,
  };
}

function restoreCode(text, placeholders) {
  return placeholders.reduce(
    (current, value, index) => current.replace(`@@PP_CODE_${index}@@`, value),
    text,
  );
}

function sanitizeMarkdown(text) {
  const protectedCode = protectCode(text);
  const escaped = protectedCode.text
    .replace(/<script[\s\S]*?<\/script>/gi, match => escapeHtml(match))
    .replace(/<\/?([A-Za-z][\w:-]*)(\s[^<>]*)?>/g, match => escapeHtml(match))
    .replace(/!\[[^\]]*]\((https?:)?\/\/[^)]+\)/gi, '');
  return restoreCode(escaped, protectedCode.placeholders);
}

function renderMath(tex, displayMode) {
  if (!state.renderLatex) {
    return `<code class="math-fallback">${escapeHtml(tex)}</code>`;
  }

  try {
    const html = katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      trust: false,
      strict: 'warn',
      output: 'htmlAndMathml',
    });
    if (html.includes('katex-error')) {
      return `<code class="math-fallback">${escapeHtml(tex)}</code>`;
    }
    return html;
  } catch {
    return `<code class="math-fallback">${escapeHtml(tex)}</code>`;
  }
}

function injectMath(markdown) {
  const protectedCode = protectCode(markdown);
  let text = protectedCode.text;

  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_match, tex) => {
    return `<div class="math-scroll">${renderMath(tex.trim(), true)}</div>`;
  });

  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_match, tex) => {
    return `<div class="math-scroll">${renderMath(tex.trim(), true)}</div>`;
  });

  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_match, tex) => {
    return `<span class="math-inline">${renderMath(tex.trim(), false)}</span>`;
  });

  let output = '';
  let index = 0;
  while (index < text.length) {
    const start = findUnescaped(text, '$', index);
    if (start === -1 || text[start + 1] === '$') {
      output += text.slice(index);
      break;
    }

    const end = findUnescaped(text, '$', start + 1);
    if (end === -1) {
      output += text.slice(index);
      break;
    }

    const tex = text.slice(start + 1, end);
    if (!tex.trim() || tex.includes('\n')) {
      output += text.slice(index, end + 1);
    } else {
      output +=
        text.slice(index, start) +
        `<span class="math-inline">${renderMath(tex.trim(), false)}</span>`;
    }
    index = end + 1;
  }

  return restoreCode(output, protectedCode.placeholders);
}

function splitSegments(raw) {
  const segments = [];
  let index = 0;

  const pairs = [
    ['<think>', '</think>', 'thinking'],
    ['<thinking>', '</thinking>', 'thinking'],
    ['<thought>', '</thought>', 'thinking'],
    ['<reasoning>', '</reasoning>', 'thinking'],
    ['<analysis>', '</analysis>', 'thinking'],
    ['<start_of_thought>', '<end_of_thought>', 'thinking'],
    ['<|begin_of_thought|>', '<|end_of_thought|>', 'thinking'],
    ['<|start_thinking|>', '<|end_thinking|>', 'thinking'],
    ['<tool_call>', '</tool_call>', 'tool'],
    ['<function_call>', '</function_call>', 'tool'],
  ];

  const pushText = value => {
    if (!value) return;
    const trimmed = value.trim();
    let kind = 'markdown';
    if (/^[{[]/.test(trimmed)) kind = 'json';
    if (/^<([A-Za-z][\w:-]*)(\s[^>]*)?>[\s\S]*<\/\1>$/.test(trimmed)) {
      kind = 'xml';
    }
    if (
      trimmed.includes('|') &&
      /\n\s*\|?\s*:?-{3,}:?\s*(\|.+)+/.test(trimmed)
    ) {
      kind = 'table';
    }
    segments.push({kind, raw: value, content: value});
  };

  while (index < raw.length) {
    const candidates = [];
    for (const [start, end, kind] of pairs) {
      const startIndex = raw.toLowerCase().indexOf(start, index);
      if (startIndex !== -1) {
        const contentStart = startIndex + start.length;
        const endIndex = raw.toLowerCase().indexOf(end, contentStart);
        candidates.push({
          index: startIndex,
          kind,
          raw:
            endIndex === -1
              ? raw.slice(startIndex)
              : raw.slice(startIndex, endIndex + end.length),
          content:
            endIndex === -1
              ? raw.slice(contentStart)
              : raw.slice(contentStart, endIndex),
          end: endIndex === -1 ? raw.length : endIndex + end.length,
          partial: endIndex === -1,
        });
      }
    }

    const channelRe = /<\|channel\|?>\s*(analysis|thought)/gi;
    channelRe.lastIndex = index;
    const channel = channelRe.exec(raw);
    if (channel) {
      const contentStart = channelRe.lastIndex;
      const finalRe = /<\|channel\|?>\s*final/gi;
      finalRe.lastIndex = contentStart;
      const final = finalRe.exec(raw);
      candidates.push({
        index: channel.index,
        kind: 'thinking',
        raw: final
          ? raw.slice(channel.index, final.index)
          : raw.slice(channel.index),
        content: final
          ? raw.slice(contentStart, final.index)
          : raw.slice(contentStart),
        end: final ? final.index : raw.length,
        partial: !final,
      });
    }

    serviceTokenPattern.lastIndex = index;
    const token = serviceTokenPattern.exec(raw);
    if (token) {
      candidates.push({
        index: token.index,
        kind: 'serviceTag',
        raw: token[0],
        content: token[0],
        end: token.index + token[0].length,
      });
    }

    candidates.sort((a, b) => a.index - b.index);
    const next = candidates[0];
    if (!next) {
      pushText(raw.slice(index));
      break;
    }
    if (next.index > index) {
      pushText(raw.slice(index, next.index));
    }
    segments.push(next);
    index = next.end;
  }
  return segments;
}

function cleanText(raw, includeThinking = false) {
  return splitSegments(raw)
    .map(segment => {
      if (segment.kind === 'thinking') {
        return includeThinking ? `Thinking\n${segment.content.trim()}` : '';
      }
      if (segment.kind === 'serviceTag' && state.hideTokens) return '';
      if (segment.kind === 'tool') return segment.content;
      return segment.raw.replace(/<\/?final>/gi, '');
    })
    .join('')
    .replace(serviceTokenPattern, '')
    .replace(/^\s*(assistant|user|system|model)\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function markdownToHtml(markdown) {
  if (!state.renderMarkdown) {
    return `<div class="clean-view">${escapeHtml(markdown)}</div>`;
  }

  const input = state.renderTables
    ? markdown
    : markdown.replace(
        /\n(\|.+\|\n\|[-:| ]+\|\n(?:\|.*\|\n?)*)/g,
        '\n```text$1```\n',
      );
  const sanitized = sanitizeMarkdown(input);
  const withMath = injectMath(sanitized);
  return marked.parse(withMath, {
    async: false,
    breaks: true,
    gfm: true,
    renderer: markdownRenderer,
  });
}

const markdownRenderer = new marked.Renderer();
markdownRenderer.code = token => {
  const lang = token.lang || 'text';
  const code = token.text || '';
  return `<div class="code-block">
    <div class="code-head">
      <span class="code-lang">${escapeHtml(lang)}</span>
      <button class="copy-chip" data-copy="${encodeURIComponent(code)}">Copy</button>
    </div>
    <pre><code>${escapeHtml(code)}</code></pre>
  </div>`;
};
markdownRenderer.table = token => {
  const header = token.header || [];
  const rows = token.rows || [];
  const align = token.align || [];
  const cell = (value, index, tag) => {
    const style = align[index] ? ` style="text-align:${align[index]}"` : '';
    return `<${tag}${style}>${marked.parseInline(value.text || '')}</${tag}>`;
  };
  return `<div class="table-scroll"><table><thead><tr>${header
    .map((item, index) => cell(item, index, 'th'))
    .join('')}</tr></thead><tbody>${rows
    .map(
      row =>
        `<tr>${row.map((item, index) => cell(item, index, 'td')).join('')}</tr>`,
    )
    .join('')}</tbody></table></div>`;
};
markdownRenderer.link = token => {
  const href = token.href || '';
  if (!/^(https?:|mailto:)/i.test(href)) {
    return escapeHtml(token.text || href);
  }
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${token.text}</a>`;
};
marked.use({renderer: markdownRenderer, breaks: true, gfm: true});

function prettyJson(value) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function prettyXml(value) {
  return value
    .trim()
    .replace(/>\s+</g, '>\n<')
    .split('\n')
    .reduce(
      (accumulator, line) => {
        if (/^<\//.test(line)) {
          accumulator.depth = Math.max(0, accumulator.depth - 1);
        }
        accumulator.lines.push(`${'  '.repeat(accumulator.depth)}${line}`);
        if (/^<[^/!?][^>]*[^/]>$/.test(line) && !line.includes('</'))
          accumulator.depth += 1;
        return accumulator;
      },
      {depth: 0, lines: []},
    )
    .lines.join('\n');
}

function structuredBlock(segment) {
  const title =
    segment.kind === 'json'
      ? 'JSON'
      : segment.kind === 'xml'
        ? 'XML'
        : segment.raw.includes('function_call')
          ? 'function_call'
          : 'tool_call';
  const body =
    segment.kind === 'json'
      ? prettyJson(segment.content.trim())
      : segment.kind === 'xml'
        ? prettyXml(segment.content.trim())
        : prettyJson(segment.content.trim());
  return `<details class="structured" open>
    <summary>${title}</summary>
    <div class="structured-body">
      <div class="code-head">
        <span class="code-lang">${title.toLowerCase()}</span>
        <button class="copy-chip" data-copy="${encodeURIComponent(segment.raw)}">Copy raw</button>
      </div>
      <pre><code>${escapeHtml(body)}</code></pre>
    </div>
  </details>`;
}

function renderedHtml(raw) {
  return splitSegments(raw)
    .map(segment => {
      if (segment.kind === 'thinking') {
        if (!state.showThinking) return '';
        return `<details class="thinking" open>
          <summary>Thinking</summary>
          <div class="thinking-content">${markdownToHtml(segment.content)}</div>
        </details>`;
      }
      if (segment.kind === 'serviceTag') {
        return state.hideTokens
          ? ''
          : `<code>${escapeHtml(segment.raw)}</code>`;
      }
      if (
        segment.kind === 'json' ||
        segment.kind === 'xml' ||
        segment.kind === 'tool'
      ) {
        return structuredBlock(segment);
      }
      return markdownToHtml(segment.raw.replace(/<\/?final>/gi, ''));
    })
    .join('');
}

function render() {
  const raw = dom.rawInput.value;
  dom.title.textContent = state.fixture.title;
  dom.description.textContent = state.fixture.description;
  dom.bubble.className = `message-bubble ${state.width} ${state.wrapCode ? 'wrap-code' : ''}`;

  if (state.mode === 'raw') {
    dom.bubble.innerHTML = `<pre class="raw-view">${escapeHtml(raw)}</pre>`;
  } else if (state.mode === 'clean') {
    dom.bubble.innerHTML = `<pre class="clean-view">${escapeHtml(cleanText(raw)) || '<empty>'}</pre>`;
  } else {
    dom.bubble.innerHTML =
      renderedHtml(raw) || '<p class="empty">No visible content.</p>';
  }
}

function setActive(selector, attr, value) {
  document.querySelectorAll(selector).forEach(button => {
    button.classList.toggle('active', button.dataset[attr] === value);
  });
}

function init() {
  fixtures.forEach(fixture => {
    const option = document.createElement('option');
    option.value = fixture.id;
    option.textContent = fixture.title;
    dom.fixtureSelect.appendChild(option);
  });
  dom.rawInput.value = state.fixture.text;

  dom.fixtureSelect.addEventListener('change', event => {
    state.fixture =
      fixtures.find(fixture => fixture.id === event.target.value) ||
      fixtures[0];
    dom.rawInput.value = state.fixture.text;
    render();
  });

  document.querySelectorAll('[data-mode]').forEach(button => {
    button.addEventListener('click', () => {
      state.mode = button.dataset.mode;
      setActive('[data-mode]', 'mode', state.mode);
      render();
    });
  });

  document.querySelectorAll('[data-width]').forEach(button => {
    button.addEventListener('click', () => {
      state.width = button.dataset.width;
      setActive('[data-width]', 'width', state.width);
      render();
    });
  });

  [
    ['renderMarkdown', dom.renderMarkdown],
    ['renderLatex', dom.renderLatex],
    ['renderTables', dom.renderTables],
    ['showThinking', dom.showThinking],
    ['hideTokens', dom.hideTokens],
    ['wrapCode', dom.wrapCode],
  ].forEach(([key, input]) => {
    input.addEventListener('change', () => {
      state[key] = input.checked;
      render();
    });
  });

  dom.rawInput.addEventListener('input', render);
  dom.copyOutput.addEventListener('click', () => {
    navigator.clipboard.writeText(dom.bubble.innerText || '').catch(() => {});
  });
  dom.bubble.addEventListener('click', event => {
    const button = event.target.closest('[data-copy]');
    if (!button) return;
    navigator.clipboard
      .writeText(decodeURIComponent(button.dataset.copy))
      .catch(() => {});
  });

  render();
}

init();
