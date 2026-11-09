import {
  dedent,
  INDENTED_CODE,
  ListItem,
  NestedBlock,
  scanListBlocks,
  ScannedLine,
} from './scanListBlocks';

const NESTED_TABLE_OR_FENCE =
  /^[ \t]+(?:\|[ \t]*:?-|:?-+:?[ \t]*\||`{3,}|~{3,})/m;
const NESTED_QUOTE = /^[ \t]+>/m;
const NESTED_INDENTED_CODE = /\n[ \t]*\n(?: {6}|\t)/;

const mayHaveNestedBlock = (markdown: string): boolean =>
  NESTED_TABLE_OR_FENCE.test(markdown) ||
  NESTED_QUOTE.test(markdown) ||
  NESTED_INDENTED_CODE.test(markdown);

const ORDERED_MARKER = /^([ \t]*)(\d{1,9})([.)])([ \t]*)/;
const ANY_MARKER = /^([ \t]*)(\d{1,9})?([.)\-*+])/;
const BARE_MARKER = /^[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]*$/;
const MAX_EMIT_ROUNDS = 4;

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

const rootBlockLines = (lines: ScannedLine[], block: NestedBlock): string[] => {
  const contentCol = block.items[block.items.length - 1].contentCol;
  const source = lines.slice(block.start, block.end + 1);
  if (block.kind === 'indentedCode') {
    const body = source.map(line =>
      dedent(line.raw, contentCol + INDENTED_CODE),
    );
    const fence = '`'.repeat(Math.max(2, ...body.map(longestBacktickRun)) + 1);
    return [fence, ...body, fence];
  }
  const cols = Math.max(contentCol, lines[block.start].indent);
  const body = source.map(line => dedent(line.raw, cols));
  return block.missingFenceClose ? [...body, block.missingFenceClose] : body;
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
  const grow = number.length - literal.length;
  const newGap = Math.max(1, gap.length - grow);
  return {
    text: ws + number + delimiter + ' '.repeat(newGap) + rest,
    shift: grow + newGap - gap.length,
  };
};

interface Emitted {
  lines: string[];
  openers: (ListItem | undefined)[];
  mayMerge: boolean;
}

const emit = (
  lines: ScannedLine[],
  fixedDelimiters: Map<number, string>,
): Emitted => {
  const out: string[] = [];
  const openers: (ListItem | undefined)[] = [];
  const push = (text: string, opener?: ListItem) => {
    out.push(text);
    openers.push(opener);
  };
  const last = () => out[out.length - 1];
  const endsWithBlank = () => out.length === 0 || last().trim() === '';
  const shiftOf = new Map<number, number>();
  const shifted = (line: ScannedLine, text: string, keptDepth: number) => {
    if (shiftOf.size === 0) {
      return text;
    }
    const owner = line.items
      .slice(keptDepth)
      .find(item => item !== line.opens && shiftOf.has(item.id));
    return owner ? ' '.repeat(shiftOf.get(owner.id)!) + text : text;
  };
  const delimiterOf = new Map(fixedDelimiters);
  const lastDelimiterAtCol = new Map<number, string>();
  const seenLists = new Set<number>();
  const marker = (text: string, item: ListItem, startsList: boolean) => {
    const col = text.length - text.trimStart().length;
    const delimiter = delimiterOf.get(item.listId) ?? item.delimiter;
    const previous = lastDelimiterAtCol.get(col);
    const chosen =
      startsList && previous === delimiter && !fixedDelimiters.has(item.listId)
        ? OTHER_DELIMITER[delimiter]
        : delimiter;
    if (chosen !== item.delimiter) {
      delimiterOf.set(item.listId, chosen);
    }
    lastDelimiterAtCol.set(col, chosen);
    return chosen === item.delimiter ? text : withDelimiter(text, chosen);
  };
  let broken: ListItem[] | null = null;
  let segmentLists: Set<number> | null = null;
  let mayMerge = false;

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
    let text = line.raw;
    let keptDepth = 0;
    let resumes = false;
    if (broken) {
      keptDepth = sharedDepth(line.items, broken);
      if (keptDepth > 0) {
        text = dedent(text, broken[keptDepth - 1].contentCol);
      }
      if (opened && broken[keptDepth]?.listId === opened.listId) {
        resumes = true;
        const renumbered = renumber(text, opened);
        if (renumbered.shift) {
          shiftOf.set(opened.id, renumbered.shift);
        }
        text = renumbered.text;
        broken = keptDepth > 0 ? broken.slice(0, keptDepth) : null;
      }
      // An ordered list that starts at a number other than 1 cannot interrupt a paragraph.
      const cannotInterrupt =
        resumes || (opened?.ordered === true && opened.number !== 1);
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
    text = shifted(line, text, keptDepth);
    push(line.fenceLikeText ? escapeFence(text) : text, opened);
  }
  return {lines: out, openers, mayMerge};
};

const mergedLists = ({lines, openers}: Emitted): Map<number, string> => {
  const merged = new Map<number, {joined: string; partner: number}>();
  const lastInputItem = new Map<number, ListItem>();
  scanListBlocks(lines.join('\n')).lines.forEach(({opens}, i) => {
    const input = openers[i];
    if (!opens || !input) {
      return;
    }
    const previous = lastInputItem.get(opens.listId);
    if (previous && previous.listId !== input.listId) {
      merged.set(input.listId, {
        joined: opens.delimiter,
        partner: previous.listId,
      });
    }
    lastInputItem.set(opens.listId, input);
  });
  const fixes = new Map<number, string>();
  merged.forEach(({joined, partner}, listId) => {
    if (!merged.has(partner)) {
      fixes.set(listId, OTHER_DELIMITER[joined]);
    }
  });
  return fixes;
};

/**
 * Moves each table, code block or table-holding quote that sits in a list
 * item to the document root: the list closes before the block and resumes
 * after it with the number the item had. The renderer only gives root blocks
 * their own view, and drops or flattens nested ones.
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
  const fixedDelimiters = new Map<number, string>();
  let emitted = emit(lines, fixedDelimiters);
  for (let round = 1; emitted.mayMerge && round < MAX_EMIT_ROUNDS; round++) {
    const fixes = mergedLists(emitted);
    if (fixes.size === 0) {
      break;
    }
    fixes.forEach((delimiter, listId) =>
      fixedDelimiters.set(listId, delimiter),
    );
    emitted = emit(lines, fixedDelimiters);
  }
  return emitted.lines.join('\n');
};
