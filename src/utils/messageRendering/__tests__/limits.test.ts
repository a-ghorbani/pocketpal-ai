import {getMarkdownRenderLimits} from '..';

describe('message rendering limits', () => {
  it('keeps ordinary long answers on the rich render path', () => {
    const markdown = '# Title\n\n'.repeat(2_000);

    expect(getMarkdownRenderLimits(markdown)).toMatchObject({
      usePlainTextFallback: false,
      disableSyntaxHighlighting: false,
      fallbackTables: false,
    });
  });

  it('disables syntax highlighting for many code blocks', () => {
    const markdown = Array.from(
      {length: 20},
      (_value, index) => `\`\`\`js\nconsole.log(${index});\n\`\`\``,
    ).join('\n\n');

    expect(getMarkdownRenderLimits(markdown).disableSyntaxHighlighting).toBe(
      true,
    );
  });

  it('falls large tables back to code blocks', () => {
    const rows = Array.from(
      {length: 90},
      (_value, index) => `| ${index} | ${index + 1} |`,
    ).join('\n');
    const markdown = `| A | B |\n|---|---|\n${rows}`;

    expect(getMarkdownRenderLimits(markdown).fallbackTables).toBe(true);
  });

  it('uses plain text fallback for extremely large responses', () => {
    const markdown = 'large answer\n'.repeat(6_000);

    expect(getMarkdownRenderLimits(markdown).usePlainTextFallback).toBe(true);
  });

  it('disables math injection for very large block equations', () => {
    const markdown = `$$\n${'x + y = z\n'.repeat(1_000)}$$`;

    expect(getMarkdownRenderLimits(markdown).disableLatex).toBe(true);
  });
});
