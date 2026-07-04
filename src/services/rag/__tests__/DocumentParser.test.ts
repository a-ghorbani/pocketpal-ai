/**
 * DocumentParser tests.
 */

import {DocumentParser} from '../DocumentParser';

describe('DocumentParser', () => {
  describe('detectFormat', () => {
    it('detects common formats by extension', () => {
      expect(DocumentParser.detectFormat('readme.md')).toBe('md');
      expect(DocumentParser.detectFormat('notes.txt')).toBe('txt');
      expect(DocumentParser.detectFormat('page.html')).toBe('html');
      expect(DocumentParser.detectFormat('data.json')).toBe('json');
      expect(DocumentParser.detectFormat('report.pdf')).toBe('pdf');
    });

    it('falls back to txt for unknown extensions', () => {
      expect(DocumentParser.detectFormat('file.xyz')).toBe('txt');
      expect(DocumentParser.detectFormat('noextension')).toBe('txt');
    });

    it('is case-insensitive', () => {
      expect(DocumentParser.detectFormat('README.MD')).toBe('md');
      expect(DocumentParser.detectFormat('page.HTML')).toBe('html');
    });
  });

  describe('parseTxt', () => {
    it('trims whitespace', () => {
      const result = DocumentParser.parse('  hello world  ', 'txt');
      expect(result).toBe('hello world');
    });

    it('preserves internal whitespace', () => {
      const result = DocumentParser.parse('line1\n\nline2', 'txt');
      expect(result).toBe('line1\n\nline2');
    });
  });

  describe('parseMarkdown', () => {
    it('strips code blocks', () => {
      const md = 'Before\n```js\nconst x = 1;\n```\nAfter';
      const result = DocumentParser.parse(md, 'md');
      expect(result).toBe('Before\n\nAfter');
    });

    it('strips inline code', () => {
      const result = DocumentParser.parse('Use `npm install` to install', 'md');
      expect(result).toBe('Use npm install to install');
    });

    it('converts links to text', () => {
      const result = DocumentParser.parse(
        'See [the docs](https://example.com) for more',
        'md',
      );
      expect(result).toBe('See the docs for more');
    });

    it('strips image syntax but keeps alt text', () => {
      const result = DocumentParser.parse(
        '![alt text](image.png) here',
        'md',
      );
      expect(result).toBe('alt text here');
    });

    it('strips header markers', () => {
      const result = DocumentParser.parse('# Title\n## Subtitle', 'md');
      expect(result).toBe('Title\nSubtitle');
    });

    it('strips bold and italic markers', () => {
      const result = DocumentParser.parse(
        '**bold** and *italic* and _underline_',
        'md',
      );
      expect(result).toBe('bold and italic and underline');
    });

    it('strips list markers', () => {
      const md = '- item one\n* item two\n+ item three\n1. numbered';
      const result = DocumentParser.parse(md, 'md');
      expect(result).toBe('item one\nitem two\nitem three\nnumbered');
    });

    it('strips blockquote markers', () => {
      const result = DocumentParser.parse('> quoted text', 'md');
      expect(result).toBe('quoted text');
    });
  });

  describe('parseHtml', () => {
    it('strips HTML tags', () => {
      const html = '<p>Hello <strong>world</strong></p>';
      const result = DocumentParser.parse(html, 'html');
      expect(result).toBe('Hello world');
    });

    it('removes script and style content', () => {
      const html =
        '<style>body{color:red}</style><script>alert(1)</script><p>Text</p>';
      const result = DocumentParser.parse(html, 'html');
      expect(result).toBe('Text');
    });

    it('decodes HTML entities', () => {
      const html = '&amp; &lt; &gt; &quot; &#39; &nbsp; end';
      const result = DocumentParser.parse(html, 'html');
      // &nbsp; -> space, then \s+ -> single space, then trim
      expect(result).toBe('& < > " \' end');
    });
  });

  describe('parseJson', () => {
    it('extracts string values', () => {
      const json = JSON.stringify({name: 'Alice', role: 'engineer'});
      const result = DocumentParser.parse(json, 'json');
      expect(result).toContain('Alice');
      expect(result).toContain('engineer');
    });

    it('extracts from nested objects', () => {
      const json = JSON.stringify({
        user: {name: 'Bob', address: {city: 'NYC'}},
      });
      const result = DocumentParser.parse(json, 'json');
      expect(result).toContain('Bob');
      expect(result).toContain('NYC');
    });

    it('extracts from arrays', () => {
      const json = JSON.stringify({items: ['apple', 'banana', 'cherry']});
      const result = DocumentParser.parse(json, 'json');
      expect(result).toContain('apple');
      expect(result).toContain('banana');
      expect(result).toContain('cherry');
    });

    it('handles numbers and booleans', () => {
      const json = JSON.stringify({count: 42, active: true});
      const result = DocumentParser.parse(json, 'json');
      expect(result).toContain('42');
      expect(result).toContain('true');
    });

    it('returns original content on parse error', () => {
      const invalid = '{not valid json';
      const result = DocumentParser.parse(invalid, 'json');
      expect(result).toBe(invalid);
    });
  });

  describe('parsePdf', () => {
    it('throws on empty content', () => {
      expect(() => DocumentParser.parse('', 'pdf')).toThrow();
      expect(() => DocumentParser.parse('   ', 'pdf')).toThrow();
    });

    it('returns content as-is for non-empty (placeholder)', () => {
      const result = DocumentParser.parse('placeholder content', 'pdf');
      expect(result).toBe('placeholder content');
    });
  });

  describe('parse (default fallback)', () => {
    it('returns content unchanged for unknown format', () => {
      // @ts-expect-error testing unknown format
      const result = DocumentParser.parse('hello', 'unknown');
      expect(result).toBe('hello');
    });
  });
});
