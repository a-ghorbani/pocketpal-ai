import {normalizeBreakTags} from '../normalizeBreakTags';

const newlines = (text: string) => text.split('\n').length;

describe('normalizeBreakTags', () => {
  it.each(['<br>', '<br/>', '<br />', '<br\t/>', '<BR>', '<Br />'])(
    'turns %s into one space',
    tag => {
      expect(normalizeBreakTags(`one${tag}two`)).toBe('one two');
    },
  );

  it.each(['<br class="x">', '</br>', '<b>', '<brx>'])(
    'leaves %s literal',
    tag => {
      expect(normalizeBreakTags(`one${tag}two`)).toBe(`one${tag}two`);
    },
  );

  it('never matches across a newline', () => {
    expect(normalizeBreakTags('a<br\n>b')).toBe('a<br\n>b');
  });

  it('replaces inside a table cell without changing the row shape', () => {
    const table = '| h | v |\n| --- | --- |\n| a | x<br>y |';
    expect(normalizeBreakTags(table)).toBe(
      '| h | v |\n| --- | --- |\n| a | x y |',
    );
  });

  it('replaces every tag in a paragraph', () => {
    expect(normalizeBreakTags('one<br/>two<br>three')).toBe('one two three');
  });

  it('keeps inline code spans literal', () => {
    expect(normalizeBreakTags('a `<br>` b<br>c')).toBe('a `<br>` b c');
  });

  it('matches code spans by backtick run length', () => {
    expect(normalizeBreakTags('``a ` <br> ``<br>')).toBe('``a ` <br> `` ');
  });

  it('treats an unmatched backtick run as text', () => {
    expect(normalizeBreakTags('a ` b<br>c')).toBe('a ` b c');
  });

  it('opens no code span on an escaped backtick', () => {
    expect(normalizeBreakTags('\\`a<br>b`')).toBe('\\`a b`');
  });

  it('keeps a closed backtick fence literal', () => {
    const text = 'x<br>y\n```\n<br>\n```\nafter<br>';
    expect(normalizeBreakTags(text)).toBe('x y\n```\n<br>\n```\nafter ');
  });

  it('keeps a tilde fence literal', () => {
    const text = '~~~py\n<br>\n~~~\nafter<br>';
    expect(normalizeBreakTags(text)).toBe('~~~py\n<br>\n~~~\nafter ');
  });

  it('closes a fence only on the same marker with at least its length', () => {
    const text = '````\n```\n~~~~\n<br>\n````\n<br>';
    expect(normalizeBreakTags(text)).toBe('````\n```\n~~~~\n<br>\n````\n ');
  });

  it('keeps everything after an unclosed fence literal', () => {
    const text = 'a<br>\n```py\nx = 1<br>\n<br>';
    expect(normalizeBreakTags(text)).toBe('a \n```py\nx = 1<br>\n<br>');
  });

  it('detects fences inside list items and blockquotes', () => {
    const text = '1. Install:\n\n   ```\n   <br>\n   ```\n> ```\n> <br>\n> ```';
    expect(normalizeBreakTags(text)).toBe(text);
  });

  it('blanks a line holding only break tags', () => {
    expect(normalizeBreakTags('a\n<br><br/>\nb')).toBe('a\n  \nb');
  });

  it('never changes the newline count', () => {
    const text =
      '| a | x<br>y |\n\none<br/>two\n\n`<br>`\n\n```\n<br>\n```\n<br>\n~~~\n<br>';
    expect(newlines(normalizeBreakTags(text))).toBe(newlines(text));
  });

  it('returns text without a tag unchanged', () => {
    const text = 'plain\n\n```\ncode\n```';
    expect(normalizeBreakTags(text)).toBe(text);
  });
});
