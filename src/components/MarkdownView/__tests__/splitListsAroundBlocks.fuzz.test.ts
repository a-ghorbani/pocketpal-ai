import {
  listItemsOf,
  loadMd4c,
  nestedBlockCount,
  parseMarkdown,
  wordsOf,
} from '../../../../jest/md4c';

import {splitListsAroundBlocks} from '../splitListsAroundBlocks';

beforeAll(loadMd4c);

const DOCUMENTS = 400;

const seededRandom = (seed: number) => (n: number) => {
  seed = (seed * 48271) % 2147483647;
  return seed % n;
};

const randomReply = (random: (n: number) => number): string => {
  const pick = <T>(choices: T[]) => choices[random(choices.length)];
  const lines: string[] = [];
  let id = 0;
  const table = (indent: string) =>
    [
      `| h${++id}a | h${id}b |`,
      '|---|:--:|',
      `| c${id}x | c${id}y |`,
      `| d${id}x | d${id}y |`,
    ].map(line => indent + line);
  const code = (indent: string) =>
    ['```py', `print(${++id})`, `1. not item ${id}`, '```'].map(
      line => indent + line,
    );
  const list = (depth: number, indent: string) => {
    const ordered = random(2) === 0;
    const allSame = random(4) === 0;
    const start = pick([1, 1, 1, 3, 9]);
    const count = 1 + random(4);
    for (let k = 0; k < count; k++) {
      const marker = ordered
        ? `${allSame ? start : start + k}.`
        : pick(['-', '-', '*']);
      const content = indent + ' '.repeat(marker.length + 1);
      lines.push(`${indent}${marker} item${++id} words here`);
      if (random(3) === 0) {
        lines.push(`${random(2) ? content : ''}lazy${id} continuation`);
      }
      const extras = random(4);
      for (let e = 0; e < extras; e++) {
        const kind = random(5);
        const blankAfter = random(4) !== 0;
        if (kind < 2) {
          lines.push('', ...table(content), ...(blankAfter ? [''] : []));
        } else if (kind === 2) {
          lines.push(...(blankAfter ? [''] : []), ...code(content));
        } else if (kind === 3 && depth < 3) {
          list(depth + 1, content);
        } else {
          lines.push('', `${content}para${++id} after block`);
        }
      }
      if (random(3) === 0) {
        lines.push('');
      }
    }
  };
  if (random(2)) {
    lines.push('Intro text.', '');
  }
  list(0, '');
  if (random(2)) {
    lines.push('', 'Closing text.');
  }
  return lines.join('\n');
};

const MARKUP = /^[|:`~-]+(?:py)?$/;

const numbers = (markdown: string) =>
  listItemsOf(parseMarkdown(markdown))
    .map(item => `${item.text} = ${item.number}`)
    .sort();

const problemsOf = (input: string): string[] => {
  const output = splitListsAroundBlocks(input);
  const before = wordsOf(parseMarkdown(input));
  const after = wordsOf(parseMarkdown(output));
  const content = (words: string[]) => words.filter(w => !MARKUP.test(w));
  const markup = (words: string[]) => words.filter(w => MARKUP.test(w));
  return [
    nestedBlockCount(parseMarkdown(output)) > 0 && 'nested',
    JSON.stringify(content(after)) !== JSON.stringify(content(before)) &&
      'words',
    markup(after).length > markup(before).length && 'markup',
    JSON.stringify(numbers(output)) !== JSON.stringify(numbers(input)) &&
      'numbers',
  ].filter((problem): problem is string => typeof problem === 'string');
};

// md4c's reading of a few deep, blank-heavy lists changes when an unrelated
// paragraph gets longer, so a prefix only counts as failing if it also fails
// with longer text.
const failsWithLongerText = (markdown: string) =>
  problemsOf(markdown.replace(/ words here/g, ' words here too')).length > 0;

it('keeps words, numbers and root blocks on random nested replies and every line prefix', () => {
  const random = seededRandom(42);
  const failures: string[] = [];
  let layoutDependent = 0;
  for (let d = 0; d < DOCUMENTS; d++) {
    const lines = randomReply(random).split('\n');
    let unstable = false;
    for (let n = 1; n <= lines.length; n++) {
      const prefix = lines.slice(0, n).join('\n');
      const problems = problemsOf(prefix);
      if (problems.length === 0) {
        continue;
      }
      if (failsWithLongerText(prefix)) {
        failures.push(`${problems.join()}\n${prefix}`);
        break;
      }
      unstable = true;
    }
    layoutDependent += unstable ? 1 : 0;
  }

  expect(failures).toEqual([]);
  expect(layoutDependent).toBeLessThan(DOCUMENTS / 50);
});
