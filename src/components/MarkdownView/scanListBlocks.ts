import {closesFence, Fence, openingFence} from './codeFence';

export interface ListItem {
  id: number;
  listId: number;
  depth: number;
  contentCol: number;
  ordered: boolean;
  delimiter: string;
  number: number;
}

export type NestedBlockKind = 'table' | 'fence' | 'quote' | 'indentedCode';

export interface NestedBlock {
  kind: NestedBlockKind;
  start: number;
  end: number;
  items: ListItem[];
  closed?: boolean;
}

export interface ScannedLine {
  raw: string;
  indent: number;
  blank: boolean;
  items: ListItem[];
  opens?: ListItem;
  block?: NestedBlock;
  rootCode?: NestedBlock;
  lazy?: boolean;
  code?: boolean;
  fenceLikeText?: boolean;
}

interface Scan {
  lines: ScannedLine[];
  blocks: NestedBlock[];
  hasTableOrFence: boolean;
}

interface Marker {
  ordered: boolean;
  delimiter: string;
  number: number;
  empty: boolean;
  contentCol: number;
  rest: string;
}

const MARKER = /^(?:([-+*])|(\d{1,9})([.)]))(?=[ \t]|$)/;
const THEMATIC_BREAK = /^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const SETEXT_UNDERLINE = /^(?:=+|-+)[ \t]*$/;
const ATX_HEADING = /^#{1,6}(?:[ \t]|$)/;
const TABLE_CELL_UNDERLINE = /^:?-+:?/;

const TAB_STOP = 4;
export const INDENTED_CODE = 4;

const leadingWhitespace = (
  text: string,
  startCol = 0,
): {indent: number; offset: number} => {
  let col = startCol;
  let offset = 0;
  while (text[offset] === ' ' || text[offset] === '\t') {
    col += text[offset] === '\t' ? TAB_STOP - (col % TAB_STOP) : 1;
    offset++;
  }
  return {indent: col - startCol, offset};
};

export const indentOf = (text: string, startCol = 0): number =>
  leadingWhitespace(text, startCol).indent;

/** Moves a line by `cols` columns, turning its leading tabs into spaces. */
export const shift = (text: string, cols: number): string => {
  if (cols === 0) {
    return text;
  }
  const {indent, offset} = leadingWhitespace(text);
  return ' '.repeat(Math.max(0, indent + cols)) + text.slice(offset);
};

export const dedent = (text: string, cols: number): string =>
  shift(text, -cols);

/** Turns tabs in the first `end` characters into spaces at their columns. */
export const expandTabs = (text: string, end: number): string => {
  let col = 0;
  let expanded = '';
  for (let i = 0; i < end; i++) {
    const width = text[i] === '\t' ? TAB_STOP - (col % TAB_STOP) : 1;
    expanded += text[i] === '\t' ? ' '.repeat(width) : text[i];
    col += width;
  }
  return expanded + text.slice(end);
};

const skipBlanks = (text: string): string => text.replace(/^[ \t]+/, '');

const isTableUnderline = (content: string): boolean => {
  let rest = content.replace(/[ \t]+$/, '');
  let hasPipe = false;
  if (rest.startsWith('|')) {
    hasPipe = true;
    rest = skipBlanks(rest.slice(1));
  }
  for (;;) {
    const cell = TABLE_CELL_UNDERLINE.exec(rest);
    if (!cell) {
      return false;
    }
    rest = skipBlanks(rest.slice(cell[0].length));
    const delimited = rest.startsWith('|');
    if (delimited) {
      hasPipe = true;
      rest = skipBlanks(rest.slice(1));
    }
    if (rest === '') {
      return hasPipe;
    }
    if (!delimited) {
      return false;
    }
  }
};

const parseMarker = (content: string, indent: number): Marker | null => {
  const match = MARKER.exec(content);
  if (!match || THEMATIC_BREAK.test(content)) {
    return null;
  }
  const after = content.slice(match[0].length);
  const {indent: spaces, offset} = leadingWhitespace(
    after,
    indent + match[0].length,
  );
  const rest = after.slice(offset);
  const empty = rest === '';
  const gap = empty || spaces > INDENTED_CODE ? 1 : spaces;
  return {
    ordered: match[2] !== undefined,
    delimiter: match[1] ?? match[3],
    number: match[2] !== undefined ? parseInt(match[2], 10) : 0,
    empty,
    contentCol: indent + match[0].length + gap,
    rest,
  };
};

const fenceOpenedBy = (content: string): Fence | undefined =>
  content.startsWith('>') ? undefined : openingFence(content);

const interruptsParagraph = (content: string, relIndent: number): boolean =>
  relIndent < INDENTED_CODE &&
  (MARKER.test(content) ||
    THEMATIC_BREAK.test(content) ||
    ATX_HEADING.test(content) ||
    content.startsWith('>') ||
    fenceOpenedBy(content) !== undefined);

const contentOf = (text: string, offset: number): string =>
  text.slice(offset).replace(/\r$/, '');

/**
 * Follows md4c's per-line block analysis for list items, paragraphs, tables,
 * fences and quotes, and reports every table, fence, indented code block or
 * table-holding quote that sits inside a list item.
 */
export const scanListBlocks = (markdown: string): Scan => {
  const lines: ScannedLine[] = [];
  const blocks: NestedBlock[] = [];
  let stack: ListItem[] = [];
  let nextItemId = 1;
  let nextListId = 1;
  let paragraph: {start: number; lines: number; depth: number} | null = null;
  let table: {depth: number; block?: NestedBlock} | null = null;
  let fence: {fence: Fence; depth: number; block: NestedBlock} | null = null;
  let indentedCode: NestedBlock | null = null;
  let hasTableOrFence = false;

  const contentColAt = (depth: number) =>
    depth > 0 ? stack[depth - 1].contentCol : 0;
  const addBlock = (kind: NestedBlockKind, start: number, end: number) => {
    const block: NestedBlock = {kind, start, end, items: stack.slice()};
    if (block.items.length === 0) {
      lines[start].rootCode = block;
      return block;
    }
    blocks.push(block);
    for (let j = start; j <= end; j++) {
      lines[j].block = block;
    }
    return block;
  };
  const extend = (block: NestedBlock, i: number) => {
    block.end = i;
    if (block.items.length > 0) {
      lines[i].block = block;
    }
  };
  const itemsHolding = (indent: number) => {
    let count = 0;
    while (count < stack.length && indent >= stack[count].contentCol) {
      count++;
    }
    return count;
  };
  const openItem = (marker: Marker, i: number, sibling?: ListItem) => {
    const item: ListItem = {
      id: nextItemId++,
      listId: sibling ? sibling.listId : nextListId++,
      depth: stack.length + 1,
      contentCol: marker.contentCol,
      ordered: marker.ordered,
      delimiter: marker.delimiter,
      number: sibling ? sibling.number + 1 : marker.number,
    };
    stack.push(item);
    lines[i].opens = item;
    lines[i].items = stack.slice();
    table = null;
    paragraph = null;
    const markerLineFence = marker.empty
      ? undefined
      : fenceOpenedBy(marker.rest);
    if (markerLineFence) {
      fence = {
        fence: markerLineFence,
        depth: stack.length,
        block: {kind: 'fence', start: i, end: i, items: []},
      };
    } else if (
      !marker.empty &&
      !ATX_HEADING.test(marker.rest) &&
      !marker.rest.startsWith('>')
    ) {
      paragraph = {start: i, lines: 1, depth: stack.length};
    }
  };

  const raw = markdown.split('\n');
  for (let i = 0; i < raw.length; i++) {
    const text = raw[i];
    const {indent, offset} = leadingWhitespace(text);
    const content = contentOf(text, offset);
    const blank = content === '';
    lines.push({raw: text, indent, blank, items: stack.slice()});

    let fenceLikeText = false;
    if (fence) {
      const depth = fence.depth;
      const closes =
        !blank && !content.startsWith('>') && closesFence(content, fence.fence);
      if (blank || depth === 0 || indent >= contentColAt(depth)) {
        extend(fence.block, i);
        lines[i].code = true;
        if (closes && indent - contentColAt(depth) < INDENTED_CODE) {
          fence.block.closed = true;
          fence = null;
        }
        continue;
      }
      // md4c takes a closing fence as the closer even when it leaves the item.
      if (closes) {
        extend(fence.block, i);
        lines[i].code = true;
        fence.block.closed = true;
        fence = null;
        stack = stack.slice(0, itemsHolding(indent));
        lines[i].items = stack.slice();
        continue;
      }
      fenceLikeText = fenceOpenedBy(content)?.marker === fence.fence.marker;
      lines[i].fenceLikeText = fenceLikeText;
      fence = null;
    }
    if (blank) {
      paragraph = null;
      table = null;
      continue;
    }
    const previousIndentedCode = indentedCode as NestedBlock | null;
    indentedCode = null;

    const kept = itemsHolding(indent);
    if (kept < stack.length) {
      const relIndent = indent - contentColAt(kept);
      const marker =
        relIndent < INDENTED_CODE ? parseMarker(content, indent) : null;
      const isSetext = paragraph !== null && SETEXT_UNDERLINE.test(content);
      if (
        marker &&
        !isSetext &&
        marker.ordered === stack[kept].ordered &&
        marker.delimiter === stack[kept].delimiter
      ) {
        const previous = stack[kept];
        stack = stack.slice(0, kept);
        openItem(marker, i, previous);
        continue;
      }
      const lazy =
        paragraph !== null &&
        table === null &&
        paragraph.depth === stack.length &&
        !interruptsParagraph(content, relIndent);
      if (lazy) {
        paragraph!.lines++;
        lines[i].lazy = true;
        continue;
      }
      stack = stack.slice(0, kept);
      paragraph = null;
      table = null;
      lines[i].items = stack.slice();
    }

    const depth = stack.length;
    const relIndent = indent - contentColAt(depth);
    const inParagraph = paragraph !== null && paragraph.depth === depth;
    const canOpenBlock = relIndent < INDENTED_CODE;
    if (!canOpenBlock && !inParagraph) {
      table = null;
      lines[i].code = true;
      if (previousIndentedCode?.items.length === depth) {
        for (let j = previousIndentedCode.end + 1; j <= i; j++) {
          extend(previousIndentedCode, j);
        }
        indentedCode = previousIndentedCode;
      } else {
        indentedCode = addBlock('indentedCode', i, i);
      }
      continue;
    }
    if (canOpenBlock && inParagraph && SETEXT_UNDERLINE.test(content)) {
      paragraph = null;
      continue;
    }
    if (canOpenBlock && THEMATIC_BREAK.test(content)) {
      paragraph = null;
      table = null;
      continue;
    }
    const marker = canOpenBlock ? parseMarker(content, indent) : null;
    if (
      marker &&
      !(
        inParagraph &&
        (marker.empty || (marker.ordered && marker.number !== 1))
      )
    ) {
      openItem(marker, i);
      continue;
    }
    if (canOpenBlock && content.startsWith('>')) {
      let end = i;
      const quoted = [content];
      while (end + 1 < raw.length) {
        const next = raw[end + 1];
        const ws = leadingWhitespace(next);
        const nextContent = contentOf(next, ws.offset);
        if (nextContent === '' || ws.indent < contentColAt(depth)) {
          break;
        }
        if (
          !nextContent.startsWith('>') &&
          interruptsParagraph(nextContent, ws.indent - contentColAt(depth))
        ) {
          break;
        }
        end++;
        lines.push({
          raw: next,
          indent: ws.indent,
          blank: false,
          items: stack.slice(),
        });
        quoted.push(nextContent);
      }
      const inner = quoted.map(l => l.replace(/^>[ ]?/, '')).join('\n');
      if (depth > 0 && scanListBlocks(inner).hasTableOrFence) {
        addBlock('quote', i, end);
      }
      i = end;
      paragraph = null;
      table = null;
      continue;
    }
    if (table && table.depth === depth) {
      if (table.block) {
        extend(table.block, i);
      }
      continue;
    }
    if (canOpenBlock && ATX_HEADING.test(content)) {
      paragraph = null;
      continue;
    }
    const opened =
      canOpenBlock && !fenceLikeText ? fenceOpenedBy(content) : undefined;
    if (opened) {
      paragraph = null;
      hasTableOrFence = true;
      fence = {fence: opened, depth, block: addBlock('fence', i, i)};
      continue;
    }
    if (inParagraph && paragraph!.lines === 1 && isTableUnderline(content)) {
      const header = lines[paragraph!.start];
      table = {
        depth,
        block:
          depth > 0 && !header.opens
            ? addBlock('table', paragraph!.start, i)
            : undefined,
      };
      hasTableOrFence = true;
      paragraph = null;
      continue;
    }
    if (inParagraph) {
      paragraph!.lines++;
    } else {
      paragraph = {start: i, lines: 1, depth};
    }
  }
  return {lines, blocks, hasTableOrFence};
};
