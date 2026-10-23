import {markdownToPlainText} from '../markdownToPlainText';

describe('markdownToPlainText', () => {
  it.each([
    ['plain text', 'Hello there, how are you?', 'Hello there, how are you?'],
    [
      'a link',
      'See [the probe](http://127.0.0.1:8099/probe).',
      'See the probe.',
    ],
    ['an image', '![a cat](file:///cat.png)', 'a cat'],
    [
      'paired emphasis and strike',
      'A **bold**, __strong__, _soft_, *slanted* and ~~gone~~ word',
      'A bold, strong, soft, slanted and gone word',
    ],
    ['a heading', '## Title', 'Title'],
    ['a quote', '> quoted', 'quoted'],
    [
      'lists and task items',
      '- first item\n- second item\n1. one\n* [x] done',
      'first item second item one done',
    ],
    ['a fenced block', '```py\nprint("a * b_c")\n```', 'print("a * b_c")'],
    ['snake_case words', 'my_var and your_var', 'my_var and your_var'],
    ['an unpaired double star', 'What is 2**10?', 'What is 2**10?'],
    ['spaced stars', 'compute 2 * 3 * 4', 'compute 2 * 3 * 4'],
    ['a star before a space', 'rate * 2* now', 'rate * 2* now'],
    ['an underscore before a space', 'a _ b_ c', 'a _ b_ c'],
    ['inline code', 'call `__init__` now', 'call __init__ now'],
    ['inline code with stars', 'run `**x** and *y*`', 'run **x** and *y*'],
    ['star arguments', 'def f(*args, **kwargs):', 'def f(*args, **kwargs):'],
    ['a break tag', 'first<br>second', 'first second'],
    ['an unclosed backtick', 'a ` b', 'a ` b'],
  ])('reads %s as rendered text', (_case, markdown, plain) => {
    expect(markdownToPlainText(markdown)).toBe(plain);
  });

  it('stays linear on a 100 KB run of unclosed links', () => {
    const run = '[x]('.repeat(25_000);
    const start = Date.now();

    markdownToPlainText(run);

    expect(Date.now() - start).toBeLessThan(250);
  });
});
