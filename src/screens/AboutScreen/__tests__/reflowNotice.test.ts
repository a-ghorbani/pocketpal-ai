import sections from '../../../assets/licenses/phononThirdPartyNotices.json';
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

  it('keeps headings, code fences and list items on their own lines and joins the text between them', () => {
    const text = [
      '## Apache License 2.0',
      'Used by:',
      '* [a 1.0](https://a)',
      '* [b 2.0](https://b)',
      '- c',
      '1. Definitions.',
      '```',
      'MIT License',
      'text',
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
        'MIT License text',
        '```',
      ].join('\n'),
    );
  });

  it('keeps the indentation of a paragraph first line', () => {
    expect(reflowNotice('      "License" shall mean\n      the terms.')).toBe(
      '      "License" shall mean the terms.',
    );
  });

  it('keeps adjacent Copyright lines apart', () => {
    expect(
      reflowNotice('Copyright (c) 2011 A\nCopyright (c) 2020 B <b@b.org>'),
    ).toBe('Copyright (c) 2011 A\nCopyright (c) 2020 B <b@b.org>');
  });

  it('keeps the Apache License header lines apart', () => {
    const header = [
      '                                 Apache License',
      '                           Version 2.0, January 2004',
      '                        http://www.apache.org/licenses/',
    ].join('\n');
    expect(reflowNotice(header)).toBe(header);
  });

  it('reads CRLF line endings as LF', () => {
    expect(
      reflowNotice(
        'Copyright (c) 2014 A\r\nCopyright (c) 2021 B\r\n\r\nPermission is\r\nhereby granted.',
      ),
    ).toBe(
      'Copyright (c) 2014 A\nCopyright (c) 2021 B\n\nPermission is hereby granted.',
    );
  });

  it('leaves no fused Copyright lines or carriage returns in the bundled notices', () => {
    const lines = sections.map(reflowNotice).join('\n').split('\n');
    for (const line of lines) {
      expect(line.match(/Copyright/g)?.length ?? 0).toBeLessThan(2);
      expect(line).not.toContain('\r');
    }
  });
});
