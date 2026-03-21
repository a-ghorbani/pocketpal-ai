import {marked} from 'marked';

/**
 * marked extensions for LaTeX math rendering.
 *
 * Block math:  $$...$$  → <math-block>encoded-formula</math-block>
 * Inline math: $...$    → <math-inline>encoded-formula</math-inline>
 *
 * Formulas are URI-encoded so HTML special chars (<, >, &, etc.)
 * don't corrupt the HTML string passed to react-native-render-html.
 */

const mathBlock = {
  name: 'mathBlock',
  level: 'block' as const,
  start(src: string) {
    const dollar = src.indexOf('$$');
    const bracket = src.indexOf('\\[');
    if (dollar === -1) return bracket;
    if (bracket === -1) return dollar;
    return Math.min(dollar, bracket);
  },
  tokenizer(src: string) {
    // $$...$$ syntax
    const matchDollar = /^\$\$([\s\S]+?)\$\$/.exec(src);
    if (matchDollar) {
      return {
        type: 'mathBlock',
        raw: matchDollar[0],
        formula: matchDollar[1].trim(),
      };
    }
    // \[...\] syntax
    const matchBracket = /^\\\[([\s\S]+?)\\\]/.exec(src);
    if (matchBracket) {
      return {
        type: 'mathBlock',
        raw: matchBracket[0],
        formula: matchBracket[1].trim(),
      };
    }
    return undefined;
  },
  renderer(token: any) {
    return `<math-block>${encodeURIComponent(token.formula)}</math-block>\n`;
  },
};

const mathInline = {
  name: 'mathInline',
  level: 'inline' as const,
  start(src: string) {
    const dollar = src.indexOf('$');
    const paren = src.indexOf('\\(');
    if (dollar === -1) return paren;
    if (paren === -1) return dollar;
    return Math.min(dollar, paren);
  },
  tokenizer(src: string) {
    // $...$ syntax
    const matchDollar = /^\$([^\n$]+?)\$/.exec(src);
    if (matchDollar) {
      return {
        type: 'mathInline',
        raw: matchDollar[0],
        formula: matchDollar[1].trim(),
      };
    }
    // \(...\) syntax
    const matchParen = /^\\\(([^\n]+?)\\\)/.exec(src);
    if (matchParen) {
      return {
        type: 'mathInline',
        raw: matchParen[0],
        formula: matchParen[1].trim(),
      };
    }
    return undefined;
  },
  renderer(token: any) {
    return `<math-inline>${encodeURIComponent(token.formula)}</math-inline>`;
  },
};

// mathBlock must come before mathInline so $$ is not matched as two $
marked.use({extensions: [mathBlock, mathInline]});
