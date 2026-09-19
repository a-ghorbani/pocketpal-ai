const PLACEHOLDER_PREFIX = '\u0000PP_PLACEHOLDER_';
const PLACEHOLDER_SUFFIX = '\u0000';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&nbsp;': ' ',
    '&apos;': "'",
  };

  return text
    .replace(/&[a-z]+;/gi, entity => entities[entity] || entity)
    .replace(/&#(\d+);/g, (_match, dec) =>
      String.fromCharCode(parseInt(dec, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

export function isSafeLinkUrl(url: string): boolean {
  const normalized = decodeHtmlEntities(url).trim();
  if (!normalized) {
    return false;
  }

  return /^(https?:|mailto:|tel:)/i.test(normalized);
}

function protectCode(text: string): {text: string; placeholders: string[]} {
  const placeholders: string[] = [];

  const addPlaceholder = (value: string) => {
    const key = `${PLACEHOLDER_PREFIX}${placeholders.length}${PLACEHOLDER_SUFFIX}`;
    placeholders.push(value);
    return key;
  };

  let protectedText = text.replace(
    /(^|\n)(`{3,}|~{3,})([^\n]*)\n[\s\S]*?(\n\2[ \t]*(?=\n|$)|$)/g,
    match => addPlaceholder(match),
  );

  protectedText = protectedText.replace(/`[^`\n]*`/g, match =>
    addPlaceholder(match),
  );

  return {text: protectedText, placeholders};
}

function restoreCode(text: string, placeholders: string[]): string {
  return text.replace(
    new RegExp(`${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}`, 'g'),
    (_match, index) => placeholders[Number(index)] ?? '',
  );
}

function escapeUnsafeHtml(text: string): string {
  return text.replace(
    /<(?!https?:\/\/|mailto:)(\/?[A-Za-z][A-Za-z0-9:-]*)(\s[^<>\n]*)?>/g,
    match => escapeHtml(match),
  );
}

function removeRemoteImages(text: string): string {
  return text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
    const label = alt?.trim() || 'image';
    return `${label} (${url})`;
  });
}

function encodeMathNodeContent(content: string): string {
  return escapeHtml(content.trim());
}

function mathNode(kind: 'inline' | 'block', content: string) {
  const source = encodeMathNodeContent(content);
  const tag = kind === 'inline' ? 'span' : 'div';
  return `<${tag} data-pp-math="${kind}" data-source="${source}">${source}</${tag}>`;
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
    slashCount++;
  }
  return slashCount % 2 === 1;
}

function replaceBracketMath(text: string): string {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, content) =>
      mathNode('block', content),
    )
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, content) =>
      content.includes('\n') ? `\\(${content}\\)` : mathNode('inline', content),
    );
}

function replaceDollarMath(text: string): string {
  let output = '';
  let index = 0;

  while (index < text.length) {
    const blockStart = text.indexOf('$$', index);
    if (blockStart === -1) {
      output += text.slice(index);
      break;
    }

    if (isEscaped(text, blockStart)) {
      output += text.slice(index, blockStart + 2);
      index = blockStart + 2;
      continue;
    }

    const blockEnd = text.indexOf('$$', blockStart + 2);
    if (blockEnd === -1 || isEscaped(text, blockEnd)) {
      output += text.slice(index);
      break;
    }

    output += text.slice(index, blockStart);
    output += mathNode('block', text.slice(blockStart + 2, blockEnd));
    index = blockEnd + 2;
  }

  text = output;
  output = '';
  index = 0;

  while (index < text.length) {
    const start = text.indexOf('$', index);
    if (start === -1) {
      output += text.slice(index);
      break;
    }

    if (isEscaped(text, start) || text[start + 1] === '$') {
      output += text.slice(index, start + 1);
      index = start + 1;
      continue;
    }

    const end = text.indexOf('$', start + 1);
    if (end === -1 || isEscaped(text, end)) {
      output += text.slice(index);
      break;
    }

    const content = text.slice(start + 1, end);
    if (!content.trim() || content.includes('\n')) {
      output += text.slice(index, end + 1);
    } else {
      output += text.slice(index, start);
      output += mathNode('inline', content);
    }
    index = end + 1;
  }

  return output;
}

function injectMath(text: string): string {
  return replaceDollarMath(replaceBracketMath(text));
}

export function prepareMarkdownForRender(
  markdown: string,
  {renderLatex = true}: {renderLatex?: boolean} = {},
): string {
  const protectedMarkdown = protectCode(markdown);
  let text = protectedMarkdown.text;

  text = removeRemoteImages(text);
  text = escapeUnsafeHtml(text);
  if (renderLatex) {
    text = injectMath(text);
  }

  return restoreCode(text, protectedMarkdown.placeholders);
}

export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(
      /(^|\n)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)(\n\2[ \t]*(?=\n|$)|$)/g,
      '$1$4',
    )
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*-\s+\[[ xX]\]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\\([$\\`*_{}[\]()#+\-.!])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function fallbackTablesToCodeBlocks(markdown: string): string {
  const lines = markdown.split('\n');
  const result: string[] = [];
  let index = 0;
  let inFence = false;

  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      result.push(line);
      index++;
      continue;
    }

    if (
      !inFence &&
      index + 1 < lines.length &&
      line.includes('|') &&
      /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])
    ) {
      const tableLines = [line, lines[index + 1]];
      index += 2;
      while (
        index < lines.length &&
        lines[index].includes('|') &&
        lines[index].trim()
      ) {
        tableLines.push(lines[index]);
        index++;
      }
      result.push('```text', ...tableLines, '```');
      continue;
    }

    result.push(line);
    index++;
  }

  return result.join('\n');
}

export function containsUnsafeHtml(text: string): boolean {
  return /<(script|style|iframe|object|embed|link|meta|img|video|audio|form|input|button)\b/i.test(
    text,
  );
}
