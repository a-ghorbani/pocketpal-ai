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
      'emphasis, strike and inline code',
      'A **bold**, _soft_, *slanted* and ~~gone~~ `code` word',
      'A bold, soft, slanted and gone code word',
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
  ])('reads %s as rendered text', (_case, markdown, plain) => {
    expect(markdownToPlainText(markdown)).toBe(plain);
  });
});
