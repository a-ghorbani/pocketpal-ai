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

/** Parses with the app's flags: every md4c extension off, as in MarkdownView. */
export const parseMarkdown = (markdown: string): MdNode => {
  if (!parseFn) {
    throw new Error('call loadMd4c() in beforeAll first');
  }
  return JSON.parse(parseFn(markdown, 0, 0, 0, 0, 0, 0, 0, 0));
};

const walk = (
  node: MdNode,
  visit: (node: MdNode, ancestors: MdNode[]) => void,
  ancestors: MdNode[] = [],
) => {
  visit(node, ancestors);
  for (const child of node.children ?? []) {
    walk(child, visit, [...ancestors, node]);
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
      const first = item.children?.[0];
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

const comparable = (node: MdNode): MdNode => {
  const children: MdNode[] = [];
  for (const child of (node.children ?? []).map(comparable)) {
    const previous = children[children.length - 1];
    if (child.type === 'Text' && previous?.type === 'Text') {
      children[children.length - 1] = {
        type: 'Text',
        content: (previous.content ?? '') + (child.content ?? ''),
      };
    } else {
      children.push(child);
    }
  }
  return {
    ...node,
    ...(node.children && {children}),
  };
};

const collect = (root: MdNode, type: string, as: (node: MdNode) => unknown) => {
  const found: string[] = [];
  walk(root, node => {
    if (node.type === type) {
      found.push(JSON.stringify(as(node)));
    }
  });
  return found;
};

const codeOf = (node: MdNode) => ({
  language: node.attributes?.language ?? '',
  text: (node.children ?? []).map(child => child.content ?? '').join(''),
});

const isSubsequence = (needles: string[], haystack: string[]) => {
  let at = 0;
  for (const item of haystack) {
    if (at < needles.length && item === needles[at]) {
      at++;
    }
  }
  return at === needles.length;
};

/**
 * What the split must keep from md4c's reading of the input: every code
 * block's text and language, every table, and every root block that holds no
 * table or code block inside a list item, in order and as md4c read it.
 */
export const blockProblems = (before: MdNode, after: MdNode): string[] => {
  const roots = (root: MdNode, keep: (node: MdNode) => boolean) =>
    (root.children ?? [])
      .filter(keep)
      .map(node => JSON.stringify(comparable(node)));
  return [
    JSON.stringify(collect(after, 'CodeBlock', codeOf)) !==
      JSON.stringify(collect(before, 'CodeBlock', codeOf)) && 'code',
    JSON.stringify(collect(after, 'Table', comparable)) !==
      JSON.stringify(collect(before, 'Table', comparable)) && 'tables',
    !isSubsequence(
      roots(before, node => nestedBlockCount(node) === 0),
      roots(after, () => true),
    ) && 'root blocks',
  ].filter((problem): problem is string => typeof problem === 'string');
};
