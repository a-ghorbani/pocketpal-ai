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
  missingFenceClose?: string;
}

export interface ScannedLine {
  raw: string;
  indent: number;
  blank: boolean;
  items: ListItem[];
  opens?: ListItem;
  block?: NestedBlock;
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

const leadingWhitespace = (text: string): {indent: number; offset: number} => {
  let indent = 0;
  let offset = 0;
  while (text[offset] === ' ' || text[offset] === '\t') {
    indent += text[offset] === '\t' ? TAB_STOP - (indent % TAB_STOP) : 1;
    offset++;
  }
  return {indent, offset};
};

export const dedent = (text: string, cols: number): string => {
  let col = 0;
  let i = 0;
  while (col < cols && (text[i] === ' ' || text[i] === '\t')) {
    col += text[i] === '\t' ? TAB_STOP - (col % TAB_STOP) : 1;
    i++;
  }
  return ' '.repeat(Math.max(0, col - cols)) + text.slice(i);
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
  const {indent: spaces, offset} = leadingWhitespace(after);
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
  let fence: {fence: Fence; depth: number; block?: NestedBlock} | null = null;
  let indentedCode: NestedBlock | null = null;
  let hasTableOrFence = false;

  const contentColAt = (depth: number) =>
    depth > 0 ? stack[depth - 1].contentCol : 0;
  const addBlock = (kind: NestedBlockKind, start: number, end: number) => {
    const block: NestedBlock = {kind, start, end, items: stack.slice()};
    blocks.push(block);
    for (let j = start; j <= end; j++) {
      lines[j].block = block;
    }
    return block;
  };
  const extend = (block: NestedBlock | undefined, i: number) => {
    if (block) {
      block.end = i;
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
      fence = {fence: markerLineFence, depth: stack.length};
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
        if (closes && indent - contentColAt(depth) < INDENTED_CODE) {
          fence = null;
        }
        continue;
      }
      // md4c takes a closing fence as the closer even when it leaves the item.
      if (closes) {
        extend(fence.block, i);
        fence = null;
        stack = stack.slice(0, itemsHolding(indent));
        lines[i].items = stack.slice();
        continue;
      }
      if (fence.block) {
        fence.block.missingFenceClose = fence.fence.marker.repeat(
          fence.fence.length,
        );
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
      if (depth > 0) {
        if (previousIndentedCode?.items.length === depth) {
          for (let j = previousIndentedCode.end + 1; j <= i; j++) {
            extend(previousIndentedCode, j);
          }
          indentedCode = previousIndentedCode;
        } else {
          indentedCode = addBlock('indentedCode', i, i);
        }
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
      extend(table.block, i);
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
      fence = {
        fence: opened,
        depth,
        block: depth > 0 ? addBlock('fence', i, i) : undefined,
      };
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
