// The library's web build of md4c compiles the same cpp/md4c parser that the
// Android and iOS renderers use, so its tree is the one the app renders.

export interface MdNode {
  type: string;
  content?: string;
  attributes?: Record<string, string>;
  children?: MdNode[];
}

export interface MdListItem {
  text: string;
  number: number | null;
  depth: number;
}

type ParseFn = (markdown: string, ...flags: number[]) => string;

let parseFn: ParseFn | null = null;

export const loadMd4c = async () => {
  if (parseFn) {
    return;
  }
  const createModule = jest.requireActual(
    'react-native-enriched-markdown/src/web/wasm/md4c',
  );
  const module = await createModule();
  parseFn = module.cwrap('parseMarkdown', 'string', [
    'string',
    ...Array(8).fill('number'),
  ]);
};

/** Parses as MarkdownView does: GitHub flavor, the optional flags off. */
export const parseMarkdown = (markdown: string): MdNode => {
  if (!parseFn) {
    throw new Error('call loadMd4c() in beforeAll first');
  }
  return JSON.parse(parseFn(markdown, 0, 0, 0, 0, 0, 0, 0, 0));
};

/** Visits every node; `ancestors` is only valid during the call. */
const walk = (
  node: MdNode,
  visit: (node: MdNode, ancestors: MdNode[]) => void,
  ancestors: MdNode[] = [],
) => {
  visit(node, ancestors);
  if (node.children) {
    ancestors.push(node);
    for (const child of node.children) {
      walk(child, visit, ancestors);
    }
    ancestors.pop();
  }
};

const isList = (node: MdNode) =>
  node.type === 'OrderedList' || node.type === 'UnorderedList';

export const wordsOf = (node: MdNode): string[] => {
  const words: string[] = [];
  walk(node, n => {
    if (n.content !== undefined) {
      words.push(...n.content.split(/\s+/).filter(Boolean));
    }
  });
  return words;
};

/** Tables and code blocks inside a list item: the renderer gives them no block view. */
export const nestedBlockCount = (root: MdNode): number => {
  let count = 0;
  walk(root, (node, ancestors) => {
    if (
      (node.type === 'Table' || node.type === 'CodeBlock') &&
      ancestors.some(a => a.type === 'ListItem')
    ) {
      count++;
    }
  });
  return count;
};

const TEXT_BLOCKS = new Set(['Paragraph', 'Heading']);

// An item is told apart by its first text block: a block before it may move
// to the root, and a sub-list is checked item by item.
const firstText = (item: MdNode): MdNode | undefined => {
  const first = item.children?.[0];
  return first && TEXT_BLOCKS.has(first.type) ? first : undefined;
};

/** Every list item with its first words, rendered number and nesting depth. */
export const listItemsOf = (root: MdNode): MdListItem[] => {
  const result: MdListItem[] = [];
  walk(root, (node, ancestors) => {
    if (!isList(node)) {
      return;
    }
    const depth = ancestors.filter(isList).length;
    const start = parseInt(node.attributes?.start ?? '1', 10);
    (node.children ?? []).forEach((item, index) => {
      const first = firstText(item);
      result.push({
        text: first ? wordsOf(first).slice(0, 3).join(' ') : '',
        number: node.type === 'OrderedList' ? start + index : null,
        depth,
      });
    });
  });
  return result;
};

/** The root block types, which the renderer turns into separate views. */
export const rootBlockTypes = (root: MdNode): string[] =>
  (root.children ?? []).map(child => child.type);

// The split fences indented code it moves; the code text is checked on its own.
const IGNORED = new Set(['fenceChar']);
const IGNORED_WITH_TIGHT = new Set(['fenceChar', 'tight']);

const comparable = (node: MdNode, ignored = IGNORED): MdNode => {
  const result: MdNode = {type: node.type};
  if (node.content !== undefined) {
    result.content = node.content;
  }
  for (const name in node.attributes) {
    if (!ignored.has(name)) {
      result.attributes ??= {};
      result.attributes[name] = node.attributes[name];
    }
  }
  if (node.children) {
    const children: MdNode[] = [];
    for (const child of node.children) {
      const previous = children[children.length - 1];
      if (child.type === 'Text' && previous?.type === 'Text') {
        previous.content = (previous.content ?? '') + (child.content ?? '');
      } else {
        children.push(comparable(child, ignored));
      }
    }
    result.children = children;
  }
  return result;
};

const LEAF_BLOCKS = new Set([
  'Paragraph',
  'Heading',
  'CodeBlock',
  'Table',
  'ThematicBreak',
]);

interface Reading {
  leaves: string[];
  code: string[];
  tables: string[];
  items: {item: string; depth: number}[];
}

const codeOf = (node: MdNode) => ({
  language: node.attributes?.language ?? '',
  text: (node.children ?? []).map(child => child.content ?? '').join(''),
});

/** The leaf blocks, code, tables and list items in document order. */
const readingOf = (root: MdNode): Reading => {
  const reading: Reading = {leaves: [], code: [], tables: [], items: []};
  const visit = (node: MdNode, listDepth: number) => {
    if (LEAF_BLOCKS.has(node.type)) {
      const leaf = JSON.stringify(comparable(node, IGNORED_WITH_TIGHT));
      reading.leaves.push(leaf);
      if (node.type === 'CodeBlock') {
        reading.code.push(JSON.stringify(codeOf(node)));
      } else if (node.type === 'Table') {
        reading.tables.push(leaf);
      }
      return;
    }
    const children = node.children ?? [];
    if (isList(node)) {
      const start = parseInt(node.attributes?.start ?? '1', 10);
      children.forEach((item, index) => {
        const first = firstText(item);
        reading.items.push({
          item: JSON.stringify([
            node.type,
            node.type === 'OrderedList' ? start + index : null,
            first ? comparable(first, IGNORED_WITH_TIGHT) : null,
          ]),
          depth: listDepth,
        });
        (item.children ?? []).forEach(child => visit(child, listDepth + 1));
      });
      return;
    }
    children.forEach(child => visit(child, listDepth));
  };
  visit(root, 0);
  return reading;
};

/**
 * The root blocks, as the renderer draws them, before the one that holds the
 * last text: later lines of a streamed reply can still change that one and
 * anything after it, such as an empty list item.
 */
export const settledRootBlocks = (root: MdNode): string[] => {
  const children = root.children ?? [];
  let last = children.length - 1;
  while (last > 0 && readingOf(children[last]).leaves.length === 0) {
    last--;
  }
  return rootBlocks(root).slice(0, Math.max(0, last));
};

/** The root blocks as the renderer draws them. */
export const rootBlocks = (root: MdNode): string[] =>
  (root.children ?? []).map(node => JSON.stringify(comparable(node)));

const isSubsequence = (needles: string[], haystack: string[]) => {
  let at = 0;
  for (const item of haystack) {
    if (at < needles.length && item === needles[at]) {
      at++;
    }
  }
  return at === needles.length;
};

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * What the split must keep from md4c's reading of the input: every code
 * block's text and language, every table, every leaf block in document order,
 * every list item in order with its type and number and no deeper than it
 * was, and every root block that holds no table or code block inside a list
 * item, in order and as md4c read it.
 */
export const blockProblems = (before: MdNode, after: MdNode): string[] => {
  const roots = (root: MdNode, keep: (node: MdNode) => boolean) =>
    (root.children ?? [])
      .filter(keep)
      .map(node => JSON.stringify(comparable(node)));
  const was = readingOf(before);
  const is = readingOf(after);
  const sameItems = same(
    is.items.map(({item}) => item),
    was.items.map(({item}) => item),
  );
  return [
    !same(is.leaves, was.leaves) && 'leaf blocks',
    !sameItems && 'items',
    sameItems &&
      is.items.some(({depth}, k) => depth > was.items[k].depth) &&
      'deeper item',
    !same(is.code, was.code) && 'code',
    !same(is.tables, was.tables) && 'tables',
    !isSubsequence(
      roots(before, node => nestedBlockCount(node) === 0),
      roots(after, () => true),
    ) && 'root blocks',
  ].filter((problem): problem is string => typeof problem === 'string');
};
