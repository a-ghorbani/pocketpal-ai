import {reflowNotice} from '../reflowNotice';

describe('reflowNotice', () => {
  it('joins the hard-wrapped lines of a paragraph', () => {
    expect(
      reflowNotice('The binaries for\nAndroid are built\n   from source.'),
    ).toBe('The binaries for Android are built from source.');
  });

  it('keeps blank lines between paragraphs', () => {
    expect(reflowNotice('one\ntwo\n\nthree\nfour\n')).toBe(
      'one two\n\nthree four\n',
    );
  });

  it('keeps headings, code fences and list items on their own lines', () => {
    const text = [
      '## Apache License 2.0',
      'Used by:',
      '* [a 1.0](https://a)',
      '* [b 2.0](https://b)',
      '- c',
      '1. Definitions.',
      '```',
      'MIT License',
      'Copyright',
      '```',
    ].join('\n');
    expect(reflowNotice(text)).toBe(
      [
        '## Apache License 2.0',
        'Used by:',
        '* [a 1.0](https://a)',
        '* [b 2.0](https://b)',
        '- c',
        '1. Definitions.',
        '```',
        'MIT License Copyright',
        '```',
      ].join('\n'),
    );
  });

  it('keeps the indentation of a paragraph first line', () => {
    expect(reflowNotice('      "License" shall mean\n      the terms.')).toBe(
      '      "License" shall mean the terms.',
    );
  });
});
