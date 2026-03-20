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
    return src.indexOf('$$');
  },
  tokenizer(src: string) {
    const match = /^\$\$([\s\S]+?)\$\$/.exec(src);
    if (match) {
      return {
        type: 'mathBlock',
        raw: match[0],
        formula: match[1].trim(),
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
    return src.indexOf('$');
  },
  tokenizer(src: string) {
    const match = /^\$([^\n$]+?)\$/.exec(src);
    if (match) {
      return {
        type: 'mathInline',
        raw: match[0],
        formula: match[1].trim(),
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
