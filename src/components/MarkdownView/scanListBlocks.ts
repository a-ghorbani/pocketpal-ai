import {closesFence, emptiedByFence, Fence, openingFence} from './codeFence';

export interface ListItem {
  id: number;
  listId: number;
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
  text?: boolean;
  setext?: boolean;
  code?: boolean;
  fenceLikeText?: boolean;
}

export interface Scan {
  lines: ScannedLine[];
  blocks: NestedBlock[];
  hasTableOrFence: boolean;
  openFence?: Fence;
  openParagraph: boolean;
}

interface Paragraph {
  start: number;
  lines: number;
  depth: number;
}

interface EmptyItem {
  item: ListItem;
  blankAfter: boolean;
}

/**
 * The scan state after a line that no later line can change: one that opens a
 * list item, or a blank line outside every list and code block. A paragraph
 * and an empty item keep changing after it, so their counts are copied.
 */
export interface ScanCheckpoint {
  line: number;
  blockCount: number;
  stack: ListItem[];
  nextItemId: number;
  nextListId: number;
  paragraph: Paragraph | null;
  paragraphLines: number;
  fence: {fence: Fence; depth: number} | null;
  hasTableOrFence: boolean;
  emptyItem: EmptyItem | null;
  blankAfterEmptyItem: boolean;
}

export interface ScanRun {
  scan: Scan;
  checkpoint?: ScanCheckpoint;
}

interface ScanOptions {
  nested?: boolean;
  /** A run of the same lines up to its checkpoint; its arrays are reused. */
  resume?: {scan: Scan; checkpoint: ScanCheckpoint};
  /** Checkpoints are taken only on lines before this one. */
  checkpointBefore?: number;
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

/** Moves a line by `cols` columns; a non-zero move turns its leading tabs into spaces. */
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

const LAZY_TEXT = 'lazy';

// The space after `>` belongs to the mark, and a tab there counts from its column.
const quotedContent = (content: string, col: number): string => {
  const {indent, offset} = leadingWhitespace(content.slice(1), col + 1);
  return ' '.repeat(Math.max(0, indent - 1)) + content.slice(1 + offset);
};

const contentOf = (text: string, offset: number): string =>
  text.slice(offset, text.endsWith('\r') ? -1 : undefined);

/**
 * Follows md4c's per-line block analysis for list items, paragraphs, tables,
 * fences and quotes, and reports every table, fence, indented code block or
 * quote that holds a table or fenced code and sits inside a list item.
 */
export const scanLines = (
  raw: string[],
  {nested = false, resume, checkpointBefore = -1}: ScanOptions = {},
): ScanRun => {
  const from = resume?.checkpoint;
  const lines = resume ? resume.scan.lines : [];
  const blocks = resume ? resume.scan.blocks : [];
  lines.length = from ? from.line + 1 : 0;
  blocks.length = from ? from.blockCount : 0;
  let stack = from ? from.stack : [];
  let nextItemId = from ? from.nextItemId : 1;
  let nextListId = from ? from.nextListId : 1;
  let paragraph: Paragraph | null = from?.paragraph
    ? {...from.paragraph, lines: from.paragraphLines}
    : null;
  let table: {depth: number; block?: NestedBlock} | null = null;
  // A fence on a list marker line stays in its item, so it has no block.
  let fence: {fence: Fence; depth: number; block?: NestedBlock} | null =
    from?.fence ?? null;
  let indentedCode: NestedBlock | null = null;
  let hasTableOrFence = from ? from.hasTableOrFence : false;
  let quoteAtEnd: Scan | null = null;
  let emptyItem: EmptyItem | null = from?.emptyItem
    ? {...from.emptyItem, blankAfter: from.blankAfterEmptyItem}
    : null;
  // Reused across checkpoint lines, so a whole scan allocates one.
  let latest: ScanCheckpoint | undefined;
  const keep = (i: number) => {
    if (i >= checkpointBefore) {
      return;
    }
    latest ??= {} as ScanCheckpoint;
    latest.line = i;
    latest.blockCount = blocks.length;
    latest.stack = stack;
    latest.nextItemId = nextItemId;
    latest.nextListId = nextListId;
    latest.paragraph = paragraph;
    latest.paragraphLines = paragraph?.lines ?? 0;
    latest.fence = fence;
    latest.hasTableOrFence = hasTableOrFence;
    latest.emptyItem = emptyItem;
    latest.blankAfterEmptyItem = emptyItem?.blankAfter ?? false;
  };

  const contentColAt = (depth: number) =>
    depth > 0 ? stack[depth - 1].contentCol : 0;
  const addBlock = (kind: NestedBlockKind, start: number, end: number) => {
    const block: NestedBlock = {kind, start, end, items: stack};
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
  const canOpenBlockAt = (indent: number) =>
    indent - contentColAt(itemsHolding(indent)) < INDENTED_CODE;
  // md4c takes a closing fence as the closer even when it leaves a container.
  const closesLeaving = (indent: number, content: string, open: Fence) =>
    canOpenBlockAt(indent) &&
    !content.startsWith('>') &&
    closesFence(content, open);
  const readAsBlank = (i: number, indent: number) => {
    stack = stack.slice(0, itemsHolding(indent));
    lines[i] = {
      raw: raw[i].endsWith('\r') ? '\r' : '',
      indent: 0,
      blank: true,
      items: stack,
    };
    paragraph = null;
    table = null;
  };
  const openItem = (marker: Marker, i: number, sibling?: ListItem) => {
    const item: ListItem = {
      id: nextItemId++,
      listId: sibling ? sibling.listId : nextListId++,
      contentCol: marker.contentCol,
      ordered: marker.ordered,
      delimiter: marker.delimiter,
      number: sibling ? sibling.number + 1 : marker.number,
    };
    stack = [...stack, item];
    emptyItem = marker.empty ? {item, blankAfter: false} : null;
    lines[i].opens = item;
    lines[i].items = stack;
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
      lines[i].text = true;
    }
    keep(i);
  };

  for (let i = from ? from.line + 1 : 0; i < raw.length; i++) {
    const text = raw[i];
    const {indent, offset} = leadingWhitespace(text);
    const content = contentOf(text, offset);
    const blank = content === '';
    lines.push({raw: text, indent, blank, items: stack});

    let fenceLikeText = false;
    if (fence) {
      const {depth, block} = fence;
      const inside = blank || depth === 0 || indent >= contentColAt(depth);
      const closes = inside
        ? !blank &&
          !content.startsWith('>') &&
          closesFence(content, fence.fence) &&
          indent - contentColAt(depth) < INDENTED_CODE
        : closesLeaving(indent, content, fence.fence);
      if (inside || closes) {
        lines[i].code = true;
        if (block) {
          extend(block, i);
          block.closed = closes;
        }
        if (closes) {
          fence = null;
        }
        if (!inside) {
          stack = stack.slice(0, itemsHolding(indent));
          lines[i].items = stack;
        }
        continue;
      }
      const emptied =
        canOpenBlockAt(indent) && emptiedByFence(content, fence.fence);
      fenceLikeText =
        canOpenBlockAt(indent) &&
        fenceOpenedBy(content)?.marker === fence.fence.marker;
      lines[i].fenceLikeText = fenceLikeText;
      fence = null;
      if (emptied) {
        readAsBlank(i, indent);
        continue;
      }
    }
    if (blank) {
      if (emptyItem && emptyItem.item === stack[stack.length - 1]) {
        emptyItem.blankAfter = true;
      }
      paragraph = null;
      table = null;
      if (stack.length === 0 && indentedCode === null) {
        keep(i);
      }
      continue;
    }
    const previousIndentedCode = indentedCode as NestedBlock | null;
    indentedCode = null;

    let kept = itemsHolding(indent);
    // An item can begin with at most one blank line.
    if (emptyItem?.blankAfter && kept === stack.length) {
      stack = stack.slice(0, -1);
      lines[i].items = stack;
      kept = stack.length;
    }
    emptyItem = null;
    if (kept < stack.length) {
      const relIndent = indent - contentColAt(kept);
      const marker =
        relIndent < INDENTED_CODE ? parseMarker(content, indent) : null;
      if (
        marker &&
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
        lines[i].text = true;
        continue;
      }
      stack = stack.slice(0, kept);
      paragraph = null;
      table = null;
      lines[i].items = stack;
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
      lines[i].setext = true;
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
      const quoted = [quotedContent(content, indent)];
      let inner: Scan | null = null;
      let itemsLeft = depth;
      let closed = false;
      let emptied = false;
      let end = i;
      while (end + 1 < raw.length && !closed) {
        const next = raw[end + 1];
        const ws = leadingWhitespace(next);
        const nextContent = contentOf(next, ws.offset);
        if (nextContent === '') {
          break;
        }
        const holding = itemsHolding(ws.indent);
        const nextRelIndent = ws.indent - contentColAt(holding);
        if (
          holding === depth &&
          nextRelIndent < INDENTED_CODE &&
          nextContent.startsWith('>')
        ) {
          quoted.push(quotedContent(nextContent, ws.indent));
          inner = null;
        } else {
          inner ??= scanLines(quoted, {nested: true}).scan;
          if (inner.openFence) {
            if (!closesLeaving(ws.indent, nextContent, inner.openFence)) {
              emptied =
                canOpenBlockAt(ws.indent) &&
                emptiedByFence(nextContent, inner.openFence);
              break;
            }
            closed = true;
            itemsLeft = holding;
          } else if (
            !inner.openParagraph ||
            interruptsParagraph(nextContent, nextRelIndent)
          ) {
            break;
          }
          // A lazy line only continues the quoted paragraph: it never makes a
          // table underline there.
          quoted.push(closed ? nextContent : LAZY_TEXT);
        }
        end++;
        lines.push({raw: next, indent: ws.indent, blank: false, items: stack});
      }
      if (depth > 0 || (nested && end === raw.length - 1)) {
        inner = scanLines(quoted, {nested: true}).scan;
        if (depth > 0 && inner.hasTableOrFence) {
          addBlock('quote', i, end);
        }
        quoteAtEnd = end === raw.length - 1 ? inner : null;
      }
      stack = stack.slice(0, itemsLeft);
      paragraph = null;
      table = null;
      i = end;
      if (emptied) {
        i++;
        lines.push({raw: raw[i], indent: 0, blank: true, items: []});
        readAsBlank(i, leadingWhitespace(raw[i]).indent);
      }
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
    lines[i].text = true;
  }
  return {
    scan: {
      lines,
      blocks,
      hasTableOrFence,
      openFence: quoteAtEnd ? quoteAtEnd.openFence : fence?.fence,
      openParagraph: quoteAtEnd
        ? quoteAtEnd.openParagraph
        : paragraph !== null && table === null,
    },
    checkpoint: latest ?? from,
  };
};
