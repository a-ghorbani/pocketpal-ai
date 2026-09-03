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

function mathChars(markdown: string): number {
  let total = 0;

  markdown.replace(/\$\$([\s\S]*?)\$\$/g, (_match, content) => {
    total += content.length;
    return '';
  });

  markdown.replace(/\\\[([\s\S]*?)\\\]/g, (_match, content) => {
    total += content.length;
    return '';
  });

  return total;
}

export function getMarkdownRenderLimits(
  markdown: string,
): MarkdownRenderLimits {
  if (!markdown) {
    return defaultLimits;
  }

  const code = codeFenceStats(markdown);
  const tables = tableStats(markdown);
  const math = mathChars(markdown);

  return {
    disableSyntaxHighlighting:
      markdown.length > MAX_HIGHLIGHT_CHARS ||
      code.blocks > MAX_CODE_BLOCKS_FOR_HIGHLIGHT ||
      code.chars > MAX_HIGHLIGHT_CHARS,
    disableLatex: math > MAX_MATH_CHARS,
    fallbackTables:
      tables.rows > MAX_TABLE_ROWS || tables.cells > MAX_TABLE_CELLS,
    usePlainTextFallback: markdown.length > MAX_RICH_RENDER_CHARS,
  };
}
