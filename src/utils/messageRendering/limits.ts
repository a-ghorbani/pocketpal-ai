export interface MarkdownRenderLimits {
  disableSyntaxHighlighting: boolean;
  disableLatex: boolean;
  fallbackTables: boolean;
  usePlainTextFallback: boolean;
}

const MAX_RICH_RENDER_CHARS = 60_000;
const MAX_HIGHLIGHT_CHARS = 24_000;
const MAX_CODE_BLOCKS_FOR_HIGHLIGHT = 16;
const MAX_TABLE_ROWS = 80;
const MAX_TABLE_CELLS = 600;
const MAX_MATH_CHARS = 8_000;
const MAX_MATH_NODES = 40;

const defaultLimits: MarkdownRenderLimits = {
  disableSyntaxHighlighting: false,
  disableLatex: false,
  fallbackTables: false,
  usePlainTextFallback: false,
};

function codeFenceStats(markdown: string) {
  const fenceRe =
    /(^|\n)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)(\n\2[ \t]*(?=\n|$)|$)/g;
  let blocks = 0;
  let chars = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRe.exec(markdown))) {
    blocks += 1;
    chars += match[4]?.length || 0;
  }

  return {blocks, chars};
}

function tableStats(markdown: string) {
  const lines = markdown.split('\n');
  let rows = 0;
  let cells = 0;
  let inFence = false;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (
      !inFence &&
      index + 1 < lines.length &&
      line.includes('|') &&
      /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])
    ) {
      index += 2;
      rows += 1;
      cells += line.split('|').length - 1;

      while (
        index < lines.length &&
        lines[index].includes('|') &&
        lines[index].trim()
      ) {
        rows += 1;
        cells += lines[index].split('|').length - 1;
        index += 1;
      }
    }
  }

  return {rows, cells};
}

function blankLike(text: string): string {
  return text.replace(/[^\n]/g, ' ');
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor--) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}

function withoutCodeFences(markdown: string): string {
  return markdown.replace(
    /(^|\n)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)(\n\2[ \t]*(?=\n|$)|$)/g,
    match => blankLike(match),
  );
}

function mathStats(markdown: string): {chars: number; nodes: number} {
  let text = withoutCodeFences(markdown);
  let chars = 0;
  let nodes = 0;

  const addMath = (content: string) => {
    chars += content.length;
    nodes += 1;
  };

  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
    addMath(content);
    return blankLike(match);
  });

  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => {
    addMath(content);
    return blankLike(match);
  });

  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (match, content) => {
    if (!content.includes('\n')) {
      addMath(content);
      return blankLike(match);
    }

    return match;
  });

  let index = 0;
  while (index < text.length) {
    const start = text.indexOf('$', index);
    if (start === -1) {
      break;
    }

    if (isEscaped(text, start) || text[start + 1] === '$') {
      index = start + 1;
      continue;
    }

    let end = text.indexOf('$', start + 1);
    while (end !== -1 && isEscaped(text, end)) {
      end = text.indexOf('$', end + 1);
    }

    if (end === -1) {
      break;
    }

    const content = text.slice(start + 1, end);
    if (content.trim() && !content.includes('\n')) {
      addMath(content);
    }
    index = end + 1;
  }

  return {chars, nodes};
}

export function getMarkdownRenderLimits(
  markdown: string,
): MarkdownRenderLimits {
  if (!markdown) {
    return defaultLimits;
  }

  const code = codeFenceStats(markdown);
  const tables = tableStats(markdown);
  const math = mathStats(markdown);

  return {
    disableSyntaxHighlighting:
      markdown.length > MAX_HIGHLIGHT_CHARS ||
      code.blocks > MAX_CODE_BLOCKS_FOR_HIGHLIGHT ||
      code.chars > MAX_HIGHLIGHT_CHARS,
    disableLatex: math.chars > MAX_MATH_CHARS || math.nodes > MAX_MATH_NODES,
    fallbackTables:
      tables.rows > MAX_TABLE_ROWS || tables.cells > MAX_TABLE_CELLS,
    usePlainTextFallback: markdown.length > MAX_RICH_RENDER_CHARS,
  };
}
