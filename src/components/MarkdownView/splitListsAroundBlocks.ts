import {closesFence, openingFence} from './codeFence';
import {
  dedent,
  expandTabs,
  INDENTED_CODE,
  indentOf,
  ListItem,
  NestedBlock,
  scanListBlocks,
  ScannedLine,
  shift,
} from './scanListBlocks';

const NESTED_TABLE_OR_FENCE =
  /^[ \t]+(?:\|[ \t]*:?-|:?-+:?[ \t]*\||`{3,}|~{3,})/m;
const NESTED_QUOTE = /^[ \t]+>/m;
const NESTED_INDENTED_CODE = /\n[ \t]*\r?\n(?: {6}| {0,5}\t)/;

const mayHaveNestedBlock = (markdown: string): boolean =>
  NESTED_TABLE_OR_FENCE.test(markdown) ||
  NESTED_QUOTE.test(markdown) ||
  NESTED_INDENTED_CODE.test(markdown);

const ORDERED_MARKER = /^([ \t]*)(\d{1,9})([.)])([ \t]*)/;
const ANY_MARKER = /^([ \t]*)(\d{1,9})?([.)\-*+])/;
const BARE_MARKER = /^[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]*$/;
const MAX_EMIT_ROUNDS = 4;
const QUOTE_PREFIX = /^[ \t]*(?:>[ \t]*)+/;
const MARKER_PREFIX = /^[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+/;

// A tab's width depends on its column, so a line that moves keeps its
// container prefix as spaces.
const prefixTabsExpanded = (text: string, prefix: RegExp): string => {
  const end = prefix.exec(text)?.[0].length ?? 0;
  return text.lastIndexOf('\t', end - 1) === -1 ? text : expandTabs(text, end);
};

const OTHER_DELIMITER: Record<string, string> = {
  '.': ')',
  ')': '.',
  '-': '*',
  '*': '-',
  '+': '-',
};

const sharedDepth = (items: ListItem[], broken: ListItem[]): number => {
  let depth = 0;
  while (
    depth < items.length &&
    depth < broken.length &&
    items[depth].id === broken[depth].id
  ) {
    depth++;
  }
  return depth;
};

const longestBacktickRun = (text: string): number =>
  Math.max(0, ...(text.match(/`+/g) ?? []).map(run => run.length));

const FENCE_RUN = /^([ \t]*)(`+|~+)/;

const withFenceLength = (text: string, length: number): string =>
  text.replace(FENCE_RUN, (_match, ws, run) => ws + run[0].repeat(length));

// At the root a code line is a closer when indented under 4, so the fence
// grows past any code line that the opener's indent kept from closing it.
const fenceLines = (body: string[], block: NestedBlock): string[] => {
  const fence = openingFence(body[0])!;
  const codeEnd = block.closed ? body.length - 1 : body.length;
  const closerLike = body
    .slice(1, codeEnd)
    .filter(
      text =>
        indentOf(text) < INDENTED_CODE &&
        !text.trimStart().startsWith('>') &&
        closesFence(text, fence),
    )
    .map(text => text.trim().length);
  const length = Math.max(fence.length, ...closerLike.map(run => run + 1));
  const closer = block.closed ? [] : [fence.marker.repeat(length)];
  if (length === fence.length) {
    return [...body, ...closer];
  }
  return [
    withFenceLength(body[0], length),
    ...body.slice(1, codeEnd),
    ...body.slice(codeEnd).map(text => withFenceLength(text, length)),
    ...closer,
  ];
};

// md4c measures a blank code line from the text column of the deepest item
// it reaches, then drops up to the code block's own indent.
const blankCodeLine = (
  line: ScannedLine,
  items: ListItem[],
  codeIndent: number,
): string => {
  const base = items.reduce(
    (col, item) => (item.contentCol <= line.indent ? item.contentCol : col),
    0,
  );
  const indent = line.indent - base;
  return (
    ' '.repeat(indent - Math.min(indent, codeIndent)) +
    (line.raw.endsWith('\r') ? '\r' : '')
  );
};

const rootBlockLines = (lines: ScannedLine[], block: NestedBlock): string[] => {
  const contentCol = block.items.length
    ? block.items[block.items.length - 1].contentCol
    : 0;
  const endsReply =
    block.end === lines.length - 1 && lines[block.end].raw === '';
  const source = lines.slice(block.start, block.end + (endsReply ? 0 : 1));
  const code = (cols: number) =>
    source.map(line =>
      line.blank
        ? blankCodeLine(line, block.items, cols - contentCol)
        : dedent(line.raw, cols),
    );
  if (block.kind === 'indentedCode') {
    const body = code(contentCol + INDENTED_CODE);
    const fence = '`'.repeat(Math.max(2, ...body.map(longestBacktickRun)) + 1);
    return [fence, ...body, fence];
  }
  if (block.kind === 'fence') {
    return fenceLines(code(lines[block.start].indent), block);
  }
  return source.map((line, j) =>
    dedent(
      prefixTabsExpanded(line.raw, QUOTE_PREFIX),
      j === 0 ? line.indent : contentCol,
    ),
  );
};

// md4c reads a fence opener that ends a nested fence by leaving its item as
// text; once that fence is closed at the root, the line would open a new one.
const escapeFence = (text: string): string =>
  text.replace(/^[ \t]*/, ws => ws + '\\');

const withDelimiter = (text: string, delimiter: string): string =>
  text.replace(ANY_MARKER, (_match, ws, num) => ws + (num ?? '') + delimiter);

const renumber = (
  text: string,
  item: ListItem,
): {text: string; shift: number} => {
  const match = ORDERED_MARKER.exec(text);
  if (!match || !item.ordered || match[2] === String(item.number)) {
    return {text, shift: 0};
  }
  const [head, ws, literal, delimiter, gap] = match;
  const number = String(item.number);
  const rest = text.slice(head.length);
  if (rest === '') {
    return {text: ws + number + delimiter, shift: 0};
  }
  const gapWidth = indentOf(gap, indentOf(ws) + literal.length + 1);
  const grow = number.length - literal.length;
  const newGap = Math.max(1, gapWidth - grow);
  return {
    text: ws + number + delimiter + ' '.repeat(newGap) + rest,
    shift: grow + newGap - gapWidth,
  };
};

interface Emitted {
  lines: string[];
  fragments: (string | undefined)[];
  mayMerge: boolean;
}

const emit = (
  lines: ScannedLine[],
  fixedDelimiters: Map<string, string>,
): Emitted => {
  const out: string[] = [];
  const fragments: (string | undefined)[] = [];
  const push = (text: string, fragment?: string) => {
    out.push(text);
    fragments.push(fragment);
  };
  const last = () => out[out.length - 1];
  const endsWithBlank = () => out.length === 0 || last().trim() === '';
  const shiftOf = new Map<number, number>();
  const shiftFor = (line: ScannedLine, keptDepth: number) => {
    if (shiftOf.size === 0) {
      return 0;
    }
    const owner = line.items
      .slice(keptDepth)
      .find(item => item !== line.opens && shiftOf.has(item.id));
    return owner ? shiftOf.get(owner.id)! : 0;
  };
  let broken: ListItem[] | null = null;
  let segmentLists: Set<number> | null = null;
  let mayMerge = false;
  const delimiterOf = new Map(fixedDelimiters);
  const lastDelimiterAtCol = new Map<number, string>();
  const seenLists = new Set<number>();
  const resumedTimes = new Map<number, number>();
  const fragmentOf = (item: ListItem) =>
    `${item.listId}:${resumedTimes.get(item.listId) ?? 0}`;
  const marker = (text: string, item: ListItem, startsList: boolean) => {
    const col = text.length - text.trimStart().length;
    const fragment = fragmentOf(item);
    const delimiter = delimiterOf.get(fragment) ?? item.delimiter;
    const previous = lastDelimiterAtCol.get(col);
    const chosen =
      startsList && previous === delimiter && !fixedDelimiters.has(fragment)
        ? OTHER_DELIMITER[delimiter]
        : delimiter;
    if (chosen !== item.delimiter) {
      delimiterOf.set(fragment, chosen);
    }
    if (segmentLists) {
      lastDelimiterAtCol.set(col, chosen);
    }
    return chosen === item.delimiter ? text : withDelimiter(text, chosen);
  };
  // The list items md4c holds open in the output, with their text column there.
  let open: {item: ListItem; contentCol: number}[] = [];
  const dedentOfList = new Map<number, number>();
  const listDedent = (items: ListItem[]) =>
    items.reduce((sum, item) => sum + (dedentOfList.get(item.listId) ?? 0), 0);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const block = line.block;
    if (block && block.start === i) {
      if (!endsWithBlank()) {
        push('');
      }
      rootBlockLines(lines, block).forEach(text => push(text));
      lastDelimiterAtCol.clear();
      segmentLists = new Set();
      broken = block.items;
      open = [];
      i = block.end + 1;
      if (i < lines.length && !lines[i].blank) {
        push('');
      }
      continue;
    }
    i++;
    if (line.blank) {
      push(line.raw);
      continue;
    }
    const opened = line.opens;
    if (line.items.length === 0 && endsWithBlank()) {
      segmentLists &&= new Set();
    }
    const keptDepth = broken ? sharedDepth(line.items, broken) : 0;
    const own = line.items.slice(keptDepth);
    const prefix = opened ? MARKER_PREFIX : line.code ? null : QUOTE_PREFIX;
    const tabsExpanded = (raw: string) =>
      prefix ? prefixTabsExpanded(raw, prefix) : raw;
    const lineShift = shiftFor(line, keptDepth);
    const moves = keptDepth > 0 || lineShift > 0 || listDedent(own) > 0;
    let text = moves ? tabsExpanded(line.raw) : line.raw;
    let resumes = false;
    let markerShift = 0;
    if (broken) {
      if (keptDepth > 0) {
        text = dedent(text, broken[keptDepth - 1].contentCol);
      }
      if (opened && broken[keptDepth]?.listId === opened.listId) {
        resumes = true;
        resumedTimes.set(
          opened.listId,
          (resumedTimes.get(opened.listId) ?? 0) + 1,
        );
        const renumbered = renumber(text, opened);
        markerShift = renumbered.shift;
        if (markerShift) {
          shiftOf.set(opened.id, markerShift);
        }
        text = renumbered.text;
        broken = keptDepth > 0 ? broken.slice(0, keptDepth) : null;
      }
      const cannotInterrupt =
        resumes ||
        (opened?.ordered === true &&
          opened.number !== 1 &&
          !seenLists.has(opened.listId));
      if (cannotInterrupt && !endsWithBlank() && !BARE_MARKER.test(last())) {
        push('');
      }
    }
    if (opened) {
      text = marker(text, opened, resumes || !seenLists.has(opened.listId));
      seenLists.add(opened.listId);
      segmentLists?.add(opened.listId);
      mayMerge ||= (segmentLists?.size ?? 0) > 1;
    }
    text = dedent(shift(text, lineShift), listDedent(own));
    if (!line.lazy) {
      let kept = 0;
      while (kept < open.length && own.includes(open[kept].item)) {
        kept++;
      }
      const leaves = open[kept]?.contentCol;
      open = open.slice(0, kept);
      const indent = indentOf(text);
      if (leaves !== undefined && indent >= leaves) {
        const root = line.rootCode;
        if (root?.start === i - 1) {
          rootBlockLines(lines, root).forEach(code => push(code));
          i = root.end + 1;
          continue;
        }
        const excess = indent - leaves + 1;
        text = dedent(moves ? text : tabsExpanded(text), excess);
        if (opened) {
          dedentOfList.set(
            opened.listId,
            (dedentOfList.get(opened.listId) ?? 0) + excess,
          );
        }
      }
      if (opened) {
        open.push({
          item: opened,
          contentCol:
            opened.contentCol + indentOf(text) - line.indent + markerShift,
        });
      }
    }
    push(
      line.fenceLikeText ? escapeFence(text) : text,
      opened && fragmentOf(opened),
    );
  }
  return {lines: out, fragments, mayMerge};
};

const mergedLists = ({lines, fragments}: Emitted): Map<string, string> => {
  const merged = new Map<string, {joined: string; partner: string}>();
  const lastFragment = new Map<number, string>();
  scanListBlocks(lines.join('\n')).lines.forEach(({opens}, i) => {
    const fragment = fragments[i];
    if (!opens || !fragment) {
      return;
    }
    const previous = lastFragment.get(opens.listId);
    if (previous && previous !== fragment) {
      merged.set(fragment, {joined: opens.delimiter, partner: previous});
    }
    lastFragment.set(opens.listId, fragment);
  });
  const fixes = new Map<string, string>();
  merged.forEach(({joined, partner}, fragment) => {
    if (!merged.has(partner)) {
      fixes.set(fragment, OTHER_DELIMITER[joined]);
    }
  });
  return fixes;
};

/**
 * Moves each table, code block or quote that holds a table or code block and
 * sits in a list item to the document root: the list closes before the block
 * and resumes after it with the number the item had. The renderer only gives
 * root blocks their own view, and drops or flattens nested ones.
 */
export const splitListsAroundBlocks = (markdown: string): string => {
  if (!mayHaveNestedBlock(markdown)) {
    return markdown;
  }
  const {lines, blocks} = scanListBlocks(markdown);
  if (blocks.length === 0) {
    return markdown;
  }
  // Both renderers draw "N." and pick the bullet by depth, so a list that
  // would join the one before it once dedented can switch its marker.
  const fixedDelimiters = new Map<string, string>();
  let emitted = emit(lines, fixedDelimiters);
  for (let round = 1; emitted.mayMerge && round < MAX_EMIT_ROUNDS; round++) {
    const fixes = mergedLists(emitted);
    if (fixes.size === 0) {
      break;
    }
    fixes.forEach((delimiter, fragment) =>
      fixedDelimiters.set(fragment, delimiter),
    );
    emitted = emit(lines, fixedDelimiters);
  }
  return emitted.lines.join('\n');
};
