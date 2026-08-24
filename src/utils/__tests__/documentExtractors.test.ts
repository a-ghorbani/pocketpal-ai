import {strToU8} from 'fflate';

import {
  b64ToBytes,
  decodeEntities,
  docxXmlToText,
  epubFilesToText,
  extractCapFor,
  htmlToText,
  isExtractableFile,
  odfXmlToText,
  pptxXmlToText,
  slideOrder,
  sniffFormat,
  xlsxFilesToText,
  zipFilesToText,
} from '../documentExtractors';

const enc = (s: string) => strToU8(s);

describe('isExtractableFile / extractCapFor', () => {
  it('matches extensions and OOXML/EPUB mime types', () => {
    expect(isExtractableFile('report.PDF')).toBe(true);
    expect(isExtractableFile('paper.docx')).toBe(true);
    expect(isExtractableFile('book.epub', 'application/epub+zip')).toBe(true);
    expect(
      isExtractableFile(
        'file.bin',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(true);
    expect(isExtractableFile('file.txt')).toBe(false);
    expect(isExtractableFile('file.doc')).toBe(false); // legacy OLE, not zip
  });

  it('gives PDFs a larger cap than zip formats', () => {
    expect(extractCapFor('x.pdf')).toBeGreaterThan(extractCapFor('x.docx'));
  });
});

describe('sniffFormat', () => {
  it('detects PDF headers, including junk-prefixed ones', () => {
    expect(sniffFormat(enc('%PDF-1.7\n...'))).toBe('pdf');
    const junk = 'x'.repeat(100) + '%PDF-1.4';
    expect(sniffFormat(enc(junk))).toBe('pdf');
  });

  it('detects zip local-file headers', () => {
    expect(sniffFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe('zip');
  });

  it('returns null for anything else', () => {
    expect(sniffFormat(enc('plain text'))).toBeNull();
  });
});

describe('b64ToBytes', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array(300);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = (i * 37 + 11) & 0xff;
    }
    // Node Buffer for the encoding side; decode is ours.
    const b64 = Buffer.from(bytes).toString('base64');
    const out = b64ToBytes(b64);
    expect(Array.from(out)).toEqual(Array.from(bytes));
  });

  it('handles padding cases', () => {
    expect(Array.from(b64ToBytes(Buffer.from('a').toString('base64')))).toEqual(
      [97],
    );
    expect(
      Array.from(b64ToBytes(Buffer.from('ab').toString('base64'))),
    ).toEqual([97, 98]);
  });
});

describe('docxXmlToText', () => {
  it('joins runs into paragraphs and decodes entities', () => {
    const xml =
      '<w:document><w:body>' +
      '<w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:t xml:space="preserve">wor&amp;ld</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Second</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>line</w:t></w:r></w:p>' +
      '</w:body></w:document>';
    expect(docxXmlToText(xml)).toBe('Hello wor&ld\nSecond\tline');
  });
});

describe('pptxXmlToText', () => {
  it('extracts paragraph runs per slide', () => {
    const xml =
      '<p:sld><p:txBody>' +
      '<a:p><a:r><a:t>Slide </a:t></a:r><a:r><a:t>title</a:t></a:r></a:p>' +
      '<a:p><a:r><a:t>bullet</a:t></a:r></a:p>' +
      '</p:txBody></p:sld>';
    expect(pptxXmlToText(xml)).toBe('Slide title\nbullet');
  });
});

describe('odfXmlToText', () => {
  it('turns text:h/text:p into lines', () => {
    const xml =
      '<office:body><office:text>' +
      '<text:h>Heading</text:h>' +
      '<text:p>Para one</text:p>' +
      '</office:text></office:body>';
    expect(odfXmlToText(xml)).toBe('Heading\nPara one');
  });
});

describe('htmlToText', () => {
  it('strips tags, drops scripts, breaks blocks into lines', () => {
    const html =
      '<html><head><title>x</title></head><body>' +
      '<script>evil()</script>' +
      '<h1>Title</h1><p>First &amp; para</p><p>Second</p>' +
      '</body></html>';
    expect(htmlToText(html)).toBe('Title\nFirst & para\nSecond');
  });

  it('decodes numeric and named entities', () => {
    // &#65; -> A; &nbsp; maps to a plain space
    expect(htmlToText('<p>a&#65;b&nbsp;c</p>')).toBe('aAb c');
  });
});

describe('decodeEntities', () => {
  it('handles named, decimal, and hex forms', () => {
    expect(decodeEntities('&lt;&gt;&quot;&apos;&amp;')).toBe('<>"\'&');
    expect(decodeEntities('&#8212;')).toBe('\u2014');
    expect(decodeEntities('&#x41;')).toBe('A');
  });
});

describe('epubFilesToText', () => {
  const files = {
    'META-INF/container.xml': enc(
      '<container><rootfile full-path="OEBPS/content.opf"/></container>',
    ),
    'OEBPS/content.opf': enc(
      '<package><manifest>' +
        '<item id="c1" href="ch1.xhtml"/>' +
        '<item id="c2" href="text/ch2.xhtml"/>' +
        '<item id="css" href="style.css"/>' +
        '</manifest><spine>' +
        '<itemref idref="c1"/>' +
        '<itemref idref="c2"/>' +
        '</spine></package>',
    ),
    'OEBPS/ch1.xhtml': enc(
      '<html><body><h1>One</h1><p>alpha</p></body></html>',
    ),
    'OEBPS/text/ch2.xhtml': enc('<html><body><p>beta</p></body></html>'),
  };

  it('follows container -> OPF -> spine, resolving relative hrefs', () => {
    expect(epubFilesToText(files)).toBe('One\nalpha\n\nbeta');
  });

  it('returns empty when the container is missing', () => {
    expect(epubFilesToText({})).toBe('');
  });
});

describe('xlsxFilesToText', () => {
  it('resolves shared strings and raw values into rows', () => {
    const files = {
      'xl/sharedStrings.xml': enc(
        '<sst><si><t>name</t></si><si><t>value</t></si></sst>',
      ),
      'xl/worksheets/sheet1.xml': enc(
        '<worksheet><sheetData>' +
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
          '<row r="2"><c r="A2"><v>42</v></c><c r="B2" t="inlineStr"><is><t>note</t></is></c></row>' +
          '</sheetData></worksheet>',
      ),
    };
    expect(xlsxFilesToText(files)).toBe('[Sheet 1]\nname\tvalue\n42\tnote');
  });
});

describe('slideOrder', () => {
  it('sorts slides numerically, not lexicographically', () => {
    expect(
      slideOrder([
        'ppt/slides/slide10.xml',
        'ppt/slides/slide2.xml',
        'other.xml',
        'ppt/slides/slide1.xml',
      ]),
    ).toEqual([
      'ppt/slides/slide1.xml',
      'ppt/slides/slide2.xml',
      'ppt/slides/slide10.xml',
    ]);
  });
});

describe('zipFilesToText routing', () => {
  it('routes docx through word/document.xml', () => {
    const files = {
      'word/document.xml': enc('<w:p><w:r><w:t>docx body</w:t></w:r></w:p>'),
    };
    expect(zipFilesToText(files, 'docx')).toBe('docx body');
  });

  it('returns empty for unknown package types', () => {
    expect(zipFilesToText({'a.xml': enc('x')}, 'zip')).toBe('');
  });
});
