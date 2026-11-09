import {closesFence, openingFence} from './codeFence';
import {
  dedent,
  expandTabs,
  INDENTED_CODE,
  indentOf,
  ListItem,
  NestedBlock,
  ScanCheckpoint,
  ScannedLine,
  scanLines,
  ScanRun,
  shift,
} from './scanListBlocks';

const NESTED_TABLE_OR_FENCE =
  /^[ \t]+(?:\|[ \t]*:?-|:?-+:?[ \t]*\||`{3,}|~{3,})/m;
const NESTED_QUOTE = /^[ \t]+>/m;
const NESTED_INDENTED_CODE =
  /(?:^|\n)[ \t]*(?:(?:[-+*]|\d{1,9}[.)])[ \t]*)?\r?\n(?: {6}| {0,5}\t)/;

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
const SETEXT_LIKE = /^ {0,3}(?:-+|=+)[ \t]*\r?$/;

// A tab's width depends on its column, so a line that moves keeps its
// container prefix as spaces.
const prefixTabsExpanded = (text: string, prefix: RegExp | null): string => {
  if (!prefix) {
    return text;
  }
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

const escapeFirst = (text: string): string =>
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

interface OutputItem {
  item: ListItem;
  contentCol: number;
}

interface EmitState {
  broken: ListItem[] | null;
  segmentLists: Set<number> | null;
  mayMerge: boolean;
  lastSeenList: number;
  resumedTimes: Map<number, number>;
  shiftOf: Map<number, number>;
  chosenDelimiter: Map<string, string>;
  lastDelimiterAtCol: Map<number, string>;
  openInOutput: OutputItem[];
  // How many of `openInOutput` hold the paragraph text just above, if any.
  textDepth: number | null;
  dedentOfList: Map<number, number>;
}

/**
 * The emit state after a scan checkpoint line. Only the lists open on that
 * line can take more items, so it keeps only their entries.
 */
interface EmitCheckpoint {
  line: number;
  outLength: number;
  state: EmitState;
}

const picked = <K, V>(map: Map<K, V>, keys: K[]): Map<K, V> => {
  const kept = new Map<K, V>();
  for (const key of keys) {
    const value = map.get(key);
    if (value !== undefined) {
      kept.set(key, value);
    }
  }
  return kept;
};

const emitCheckpoint = (
  line: number,
  items: ListItem[],
  outLength: number,
  state: EmitState,
): EmitCheckpoint => {
  const listIds = items.map(item => item.listId);
  return {
    line,
    outLength,
    state: {
      ...state,
      segmentLists: state.segmentLists && new Set(state.segmentLists),
      resumedTimes: picked(state.resumedTimes, listIds),
      shiftOf: picked(
        state.shiftOf,
        items.map(item => item.id),
      ),
      chosenDelimiter: new Map(state.chosenDelimiter),
      lastDelimiterAtCol: new Map(state.lastDelimiterAtCol),
      openInOutput: state.openInOutput.slice(),
      dedentOfList: picked(state.dedentOfList, listIds),
    },
  };
};

const restored = ({state}: EmitCheckpoint): EmitState => ({
  ...state,
  segmentLists: state.segmentLists && new Set(state.segmentLists),
  resumedTimes: new Map(state.resumedTimes),
  shiftOf: new Map(state.shiftOf),
  chosenDelimiter: new Map(state.chosenDelimiter),
  lastDelimiterAtCol: new Map(state.lastDelimiterAtCol),
  openInOutput: state.openInOutput.slice(),
  dedentOfList: new Map(state.dedentOfList),
});

const sameFixes = (a: Map<string, string>, b: Map<string, string>) =>
  a.size === b.size &&
  [...a].every(([fragment, delimiter]) => b.get(fragment) === delimiter);

const emit = (
  lines: ScannedLine[],
  fixed: Map<string, string>,
  resume?: {emitted: Emitted; checkpoint: EmitCheckpoint},
  checkpointAt = -1,
): {emitted: Emitted; checkpoint?: EmitCheckpoint} => {
  const from = resume?.checkpoint;
  const out = resume ? resume.emitted.lines : [];
  const fragments = resume ? resume.emitted.fragments : [];
  out.length = fragments.length = from ? from.outLength : 0;
  const state: EmitState = from
    ? restored(from)
    : {
        broken: null,
        segmentLists: null,
        mayMerge: false,
        lastSeenList: 0,
        resumedTimes: new Map(),
        shiftOf: new Map(),
        chosenDelimiter: new Map(),
        lastDelimiterAtCol: new Map(),
        openInOutput: [],
        textDepth: null,
        dedentOfList: new Map(),
      };
  const push = (text: string, fragment?: string) => {
    out.push(text);
    fragments.push(fragment);
  };
  const last = () => out[out.length - 1];
  const endsWithBlank = () => out.length === 0 || last().trim() === '';
  const shiftFor = (line: ScannedLine, keptDepth: number) => {
    for (let d = keptDepth; d < line.items.length; d++) {
      const item = line.items[d];
      const itemShift =
        item === line.opens ? undefined : state.shiftOf.get(item.id);
      if (itemShift !== undefined) {
        return itemShift;
      }
    }
    return 0;
  };
  const listDedent = (items: ListItem[], keptDepth: number) => {
    let sum = 0;
    for (let d = keptDepth; d < items.length; d++) {
      sum += state.dedentOfList.get(items[d].listId) ?? 0;
    }
    return sum;
  };
  const fragmentOf = (item: ListItem) =>
    `${item.listId}:${state.resumedTimes.get(item.listId) ?? 0}`;
  const marker = (text: string, item: ListItem, startsList: boolean) => {
    const col = text.length - text.trimStart().length;
    const fragment = fragmentOf(item);
    const delimiter =
      state.chosenDelimiter.get(fragment) ??
      fixed.get(fragment) ??
      item.delimiter;
    const previous = state.lastDelimiterAtCol.get(col);
    const chosen =
      startsList && previous === delimiter && !fixed.has(fragment)
        ? OTHER_DELIMITER[delimiter]
        : delimiter;
    if (chosen !== item.delimiter) {
      state.chosenDelimiter.set(fragment, chosen);
    }
    if (state.segmentLists) {
      state.lastDelimiterAtCol.set(col, chosen);
    }
    return chosen === item.delimiter ? text : withDelimiter(text, chosen);
  };

  const emitBlock = (block: NestedBlock) => {
    if (!endsWithBlank()) {
      push('');
    }
    for (const text of rootBlockLines(lines, block)) {
      push(text);
    }
    state.lastDelimiterAtCol.clear();
    state.segmentLists = new Set();
    state.broken = block.items;
    state.openInOutput = [];
    state.textDepth = null;
    const next = block.end + 1;
    if (next < lines.length && !lines[next].blank) {
      push('');
    }
    return next;
  };

  // A line that would land inside an output item it does not belong to moves
  // left of that item's text; a root code block there moves as a whole.
  const keepOutOfItem = (
    line: ScannedLine,
    i: number,
    text: string,
    leftItem: number | undefined,
    prefix: RegExp | null,
  ): {text: string} | {next: number} => {
    const indent = indentOf(text);
    if (leftItem === undefined || indent < leftItem) {
      return {text};
    }
    const root = line.rootCode;
    if (root?.start === i) {
      for (const code of rootBlockLines(lines, root)) {
        push(code);
      }
      state.textDepth = null;
      return {next: root.end + 1};
    }
    const excess = indent - leftItem + 1;
    if (line.opens) {
      const listId = line.opens.listId;
      state.dedentOfList.set(
        listId,
        (state.dedentOfList.get(listId) ?? 0) + excess,
      );
    }
    return {text: dedent(prefixTabsExpanded(text, prefix), excess)};
  };

  const emitLine = (line: ScannedLine, i: number): number => {
    const opened = line.opens;
    if (line.items.length === 0 && endsWithBlank()) {
      state.segmentLists &&= new Set();
    }
    const {broken} = state;
    const keptDepth = broken ? sharedDepth(line.items, broken) : 0;
    const prefix = opened ? MARKER_PREFIX : line.code ? null : QUOTE_PREFIX;
    const open = state.openInOutput;
    let keptOpen = 0;
    while (
      keptOpen < open.length &&
      line.items.indexOf(open[keptOpen].item, keptDepth) !== -1
    ) {
      keptOpen++;
    }
    // md4c reads the line as continuing the paragraph above, so it may not
    // start an ordered list there and can underline it.
    const continuesText =
      state.textDepth !== null && keptOpen >= state.textDepth;
    const lineShift = shiftFor(line, keptDepth);
    const dedentBy = listDedent(line.items, keptDepth);
    const moves = keptDepth > 0 || lineShift > 0 || dedentBy > 0;
    let text = moves ? prefixTabsExpanded(line.raw, prefix) : line.raw;
    let resumes = false;
    if (broken) {
      if (keptDepth > 0) {
        text = dedent(text, broken[keptDepth - 1].contentCol);
      }
      if (opened && broken[keptDepth]?.listId === opened.listId) {
        resumes = true;
        state.resumedTimes.set(
          opened.listId,
          (state.resumedTimes.get(opened.listId) ?? 0) + 1,
        );
        const renumbered = renumber(text, opened);
        if (renumbered.shift) {
          state.shiftOf.set(opened.id, renumbered.shift);
        }
        text = renumbered.text;
        state.broken = keptDepth > 0 ? broken.slice(0, keptDepth) : null;
      }
      const cannotInterrupt = resumes
        ? !endsWithBlank() && !BARE_MARKER.test(last())
        : continuesText &&
          opened?.ordered === true &&
          opened.number !== 1 &&
          opened.listId > state.lastSeenList;
      if (cannotInterrupt) {
        push('');
      }
    }
    if (opened) {
      text = marker(
        text,
        opened,
        resumes || opened.listId > state.lastSeenList,
      );
      state.lastSeenList = Math.max(state.lastSeenList, opened.listId);
      state.segmentLists?.add(opened.listId);
      state.mayMerge ||= (state.segmentLists?.size ?? 0) > 1;
    }
    text = dedent(shift(text, lineShift), dedentBy);
    const leftItem = open[keptOpen]?.contentCol;
    open.length = keptOpen;
    const kept = keepOutOfItem(line, i, text, leftItem, moves ? null : prefix);
    if ('next' in kept) {
      return kept.next;
    }
    text = kept.text;
    if (opened) {
      open.push({
        item: opened,
        contentCol: opened.contentCol + indentOf(text) - line.indent,
      });
    }
    // Text that left its item can sit right above a line md4c read as a
    // rule, a marker or lazy text, and that line would now underline it.
    if (
      continuesText &&
      !line.setext &&
      !endsWithBlank() &&
      SETEXT_LIKE.test(text)
    ) {
      if (line.lazy) {
        text = escapeFirst(text);
      } else {
        push('');
      }
    }
    // md4c reads a fence opener that ends a nested fence by leaving its item as
    // text; once that fence is closed at the root, the line would open a new one.
    push(
      line.fenceLikeText ? escapeFirst(text) : text,
      opened && fragmentOf(opened),
    );
    state.textDepth = line.text ? open.length : null;
    return i + 1;
  };

  let checkpoint = from?.line === checkpointAt ? from : undefined;
  let i = from ? from.line + 1 : 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.block?.start === i) {
      i = emitBlock(line.block);
    } else if (line.blank) {
      push(line.raw);
      state.textDepth = null;
      i++;
    } else {
      i = emitLine(line, i);
    }
    if (i - 1 === checkpointAt) {
      checkpoint = emitCheckpoint(
        checkpointAt,
        lines[checkpointAt].items,
        out.length,
        state,
      );
    }
  }
  return {
    emitted: {lines: out, fragments, mayMerge: state.mayMerge},
    checkpoint,
  };
};

interface MergeState {
  lastFragment: Map<number, string>;
  merged: Map<string, {joined: string; partner: string}>;
}

interface MergeCheckpoint {
  line: number;
  state: MergeState;
}

/** Tracks which fragments md4c joins to a list from another fragment. */
const trackMerges = (
  scanned: ScannedLine[],
  fragments: (string | undefined)[],
  resume: MergeCheckpoint | undefined,
  checkpointAt = -1,
): {merged: MergeState['merged']; checkpoint?: MergeCheckpoint} => {
  const lastFragment = new Map(resume?.state.lastFragment);
  const merged = new Map(resume?.state.merged);
  let checkpoint = resume?.line === checkpointAt ? resume : undefined;
  for (let i = resume ? resume.line + 1 : 0; i < scanned.length; i++) {
    const {opens, items} = scanned[i];
    const fragment = fragments[i];
    if (opens && fragment) {
      const previous = lastFragment.get(opens.listId);
      if (previous && previous !== fragment) {
        merged.set(fragment, {joined: opens.delimiter, partner: previous});
      }
      lastFragment.set(opens.listId, fragment);
    }
    if (i === checkpointAt) {
      checkpoint = {
        line: i,
        state: {
          lastFragment: picked(
            lastFragment,
            items.map(item => item.listId),
          ),
          merged: new Map(merged),
        },
      };
    }
  }
  return {merged, checkpoint};
};

const fixesOf = (merged: MergeState['merged']): Map<string, string> => {
  const fixes = new Map<string, string>();
  merged.forEach(({joined, partner}, fragment) => {
    if (!merged.has(partner)) {
      fixes.set(fragment, OTHER_DELIMITER[joined]);
    }
  });
  return fixes;
};

interface Round {
  fixed: Map<string, string>;
  emitted: Emitted;
  checkpoint?: EmitCheckpoint;
  resumed: boolean;
  // The output lines before the checkpoint, joined.
  settledText: string;
  outScan?: ScanRun;
  merges?: MergeCheckpoint;
}

interface Reply {
  // The input through the scan checkpoint's line and its line break.
  settled: string;
  raw: string[];
  scan: ScanRun;
  rounds: Round[];
}

const MAX_REPLIES = 2;

const joinedFrom = (
  base: string,
  baseLength: number,
  lines: string[],
  length: number,
): string => {
  if (length === baseLength) {
    return base;
  }
  const added = lines.slice(baseLength, length).join('\n');
  return baseLength === 0 ? added : `${base}\n${added}`;
};

const outputOf = ({emitted, checkpoint, settledText}: Round): string => {
  const settled = checkpoint?.outLength ?? 0;
  const rest = emitted.lines.slice(settled).join('\n');
  if (settled === 0) {
    return rest;
  }
  return settled === emitted.lines.length
    ? settledText
    : `${settledText}\n${rest}`;
};

const emitRound = (
  lines: ScannedLine[],
  fixed: Map<string, string>,
  previous: Round | undefined,
  resumedAt: number | undefined,
  checkpointAt: number | undefined,
): Round => {
  const resume =
    previous?.checkpoint &&
    previous.checkpoint.line === resumedAt &&
    sameFixes(previous.fixed, fixed)
      ? {emitted: previous.emitted, checkpoint: previous.checkpoint}
      : undefined;
  const {emitted, checkpoint} = emit(lines, fixed, resume, checkpointAt);
  return {
    fixed,
    emitted,
    checkpoint,
    resumed: resume !== undefined,
    settledText: joinedFrom(
      resume ? previous!.settledText : '',
      resume ? resume.checkpoint.outLength : 0,
      emitted.lines,
      checkpoint?.outLength ?? 0,
    ),
  };
};

const fixesAfter = (round: Round, previous: Round | undefined) => {
  const outScan = previous?.outScan;
  const merges = previous?.merges;
  const resumes =
    round.resumed &&
    outScan?.checkpoint !== undefined &&
    merges?.line === outScan.checkpoint.line;
  round.outScan = scanLines(round.emitted.lines, {
    resume: resumes
      ? {scan: outScan!.scan, checkpoint: outScan!.checkpoint!}
      : undefined,
    checkpointBefore: round.checkpoint?.outLength ?? 0,
  });
  const {merged, checkpoint} = trackMerges(
    round.outScan.scan.lines,
    round.emitted.fragments,
    resumes ? merges : undefined,
    round.outScan.checkpoint?.line,
  );
  round.merges = checkpoint;
  return fixesOf(merged);
};

const settledInput = (
  markdown: string,
  raw: string[],
  checkpoint: ScanCheckpoint | undefined,
  cached: Reply | undefined,
): string => {
  if (!checkpoint) {
    return '';
  }
  const from = cached?.scan.checkpoint;
  let length = from ? cached!.settled.length : 0;
  for (let j = from ? from.line + 1 : 0; j <= checkpoint.line; j++) {
    length += raw[j].length + 1;
  }
  return markdown.slice(0, length);
};

const splitReply = (
  markdown: string,
  cached: Reply | undefined,
): {reply: Reply; output: string} => {
  const from = cached?.scan.checkpoint;
  const raw = from ? cached!.raw : [];
  raw.length = from ? from.line + 1 : 0;
  for (const text of markdown
    .slice(from ? cached!.settled.length : 0)
    .split('\n')) {
    raw.push(text);
  }
  const scan = scanLines(raw, {
    resume: from && {scan: cached!.scan.scan, checkpoint: from},
    checkpointBefore: raw.length - 1,
  });
  const reply: Reply = {
    settled: settledInput(markdown, raw, scan.checkpoint, cached),
    raw,
    scan,
    rounds: [],
  };
  if (scan.scan.blocks.length === 0) {
    return {reply, output: markdown};
  }
  let fixed = new Map<string, string>();
  for (let r = 0; ; r++) {
    const previous = from ? cached!.rounds[r] : undefined;
    const round = emitRound(
      scan.scan.lines,
      fixed,
      previous,
      from?.line,
      scan.checkpoint?.line,
    );
    reply.rounds.push(round);
    if (!round.emitted.mayMerge || r + 1 >= MAX_EMIT_ROUNDS) {
      return {reply, output: outputOf(round)};
    }
    const fixes = fixesAfter(round, previous);
    if (fixes.size === 0) {
      return {reply, output: outputOf(round)};
    }
    fixed = new Map([...fixed, ...fixes]);
  }
};

/**
 * Returns a split that keeps the work done for the last replies it saw: a
 * streamed reply only scans and emits again from its last item marker line.
 */
export const createListSplitter = (): ((markdown: string) => string) => {
  const replies: Reply[] = [];
  return markdown => {
    if (!mayHaveNestedBlock(markdown)) {
      return markdown;
    }
    const index = replies.findIndex(
      ({settled}) => settled !== '' && markdown.startsWith(settled),
    );
    const cached = index === -1 ? undefined : replies.splice(index, 1)[0];
    const {reply, output} = splitReply(markdown, cached);
    replies.unshift(reply);
    replies.length = Math.min(replies.length, MAX_REPLIES);
    return output;
  };
};

/**
 * Moves each table, code block or quote that holds a table or fenced code and
 * sits in a list item to the document root: the list closes before the block
 * and resumes after it with the number the item had. The renderer only gives
 * root blocks their own view, and drops or flattens nested ones.
 */
export const splitListsAroundBlocks = createListSplitter();
